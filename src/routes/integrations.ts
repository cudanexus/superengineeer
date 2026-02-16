import { Router } from 'express';
import path from 'path';
import {
  GitHubCLIService,
  RepoListOptions,
  RepoSearchOptions,
  IssueListOptions,
  IssueCreateOptions,
  PRListOptions,
} from '../services/github-cli-service';
import { ProjectService } from '../services/project';
import { ProjectRepository } from '../repositories';
import { asyncHandler, ValidationError } from '../utils/errors';
import { WebSocketMessage } from '../websocket/websocket-server';

export interface IntegrationsRouterDependencies {
  githubCLIService: GitHubCLIService;
  projectService: ProjectService;
  projectRepository: ProjectRepository;
  broadcast?: (message: WebSocketMessage) => void;
}

export function createIntegrationsRouter(deps: IntegrationsRouterDependencies): Router {
  const router = Router();
  const { githubCLIService, projectService, projectRepository, broadcast } = deps;

  router.get('/github/status', asyncHandler(async (_req, res) => {
    const status = await githubCLIService.getStatus();
    res.json(status);
  }));

  router.get('/github/repos', asyncHandler(async (req, res) => {
    const options: RepoListOptions = {
      owner: req.query['owner'] as string | undefined,
      language: req.query['language'] as string | undefined,
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
    };

    const repos = await githubCLIService.listRepos(options);
    res.json(repos);
  }));

  router.get('/github/repos/search', asyncHandler(async (req, res) => {
    const query = req.query['query'] as string | undefined;

    if (!query) {
      throw new ValidationError('query parameter is required');
    }

    const options: RepoSearchOptions = {
      query,
      language: req.query['language'] as string | undefined,
      sort: req.query['sort'] as 'stars' | 'forks' | 'updated' | undefined,
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
    };

    const repos = await githubCLIService.searchRepos(options);
    res.json(repos);
  }));

  router.post('/github/clone', asyncHandler(async (req, res) => {
    const { repo, targetDir, branch, projectName } = req.body as {
      repo?: string;
      targetDir?: string;
      branch?: string;
      projectName?: string;
    };

    validateCloneInput(repo, targetDir);

    const repoName = projectName || extractRepoName(repo!);
    const clonePath = path.join(targetDir!, repoName);

    await githubCLIService.cloneRepo(
      { repo: repo!, targetDir: clonePath, branch },
      (progress) => {
        broadcast?.({
          type: 'github_clone_progress',
          data: { repo: repo!, ...progress },
        });
      }
    );

    const result = await projectService.createProject({
      name: projectName || repoName,
      path: clonePath,
      createNew: false,
    });

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, project: result.project });
  }));

  // =========================================================================
  // GitHub Issues
  // =========================================================================

  router.get('/github/issues', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    const options: IssueListOptions = {
      repo,
      state: (req.query['state'] as 'open' | 'closed' | 'all') || undefined,
      label: req.query['label'] as string | undefined,
      assignee: req.query['assignee'] as string | undefined,
      milestone: req.query['milestone'] as string | undefined,
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
    };

    const issues = await githubCLIService.listIssues(options);
    res.json(issues);
  }));

  router.get('/github/issues/:issueNumber', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;
    const issueNumber = parseInt(req.params['issueNumber'] as string, 10);

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    if (isNaN(issueNumber)) {
      throw new ValidationError('issueNumber must be a number');
    }

    const detail = await githubCLIService.viewIssue({ repo, issueNumber });
    res.json(detail);
  }));

  router.post('/github/issues/:issueNumber/close', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;
    const issueNumber = parseInt(req.params['issueNumber'] as string, 10);

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    if (isNaN(issueNumber)) {
      throw new ValidationError('issueNumber must be a number');
    }

    await githubCLIService.closeIssue(repo, issueNumber);
    res.json({ success: true });
  }));

  router.post('/github/issues/:issueNumber/comment', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;
    const issueNumber = parseInt(req.params['issueNumber'] as string, 10);
    const { body } = req.body as { body?: string };

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    if (isNaN(issueNumber)) {
      throw new ValidationError('issueNumber must be a number');
    }

    if (!body) {
      throw new ValidationError('body is required');
    }

    await githubCLIService.commentOnIssue(repo, issueNumber, body);
    res.json({ success: true });
  }));

  router.post('/github/issues', asyncHandler(async (req, res) => {
    const { repo, title, body, labels, assignees, milestone } = req.body as {
      repo?: string;
      title?: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: string;
    };

    if (!repo) {
      throw new ValidationError('repo is required');
    }

    if (!title) {
      throw new ValidationError('title is required');
    }

    const options: IssueCreateOptions = {
      repo,
      title,
      body: body || '',
      labels: labels || [],
      assignees: assignees || [],
      milestone: milestone || undefined,
    };

    const issue = await githubCLIService.createIssue(options);
    res.json(issue);
  }));

  router.get('/github/labels', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    const labels = await githubCLIService.listLabels(repo);
    res.json(labels);
  }));

  router.get('/github/milestones', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    const milestones = await githubCLIService.listMilestones(repo);
    res.json(milestones);
  }));

  router.get('/github/collaborators', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    const collaborators = await githubCLIService.listCollaborators(repo);
    res.json(collaborators);
  }));

  // =========================================================================
  // GitHub Pull Requests
  // =========================================================================

  router.post('/github/pr', asyncHandler(async (req, res) => {
    const { repo, title, body, base, head, draft, projectId } = req.body as {
      repo?: string;
      title?: string;
      body?: string;
      base?: string;
      head?: string;
      draft?: boolean;
      projectId?: string;
    };

    if (!repo) {
      throw new ValidationError('repo is required');
    }

    if (!title) {
      throw new ValidationError('title is required');
    }

    let cwd: string | undefined;

    if (projectId) {
      const project = await projectRepository.findById(projectId);

      if (project) {
        cwd = project.path;
      }
    }

    const pr = await githubCLIService.createPR({
      repo,
      title,
      body: body || '',
      base,
      head,
      draft,
      cwd,
    });

    res.json(pr);
  }));

  router.get('/github/pulls', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    const options: PRListOptions = {
      repo,
      state: (req.query['state'] as PRListOptions['state']) || undefined,
      limit: req.query['limit']
        ? parseInt(req.query['limit'] as string, 10)
        : undefined,
    };

    const pulls = await githubCLIService.listPRs(options);
    res.json(pulls);
  }));

  router.get('/github/pulls/:prNumber', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;
    const prNumber = parseInt(req.params['prNumber'] as string, 10);

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    if (isNaN(prNumber)) {
      throw new ValidationError('prNumber must be a number');
    }

    const detail = await githubCLIService.viewPR({ repo, prNumber });
    res.json(detail);
  }));

  router.post('/github/pulls/:prNumber/comment', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;
    const prNumber = parseInt(req.params['prNumber'] as string, 10);
    const { body } = req.body as { body?: string };

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    if (isNaN(prNumber)) {
      throw new ValidationError('prNumber must be a number');
    }

    if (!body) {
      throw new ValidationError('body is required');
    }

    await githubCLIService.commentOnPR(repo, prNumber, body);
    res.json({ success: true });
  }));

  router.post('/github/pulls/:prNumber/merge', asyncHandler(async (req, res) => {
    const repo = req.query['repo'] as string | undefined;
    const prNumber = parseInt(req.params['prNumber'] as string, 10);
    const { method, isDraft } = req.body as {
      method?: 'merge' | 'squash' | 'rebase';
      isDraft?: boolean;
    };

    if (!repo) {
      throw new ValidationError('repo parameter is required');
    }

    if (isNaN(prNumber)) {
      throw new ValidationError('prNumber must be a number');
    }

    if (isDraft) {
      await githubCLIService.markPRReady(repo, prNumber);
    }

    await githubCLIService.mergePR(repo, prNumber, method);
    res.json({ success: true });
  }));

  return router;
}

function validateCloneInput(repo?: string, targetDir?: string): void {
  if (!repo) {
    throw new ValidationError('repo is required');
  }

  if (!targetDir) {
    throw new ValidationError('targetDir is required');
  }

  if (!path.isAbsolute(targetDir)) {
    throw new ValidationError('targetDir must be an absolute path');
  }
}

function extractRepoName(repo: string): string {
  // Handle "owner/name" or full URL
  const parts = repo.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1] || repo;
}
