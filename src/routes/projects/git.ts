import { Router, Request, Response } from 'express';
import { asyncHandler, NotFoundError, getLogger } from '../../utils';
import {
  ProjectRouterDependencies,
  GitStageBody,
  GitCommitBody,
  GitBranchBody,
  GitCheckoutBody,
  GitPushBody,
  GitPullBody,
  GitTagBody,
  GitPushTagBody
} from './types';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import {
  gitStageSchema,
  gitCommitSchema,
  gitBranchSchema,
  gitCheckoutSchema,
  gitPushSchema,
  gitPullSchema,
  gitTagSchema,
  gitPushTagSchema,
  projectAndTagNameSchema,
  fileDiffQuerySchema
} from './schemas';
import { AgentManager, AgentManagerEvents } from '../../agents';

const COMMIT_MSG_TIMEOUT_MS = 60000;
const MAX_DIFF_LENGTH = 15000;
const logger = getLogger('git-routes');

function buildCommitMessagePrompt(stagedFiles: string, diff: string): string {
  const truncatedDiff = diff.length > MAX_DIFF_LENGTH
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n... (truncated)'
    : diff;

  return `Generate a concise git commit message for the following staged changes.

Staged files:
${stagedFiles}

Staged diff:
\`\`\`
${truncatedDiff}
\`\`\`

Rules:
- Follow conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Keep the first line under 72 characters
- Be specific about what changed
- Use present tense ("add" not "added")
- If there are multiple significant changes, add a blank line followed by bullet points

Output ONLY the commit message, nothing else. Do not wrap it in quotes or backticks. No explanation.`;
}

async function collectOneOffOutput(
  agentManager: AgentManager,
  projectId: string,
  message: string
): Promise<string> {
  const oneOffId = await agentManager.startOneOffAgent({
    projectId,
    message,
  });

  return new Promise<string>((resolve, reject) => {
    let fullContent = '';

    const timeout = setTimeout(() => {
      cleanup();
      agentManager.stopOneOffAgent(oneOffId).catch(() => {});
      reject(new Error('Commit message generation timed out'));
    }, COMMIT_MSG_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(timeout);
      agentManager.off('oneOffMessage', messageHandler);
      agentManager.off('oneOffStatus', statusHandler);
      agentManager.off('oneOffWaiting', waitingHandler);
    };

    const messageHandler: AgentManagerEvents['oneOffMessage'] = (msgOneOffId, msg) => {
      if (msgOneOffId !== oneOffId) return;
      if (msg.type === 'system') return;

      if (msg.content) {
        fullContent += msg.content;
      }
    };

    const statusHandler: AgentManagerEvents['oneOffStatus'] = (msgOneOffId, status) => {
      if (msgOneOffId !== oneOffId) return;

      if (status === 'stopped') {
        cleanup();
        resolve(fullContent.trim());
      } else if (status === 'error') {
        cleanup();
        reject(new Error('Agent encountered an error'));
      }
    };

    const waitingHandler: AgentManagerEvents['oneOffWaiting'] = (
      msgOneOffId, isWaiting, _version
    ) => {
      if (msgOneOffId !== oneOffId || !isWaiting) return;

      cleanup();
      resolve(fullContent.trim());
      agentManager.stopOneOffAgent(oneOffId).catch(() => {});
    };

    agentManager.on('oneOffMessage', messageHandler);
    agentManager.on('oneOffStatus', statusHandler);
    agentManager.on('oneOffWaiting', waitingHandler);
  });
}

export function createGitRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const {
    projectRepository,
    gitService,
    agentManager,
  } = deps;

  // Get git status
  router.get('/status', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;

    const status = await gitService.getStatus((project).path);
    res.json(status);
  }));

  // Get git branches
  router.get('/branches', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;

    const branches = await gitService.getBranches((project).path);
    res.json(branches);
  }));

  // Get git diff
  router.get('/diff', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const staged = req.query.staged === 'true';

    const diff = await gitService.getDiff((project).path, staged);
    res.json({ diff });
  }));

  // Stage specific files
  router.post('/stage', validateBody(gitStageSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as GitStageBody;
    const { paths } = body;

    await gitService.stageFiles((project).path, paths!);
    res.json({ success: true });
  }));

  // Stage all files
  router.post('/stage-all', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;

    await gitService.stageAll((project).path);
    res.json({ success: true });
  }));

  // Unstage specific files
  router.post('/unstage', validateBody(gitStageSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as GitStageBody;
    const { paths } = body;

    await gitService.unstageFiles((project).path, paths!);
    res.json({ success: true });
  }));

  // Unstage all files
  router.post('/unstage-all', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;

    await gitService.unstageAll((project).path);
    res.json({ success: true });
  }));

  // Create a commit
  router.post('/commit', validateBody(gitCommitSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitCommitBody;
    const { message } = body;


    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await gitService.commit((project).path, message!);
    res.json(result);
  }));

  // Create a new branch
  router.post('/branch', validateBody(gitBranchSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitBranchBody;
    const { name, checkout } = body;


    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await gitService.createBranch((project).path, name!, checkout);
    res.json({ success: true });
  }));

  // Checkout a branch
  router.post('/checkout', validateBody(gitCheckoutSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitCheckoutBody;
    const { branch } = body;


    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await gitService.checkout((project).path, branch!);
    res.json({ success: true });
  }));

  // Push to remote
  router.post('/push', validateBody(gitPushSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitPushBody;
    const { remote = 'origin', branch, setUpstream } = body;

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await gitService.push((project).path, remote, branch, setUpstream);
    res.json(result);
  }));

  // Pull from remote
  router.post('/pull', validateBody(gitPullSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitPullBody;
    const { remote = 'origin', branch } = body;

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await gitService.pull((project).path, remote, branch);
    res.json(result);
  }));

  // Get file diff
  router.get('/file-diff', validateQuery(fileDiffQuerySchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const filePath = req.query['path'] as string;
    const staged = req.query['staged'] === 'true';


    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const diff = await gitService.getFileDiff((project).path, filePath, staged);
    res.json({ filePath, diff });
  }));

  // Discard changes to specific files
  router.post('/discard', validateBody(gitStageSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as GitStageBody;
    const { paths } = body;

    await gitService.discardChanges((project).path, paths!);
    res.json({ success: true });
  }));

  // List tags
  router.get('/tags', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;

    const tags = await gitService.listTags((project).path);
    res.json({ tags });
  }));

  // Create a tag
  router.post('/tags', validateBody(gitTagSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitTagBody;
    const { name, message } = body;


    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await gitService.createTag((project).path, name, message);
    res.json({ success: true });
  }));

  // Push a tag to remote
  router.post('/tags/:name/push', validateParams(projectAndTagNameSchema), validateBody(gitPushTagSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const tagName = req.params['name'] as string;
    const body = req.body as GitPushTagBody;
    const { remote = 'origin' } = body;

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await gitService.pushTag((project).path, tagName, remote);
    res.json({ success: true });
  }));

  // Generate commit message using one-off agent
  router.post('/generate-commit-message', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const projectPath = (project).path;
    const projectId = req.params['id'] as string;

    const status = await gitService.getStatus(projectPath);

    if (!status.staged || status.staged.length === 0) {
      res.status(400).json({ error: 'No staged files to generate commit message for' });
      return;
    }

    const stagedFiles = status.staged.map(
      (f: { status: string; path: string }) => `${f.status}: ${f.path}`
    ).join('\n');

    const diff = await gitService.getDiff(projectPath, true);
    const prompt = buildCommitMessagePrompt(stagedFiles, diff);

    try {
      const rawOutput = await collectOneOffOutput(agentManager, projectId, prompt);
      const commitMessage = extractCommitMessage(rawOutput);
      res.json({ message: commitMessage });
    } catch (err) {
      logger.error('Failed to generate commit message', {
        projectId,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate commit message'
      });
    }
  }));

  return router;
}

function extractCommitMessage(rawOutput: string): string {
  // Remove common wrapping artifacts from Claude's output
  let message = rawOutput.trim();

  // Remove wrapping backticks if present
  if (message.startsWith('```') && message.endsWith('```')) {
    message = message.slice(3, -3).trim();
  }

  // Remove wrapping quotes if present
  if ((message.startsWith('"') && message.endsWith('"')) ||
      (message.startsWith("'") && message.endsWith("'"))) {
    message = message.slice(1, -1).trim();
  }

  return message;
}