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
  GitMergeToMainBody,
  GitTagBody,
  GitPushTagBody,
  GitUserIdentityBody,
  GitCreateGithubRepoBody
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
  gitMergeToMainSchema,
  gitTagSchema,
  gitPushTagSchema,
  gitUserIdentitySchema,
  gitCreateGithubRepoSchema,
  projectAndTagNameSchema,
  fileDiffQuerySchema
} from './schemas';
import { AgentManager, AgentManagerEvents } from '../../agents';
import { ConversationRepository } from '../../repositories';
import { GitService } from '../../services/git-service';

const ONE_OFF_TIMEOUT_MS = 120000;
const MAX_DIFF_LENGTH = 15000;
const logger = getLogger('git-routes');

function buildCommitMessagePrompt(userMessage: string): string {
  const compactUserMessage = String(userMessage || '').trim();

  return `Generate a concise git commit message based ONLY on the user's request below.

User request:
${compactUserMessage || 'workspace update'}

Rules:
- Follow conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Keep the first line under 72 characters
- Be specific about what changed
- Use present tense ("add" not "added")
- Output a SINGLE line only
- Do not include footers (e.g., Co-Authored-By, Signed-off-by)

Output ONLY the commit message, nothing else.`;
}

function buildPRDescriptionPrompt(diff: string, conversationSummary: string): string {
  const truncatedDiff = diff.length > MAX_DIFF_LENGTH
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n... (truncated)'
    : diff;

  return `Generate a pull request title and description for the following changes.

Diff:
\`\`\`
${truncatedDiff}
\`\`\`

${conversationSummary ? `Conversation context:\n${conversationSummary}\n` : ''}
Rules:
- Output a JSON object with "title" and "body" fields
- Title: short (under 72 chars), conventional commit style (feat/fix/refactor/etc)
- Body: Markdown with ## Summary section (2-4 bullet points) and ## Changes section
- Focus on the "why" and user-facing impact, not low-level code details
- Output ONLY the JSON object, nothing else`;
}

interface CollectOptions {
  projectId: string;
  message: string;
  label?: string;
}

const CONTENT_MESSAGE_TYPES = new Set(['stdout', 'result']);

async function collectOneOffOutput(
  agentManager: AgentManager,
  options: CollectOptions
): Promise<string> {
  const { projectId, message, label } = options;

  const oneOffId = await agentManager.startOneOffAgent({
    projectId,
    message,
  });

  return new Promise<string>((resolve, reject) => {
    let fullContent = '';

    const timeout = setTimeout(() => {
      cleanup();
      agentManager.stopOneOffAgent(oneOffId).catch(() => {});
      reject(new Error(`${label || 'Generation'} timed out`));
    }, ONE_OFF_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(timeout);
      agentManager.off('oneOffMessage', messageHandler);
      agentManager.off('oneOffStatus', statusHandler);
      agentManager.off('oneOffWaiting', waitingHandler);
    };

    const messageHandler: AgentManagerEvents['oneOffMessage'] = (msgOneOffId, msg) => {
      if (msgOneOffId !== oneOffId) return;

      if (CONTENT_MESSAGE_TYPES.has(msg.type) && msg.content) {
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
    conversationRepository,
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

  // Get recent commits
  router.get('/commits', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const limit = Math.max(1, Math.min(100, Number(req.query['limit'] || 30)));
    const commits = await gitService.listCommits((project).path, limit);
    res.json({ commits });
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
    const { message, allowEmpty } = body;


    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await gitService.commit((project).path, message!, !!allowEmpty);
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
    const { remote = 'origin', branch, rebase } = body;

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await gitService.pull((project).path, remote, branch, rebase);
    res.json(result);
  }));

  // Merge current/source branch into main and optionally push
  router.post('/merge-to-main', validateBody(gitMergeToMainSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitMergeToMainBody;
    const {
      sourceBranch,
      targetBranch = 'master',
      push = true,
      remote = 'origin',
    } = body;

    const project = await projectRepository.findById(id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await gitService.mergeToMain(
      (project).path,
      sourceBranch,
      targetBranch,
      push,
      remote
    );
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

    const { diff } = await gitService.getFileDiff((project).path, filePath, staged);
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

  // Delete a local tag
  router.delete('/tags/:name', validateParams(projectAndTagNameSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const tagName = req.params['name'] as string;

    await gitService.deleteTag((project).path, tagName);
    res.json({ success: true });
  }));

  // Generate commit message using one-off agent
  router.post('/generate-commit-message', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params['id'] as string;
    const userMessage = String((req.body as { message?: unknown } | undefined)?.message || '').trim();
    const prompt = buildCommitMessagePrompt(userMessage);

    try {
      const rawOutput = await collectOneOffOutput(agentManager, {
        projectId, message: prompt, label: 'Commit message generation',
      });
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

  // Generate PR title and description using one-off agent
  router.post('/generate-pr-description', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const projectPath = project.path;
    const projectId = req.params['id'] as string;

    const diff = await buildDiffForPR(gitService, projectPath);

    if (!diff) {
      res.status(400).json({ error: 'No changes found between current branch and base' });
      return;
    }

    const conversationSummary = await buildConversationSummary(
      conversationRepository, projectId
    );

    const prompt = buildPRDescriptionPrompt(diff, conversationSummary);

    try {
      const rawOutput = await collectOneOffOutput(agentManager, {
        projectId, message: prompt, label: 'PR description generation',
      });
      const parsed = extractPRDescription(rawOutput);
      res.json(parsed);
    } catch (err) {
      logger.error('Failed to generate PR description', {
        projectId,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate PR description'
      });
    }
  }));

  // Get GitHub repo identifier from remote URL
  router.get('/github-repo', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const remoteUrl = await gitService.getRemoteUrl(project.path);

    if (!remoteUrl) {
      res.json({ repo: null });
      return;
    }

    const repo = extractGitHubRepo(remoteUrl);
    res.json({ repo });
  }));

  // Get git user name
  router.get('/user-name', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const name = await gitService.getUserName(project.path);
    res.json({ name });
  }));

  // Get git user identity
  router.get('/user-identity', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const name = await gitService.getUserName(project.path);
    const email = await gitService.getUserEmail(project.path);
    res.json({ name, email });
  }));

  // Set git user identity (repo-local)
  router.post('/user-identity', validateBody(gitUserIdentitySchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as GitUserIdentityBody;
    const { name, email } = body;

    await gitService.setUserIdentity(project.path, name!, email!);
    res.json({ success: true });
  }));

  // Create GitHub repository and configure remote
  router.post('/github/repo', validateBody(gitCreateGithubRepoSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as GitCreateGithubRepoBody;
    const { name, remote = 'origin', private: isPrivate = true } = body;

    const result = await gitService.createGithubRepoRemote(project.path, name!, {
      remote,
      isPrivate,
    });
    res.json({ success: true, ...result });
  }));

  return router;
}

function extractGitHubRepo(remoteUrl: string): string | null {
  // Match SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);

  if (sshMatch) {
    return sshMatch[1]!;
  }

  // Match HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)/);

  if (httpsMatch) {
    return httpsMatch[1]!;
  }

  return null;
}

function extractCommitMessage(rawOutput: string): string {
  let message = String(rawOutput || '').trim();
  if (!message) return 'chore: update workspace';

  // Remove fenced blocks if present
  message = message.replace(/^```[\w-]*\s*/m, '').replace(/```$/m, '').trim();
  // Normalize lines and drop noisy trailer/footer lines
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^co-authored-by:/i.test(line))
    .filter((line) => !/^signed-off-by:/i.test(line))
    .filter((line) => !/^\[pair:[^\]]+\]$/i.test(line));

  const firstLine = (lines[0] || '').trim();
  const unquoted = firstLine.replace(/^["'`]+|["'`]+$/g, '').trim();
  const withoutPairSuffix = unquoted.replace(/\s*\[pair:[^\]]+\]\s*$/i, '').trim();
  const compact = withoutPairSuffix.replace(/\s+/g, ' ');

  return compact || 'chore: update workspace';
}

async function buildDiffForPR(
  gitService: GitService,
  projectPath: string
): Promise<string | null> {
  try {
    const branches = await gitService.getBranches(projectPath);
    const currentBranch = branches.current;
    const baseBranch = branches.local.includes('main') ? 'main' : 'master';

    if (currentBranch === baseBranch) {
      const diff = await gitService.getDiff(projectPath, true);
      return diff || null;
    }

    const git = (gitService as { getGit?(p: string): unknown }).getGit
      ? undefined
      : null;

    if (git === null) {
      const stagedDiff = await gitService.getDiff(projectPath, true);
      const unstagedDiff = await gitService.getDiff(projectPath, false);
      return stagedDiff || unstagedDiff || null;
    }

    const stagedDiff = await gitService.getDiff(projectPath, true);
    const unstagedDiff = await gitService.getDiff(projectPath, false);
    return stagedDiff || unstagedDiff || null;
  } catch {
    return null;
  }
}

const MAX_CONVERSATION_CHARS = 5000;

async function buildConversationSummary(
  conversationRepository: ConversationRepository,
  projectId: string
): Promise<string> {
  try {
    const messages = await conversationRepository.getMessagesLegacy(
      projectId, 20
    );

    if (!messages || messages.length === 0) return '';

    const summary = messages
      .filter(m => m.type === 'user' || m.type === 'stdout')
      .map(m => `[${m.type}]: ${m.content || ''}`)
      .join('\n');

    if (summary.length > MAX_CONVERSATION_CHARS) {
      return summary.substring(0, MAX_CONVERSATION_CHARS) + '\n... (truncated)';
    }

    return summary;
  } catch {
    return '';
  }
}

interface PRDescription {
  title: string;
  body: string;
}

function extractPRDescription(rawOutput: string): PRDescription {
  let text = rawOutput.trim();

  // Remove markdown code fence if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (jsonMatch) {
    text = jsonMatch[1]!.trim();
  }

  try {
    const parsed = JSON.parse(text) as { title?: string; body?: string };
    return {
      title: parsed.title || 'Update',
      body: parsed.body || '',
    };
  } catch {
    return {
      title: text.split('\n')[0]?.substring(0, 72) || 'Update',
      body: text,
    };
  }
}
