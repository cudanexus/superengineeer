import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitError } from '../utils/errors';

const execFileAsync = promisify(execFile);

export interface GitFileEntry {
  path: string;
  name: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';
}

export interface GitStatus {
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
  isRepo: boolean;
}

export interface BranchInfo {
  current: string;
  local: string[];
  remote: string[];
}

export interface CommitResult {
  hash: string;
  message: string;
}

export interface FileDiffResult {
  diff: string;
  filePath: string;
}

export interface GitCommitEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitService {
  getStatus(projectPath: string): Promise<GitStatus>;
  getBranches(projectPath: string): Promise<BranchInfo>;
  stageFiles(projectPath: string, paths: string[]): Promise<void>;
  unstageFiles(projectPath: string, paths: string[]): Promise<void>;
  stageAll(projectPath: string): Promise<void>;
  unstageAll(projectPath: string): Promise<void>;
  commit(projectPath: string, message: string, allowEmpty?: boolean): Promise<CommitResult>;
  createBranch(projectPath: string, name: string, checkout?: boolean): Promise<void>;
  checkout(projectPath: string, branch: string): Promise<void>;
  push(projectPath: string, remote?: string, branch?: string, setUpstream?: boolean): Promise<string>;
  pull(projectPath: string, remote?: string, branch?: string, rebase?: boolean): Promise<string>;
  mergeToMain(
    projectPath: string,
    sourceBranch?: string,
    targetBranch?: string,
    push?: boolean,
    remote?: string
  ): Promise<{ sourceBranch: string; targetBranch: string; pushed: boolean }>;
  getDiff(projectPath: string, staged?: boolean): Promise<string>;
  listCommits(projectPath: string, limit?: number, offset?: number): Promise<{ commits: GitCommitEntry[]; total: number }>;
  getFileDiff(projectPath: string, filePath: string, staged?: boolean): Promise<FileDiffResult>;
  discardChanges(projectPath: string, paths: string[]): Promise<void>;
  isGitRepo(projectPath: string): Promise<boolean>;
  listTags(projectPath: string): Promise<string[]>;
  createTag(projectPath: string, name: string, message?: string): Promise<void>;
  pushTag(projectPath: string, name: string, remote?: string): Promise<string>;
  deleteTag(projectPath: string, name: string): Promise<void>;
  getRemoteUrl(projectPath: string, remote?: string): Promise<string | null>;
  getUserName(projectPath: string): Promise<string | null>;
  getUserEmail(projectPath: string): Promise<string | null>;
  setUserIdentity(projectPath: string, name: string, email: string): Promise<void>;
  createGithubRepoRemote(
    projectPath: string,
    repoName: string,
    options?: { remote?: string; isPrivate?: boolean }
  ): Promise<{ repo: string; remoteUrl: string }>;
}

export class SimpleGitService implements GitService {
  private toGitErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return String(error);
  }

  private getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath);
  }

  private async ensureGitRepo(projectPath: string): Promise<void> {
    const git = this.getGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (isRepo) return;

    try {
      await git.init();
    } catch (error) {
      throw new GitError(`Failed to initialize git repository: ${this.toGitErrorMessage(error)}`);
    }
  }

  private async runGh(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('gh', args, { cwd, encoding: 'utf-8' });
  }

  private isNoUpstreamError(errorText: string): boolean {
    const text = errorText.toLowerCase();
    return text.includes('has no upstream branch')
      || text.includes('no upstream branch')
      || text.includes('--set-upstream');
  }

  private extractBranchFromNoUpstreamError(errorText: string): string | null {
    const match = errorText.match(/current branch\s+([^\s]+)\s+has no upstream branch/i);
    return match?.[1] || null;
  }

  private async localBranchExists(git: SimpleGit, branch: string): Promise<boolean> {
    try {
      const local = await git.branchLocal();
      return local.all.includes(branch);
    } catch {
      return false;
    }
  }

  private async hasAnyCommit(git: SimpleGit): Promise<boolean> {
    try {
      await git.raw(['rev-parse', '--verify', 'HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveCurrentBranch(git: SimpleGit, errorText?: string): Promise<string | null> {
    const fromError = errorText ? this.extractBranchFromNoUpstreamError(errorText) : null;
    if (fromError && await this.localBranchExists(git, fromError)) return fromError;

    try {
      const current = (await git.branchLocal()).current;
      if (current) return current;
    } catch {
      // fall through
    }

    try {
      const raw = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      const parsed = raw.trim();
      if (parsed && parsed !== 'HEAD') return parsed;
    } catch {
      // fall through
    }

    return null;
  }

  private isNonFastForwardError(errorText: string): boolean {
    const text = errorText.toLowerCase();
    return text.includes('fetch first')
      || text.includes('non-fast-forward')
      || text.includes('failed to push some refs');
  }

  private isMissingRemoteRefError(errorText: string): boolean {
    return errorText.toLowerCase().includes("couldn't find remote ref");
  }

  private isGithubHttpsAuthError(errorText: string): boolean {
    const text = errorText.toLowerCase();
    return text.includes("could not read username for 'https://github.com'")
      || text.includes('authentication failed for')
      || text.includes('fatal: credential');
  }

  private async setupGitHubCredentialHelper(projectPath: string): Promise<void> {
    try {
      await this.runGh(['auth', 'setup-git'], projectPath);
    } catch (error) {
      throw new GitError(
        `Failed to configure git credential helper via gh. Run "gh auth login" and "gh auth setup-git". ${this.toGitErrorMessage(error)}`
      );
    }
  }

  private async getGitHubAuthToken(projectPath: string): Promise<string> {
    try {
      const { stdout } = await this.runGh(['auth', 'token'], projectPath);
      const token = stdout.trim();
      if (!token) {
        throw new Error('empty token');
      }
      return token;
    } catch (error) {
      throw new GitError(`Failed to get GitHub auth token from gh: ${this.toGitErrorMessage(error)}`);
    }
  }

  private buildTokenRemoteUrl(remoteUrl: string, token: string): string | null {
    if (!remoteUrl.startsWith('https://github.com/')) {
      return null;
    }

    const encodedToken = encodeURIComponent(token);
    return remoteUrl.replace('https://', `https://x-access-token:${encodedToken}@`);
  }

  private async pushWithTemporaryTokenRemote(
    projectPath: string,
    remote: string,
    args: string[]
  ): Promise<string> {
    const git = this.getGit(projectPath);
    const remotes = await git.getRemotes(true);
    const targetRemote = remotes.find(r => r.name === remote);
    const originalUrl = targetRemote?.refs?.push || targetRemote?.refs?.fetch || null;

    if (!originalUrl) {
      throw new GitError(`Remote "${remote}" not found.`);
    }

    const token = await this.getGitHubAuthToken(projectPath);
    const tokenRemoteUrl = this.buildTokenRemoteUrl(originalUrl, token);
    if (!tokenRemoteUrl) {
      throw new GitError(
        `Remote "${remote}" is not an HTTPS GitHub URL. Use HTTPS remote or configure SSH keys.`
      );
    }

    await git.raw(['remote', 'set-url', remote, tokenRemoteUrl]);
    try {
      return await git.raw(args);
    } finally {
      await git.raw(['remote', 'set-url', remote, originalUrl]);
    }
  }

  private async rebaseAndRetryPush(
    git: SimpleGit,
    remote: string,
    branch: string | undefined,
    setUpstream: boolean
  ): Promise<string> {
    const targetBranch = branch || (await git.branchLocal()).current;
    if (!targetBranch) {
      throw new GitError('Failed to determine current branch for rebase/push recovery.');
    }

    try {
      await git.raw(['pull', '--rebase', remote, targetBranch]);
    } catch (error) {
      const message = this.toGitErrorMessage(error);

      // Remote branch may not exist yet (e.g., remote only has main, local is master).
      // In that case, skip rebase and attempt first push with upstream.
      if (!this.isMissingRemoteRefError(message)) {
        throw new GitError(
          `Push rejected and automatic rebase failed. Resolve conflicts, then push again: ${message}`
        );
      }
    }

    const retryPushArgs = ['push'];
    if (setUpstream) {
      retryPushArgs.push('-u');
    }
    retryPushArgs.push(remote, targetBranch);
    return await git.raw(retryPushArgs);
  }

  private toRepoSlug(projectPath: string): string {
    const base = path.basename(projectPath);
    return base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'project';
  }

  async createGithubRepoRemote(
    projectPath: string,
    repoName: string,
    options?: { remote?: string; isPrivate?: boolean }
  ): Promise<{ repo: string; remoteUrl: string }> {
    await this.ensureGitRepo(projectPath);

    const remote = options?.remote || 'origin';
    const isPrivate = options?.isPrivate !== false;
    const repo = this.toRepoSlug(repoName);

    if (!repo) {
      throw new GitError('Repository name is required');
    }

    let owner = '';
    try {
      const { stdout } = await this.runGh(['api', 'user', '--jq', '.login'], projectPath);
      owner = stdout.trim();
    } catch (error) {
      throw new GitError(
        `Failed to detect GitHub account. Run "gh auth login" first. ${this.toGitErrorMessage(error)}`
      );
    }

    if (!owner) {
      throw new GitError('Failed to detect GitHub account. Run "gh auth login" first.');
    }

    try {
      await this.runGh(['api', 'user/repos', '-f', `name=${repo}`, '-F', `private=${isPrivate ? 'true' : 'false'}`], projectPath);
    } catch (error) {
      const msg = this.toGitErrorMessage(error);
      const lower = msg.toLowerCase();
      const maybeAlreadyExists = lower.includes('name already exists')
        || lower.includes('already exists')
        || lower.includes('unprocessable entity')
        || lower.includes('http 422')
        || lower.includes('repository creation failed');

      if (!maybeAlreadyExists) {
        throw new GitError(`Failed to create GitHub repository "${owner}/${repo}": ${msg}`);
      }

      try {
        await this.runGh(['repo', 'view', `${owner}/${repo}`, '--json', 'name'], projectPath);
      } catch {
        throw new GitError(`Failed to create GitHub repository "${owner}/${repo}": ${msg}`);
      }
    }

    const remoteUrl = `https://github.com/${owner}/${repo}.git`;
    try {
      const git = this.getGit(projectPath);
      const remotes = await git.getRemotes(true);
      const hasRemote = remotes.some(r => r.name === remote);

      if (hasRemote) {
        await git.raw(['remote', 'set-url', remote, remoteUrl]);
      } else {
        await git.addRemote(remote, remoteUrl);
      }
    } catch (error) {
      throw new GitError(`Failed to configure git remote "${remote}": ${this.toGitErrorMessage(error)}`);
    }

    return { repo: `${owner}/${repo}`, remoteUrl };
  }

  async isGitRepo(projectPath: string): Promise<boolean> {
    try {
      return await this.getGit(projectPath).checkIsRepo();
    } catch {
      return false;
    }
  }

  async getStatus(projectPath: string): Promise<GitStatus> {
    const isRepo = await this.isGitRepo(projectPath);

    if (!isRepo) {
      return { staged: [], unstaged: [], untracked: [], isRepo: false };
    }

    try {
      const status = await this.getGit(projectPath).status();
      return this.transformStatusResult(status);
    } catch {
      return { staged: [], unstaged: [], untracked: [], isRepo: true };
    }
  }

  private transformStatusResult(status: StatusResult): GitStatus {
    const staged: GitFileEntry[] = [];
    const unstaged: GitFileEntry[] = [];
    const untracked: GitFileEntry[] = [];

    for (const file of status.files) {
      const fileName = file.path.split('/').pop() || file.path;

      // Index status (staged)
      if (file.index && file.index !== ' ' && file.index !== '?') {
        staged.push({
          path: file.path,
          name: fileName,
          status: this.mapStatusChar(file.index),
        });
      }

      // Working dir status (unstaged)
      if (file.working_dir && file.working_dir !== ' ' && file.working_dir !== '?') {
        unstaged.push({
          path: file.path,
          name: fileName,
          status: this.mapStatusChar(file.working_dir),
        });
      }

      // Untracked
      if (file.index === '?' && file.working_dir === '?') {
        untracked.push({
          path: file.path,
          name: fileName,
          status: 'untracked',
        });
      }
    }

    return { staged, unstaged, untracked, isRepo: true };
  }

  private mapStatusChar(char: string): GitFileEntry['status'] {
    switch (char) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      default: return 'modified';
    }
  }

  async getBranches(projectPath: string): Promise<BranchInfo> {
    const isRepo = await this.isGitRepo(projectPath);

    if (!isRepo) {
      return { current: '', local: [], remote: [] };
    }

    try {
      const git = this.getGit(projectPath);
      const localBranches = await git.branchLocal();

      let remote: string[] = [];

      try {
        const remoteBranches = await git.branch(['-r']);
        remote = remoteBranches.all.filter(b => b.length > 0);
      } catch {
        // No remotes configured
      }

      return {
        current: localBranches.current,
        local: localBranches.all,
        remote,
      };
    } catch {
      return { current: '', local: [], remote: [] };
    }
  }

  async stageFiles(projectPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    try {
      await this.getGit(projectPath).add(paths);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to stage files: ${message}`);
    }
  }

  async unstageFiles(projectPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    try {
      await this.getGit(projectPath).reset(['HEAD', '--', ...paths]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to unstage files: ${message}`);
    }
  }

  async stageAll(projectPath: string): Promise<void> {
    try {
      await this.getGit(projectPath).add(['-A']);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to stage all files: ${message}`);
    }
  }

  async unstageAll(projectPath: string): Promise<void> {
    try {
      await this.getGit(projectPath).reset(['HEAD']);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to unstage all files: ${message}`);
    }
  }

  async commit(projectPath: string, message: string, allowEmpty = false): Promise<CommitResult> {
    try {
      const git = this.getGit(projectPath);

      if (allowEmpty) {
        await git.raw(['commit', '--allow-empty', '-m', message]);
        const hash = (await git.revparse(['--short', 'HEAD'])).trim();
        return { hash, message };
      }

      const result = await git.commit(message);
      const hash = result.commit.substring(0, 7);
      return { hash, message };
    } catch (error) {
      throw new GitError(`Failed to commit: ${this.toGitErrorMessage(error)}`);
    }
  }

  async createBranch(projectPath: string, name: string, checkout = false): Promise<void> {
    try {
      const git = this.getGit(projectPath);

      if (checkout) {
        await git.checkoutLocalBranch(name);
      } else {
        await git.branch([name]);
      }
    } catch (error) {
      throw new GitError(`Failed to create branch: ${this.toGitErrorMessage(error)}`);
    }
  }

  async checkout(projectPath: string, branch: string): Promise<void> {
    try {
      await this.getGit(projectPath).checkout(branch);
    } catch (error) {
      throw new GitError(`Failed to checkout branch: ${this.toGitErrorMessage(error)}`);
    }
  }

  async push(
    projectPath: string,
    remote = 'origin',
    branch?: string,
    setUpstream = false
  ): Promise<string> {
    const args = ['push'];
    if (setUpstream) {
      args.push('-u');
    }
    args.push(remote);
    if (branch) {
      args.push(branch);
    }

    try {
      return await this.getGit(projectPath).raw(args);
    } catch (error) {
      const message = this.toGitErrorMessage(error);
      const git = this.getGit(projectPath);

      if (this.isGithubHttpsAuthError(message)) {
        await this.setupGitHubCredentialHelper(projectPath);
        try {
          return await git.raw(args);
        } catch (retryAuthError) {
          try {
            return await this.pushWithTemporaryTokenRemote(projectPath, remote, args);
          } catch (tokenAuthError) {
            throw new GitError(
              `Failed to push after configuring gh git auth: ${this.toGitErrorMessage(retryAuthError)}`
              + ` | Token fallback failed: ${this.toGitErrorMessage(tokenAuthError)}`
            );
          }
        }
      }

      if (message.toLowerCase().includes('src refspec') && message.toLowerCase().includes('does not match any')) {
        const hasCommit = await this.hasAnyCommit(git);
        if (!hasCommit) {
          throw new GitError('No commits found in this repository. Create a commit first, then push.');
        }
      }

      if (this.isNoUpstreamError(message)) {
        const headRetryArgs = ['push', '-u', remote, 'HEAD'];
        try {
          return await git.raw(headRetryArgs);
        } catch (headRetryError) {
          const headRetryMessage = this.toGitErrorMessage(headRetryError);
          const currentBranch = await this.resolveCurrentBranch(git, message);
          if (currentBranch) {
            const retryArgs = ['push', '-u', remote, currentBranch];
            try {
              return await git.raw(retryArgs);
            } catch (retryError) {
              const retryMessage = this.toGitErrorMessage(retryError);

              if (this.isNonFastForwardError(retryMessage)) {
                try {
                  return await this.rebaseAndRetryPush(git, remote, currentBranch, true);
                } catch (rebaseError) {
                  throw new GitError(`Failed to push with upstream after rebase: ${this.toGitErrorMessage(rebaseError)}`);
                }
              }

              throw new GitError(`Failed to push with upstream: ${retryMessage}`);
            }
          }

          throw new GitError(`Failed to push with upstream: ${headRetryMessage}`);
        }
      }

      if (this.isNonFastForwardError(message)) {
        try {
          return await this.rebaseAndRetryPush(git, remote, branch, setUpstream);
        } catch (rebaseError) {
          throw new GitError(`Failed to push after rebase: ${this.toGitErrorMessage(rebaseError)}`);
        }
      }

      throw new GitError(`Failed to push: ${message}`);
    }
  }

  async pull(projectPath: string, remote = 'origin', branch?: string, rebase = false): Promise<string> {
    try {
      const args = ['pull'];

      if (rebase) {
        args.push('--rebase');
      }

      args.push(remote);

      if (branch) {
        args.push(branch);
      }

      return await this.getGit(projectPath).raw(args);
    } catch (error) {
      throw new GitError(`Failed to pull: ${this.toGitErrorMessage(error)}`);
    }
  }

  async mergeToMain(
    projectPath: string,
    sourceBranch?: string,
    targetBranch = 'master',
    push = true,
    remote = 'origin'
  ): Promise<{ sourceBranch: string; targetBranch: string; pushed: boolean }> {
    try {
      const git = this.getGit(projectPath);
      const localBranches = await git.branchLocal();
      const current = localBranches.current;
      const source = sourceBranch || current;

      if (!source) {
        throw new GitError('Unable to determine current branch for merge.');
      }

      if (!localBranches.all.includes(source)) {
        throw new GitError(`Source branch "${source}" does not exist locally.`);
      }

      if (source === targetBranch) {
        throw new GitError(`Already on "${targetBranch}". Switch to another branch before merging.`);
      }

      if (localBranches.all.includes(targetBranch)) {
        await git.checkout(targetBranch);
      } else {
        // Create target branch from source when main doesn't exist yet.
        await git.checkout(source);
        await git.checkoutLocalBranch(targetBranch);
      }

      // Merge source into target only if target existed previously or diverged.
      try {
        await git.raw(['merge', source]);
      } catch (error) {
        const message = this.toGitErrorMessage(error);
        if (!message.toLowerCase().includes('already up to date')) {
          throw new GitError(`Failed to merge "${source}" into "${targetBranch}": ${message}`);
        }
      }

      if (push) {
        await this.push(projectPath, remote, targetBranch, true);
      }

      return { sourceBranch: source, targetBranch, pushed: push };
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw new GitError(`Failed to merge to main: ${this.toGitErrorMessage(error)}`);
    }
  }

  async getDiff(projectPath: string, staged = false): Promise<string> {
    const args = staged ? ['--staged'] : [];
    return await this.getGit(projectPath).diff(args);
  }

  async listCommits(projectPath: string, limit = 200, offset = 0): Promise<{ commits: GitCommitEntry[]; total: number }> {
    try {
      const git = this.getGit(projectPath);
      // Best effort: refresh refs so rewind picker can show complete history.
      try {
        await git.raw(['fetch', '--all', '--tags', '--prune', '--unshallow']);
      } catch {
        try {
          await git.fetch(['--all', '--tags', '--prune']);
        } catch {
          // Ignore fetch failures (e.g. offline/auth) and use local refs.
        }
      }
      try {
        await git.fetch(['--all', '--tags', '--prune']);
      } catch {
        // Ignore fetch failures (e.g. offline/auth) and use local refs.
      }
      let total = 0;
      try {
        const countRaw = await git.raw(['rev-list', '--count', '--all']);
        total = Number(String(countRaw || '').trim()) || 0;
      } catch {
        total = 0;
      }

      const result = await git.log({
        maxCount: limit,
        '--skip': Math.max(0, offset),
        '--all': null,
      });
      const commits = result.all.map((item) => ({
        hash: item.hash,
        message: item.message,
        author: item.author_name,
        date: item.date,
      }));
      if (!total) {
        total = commits.length;
      }
      return { commits, total };
    } catch (error) {
      throw new GitError(`Failed to list commits: ${this.toGitErrorMessage(error)}`);
    }
  }

  async getFileDiff(
    projectPath: string,
    filePath: string,
    staged = false
  ): Promise<FileDiffResult> {
    const git = this.getGit(projectPath);

    try {
      // Check if file is untracked (new file not in HEAD)
      const status = await git.status();
      const isUntracked = status.not_added.includes(filePath);

      if (isUntracked) {
        // For untracked files, show the entire content as added
        const fullPath = path.join(projectPath, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const diffLines = lines.map((line) => `+${line}`);
        const diff = `@@ -0,0 +1,${lines.length} @@\n${diffLines.join('\n')}`;

        return { diff, filePath };
      }

      // Use git diff for tracked files
      const args = staged
        ? ['--staged', '--', filePath]
        : ['--', filePath];
      const diff = await git.diff(args);

      return { diff, filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to get diff for ${filePath}: ${message}`);
    }
  }

  async discardChanges(projectPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    try {
      await this.getGit(projectPath).checkout(['--', ...paths]);
    } catch (error) {
      throw new GitError(`Failed to discard changes: ${this.toGitErrorMessage(error)}`);
    }
  }

  async listTags(projectPath: string): Promise<string[]> {
    try {
      const result = await this.getGit(projectPath).tags();
      return result.all;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to list tags: ${message}`);
    }
  }

  async createTag(projectPath: string, name: string, tagMessage?: string): Promise<void> {
    try {
      if (tagMessage) {
        await this.getGit(projectPath).tag(['-a', name, '-m', tagMessage]);
      } else {
        await this.getGit(projectPath).addTag(name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to create tag: ${message}`);
    }
  }

  async pushTag(projectPath: string, name: string, remote = 'origin'): Promise<string> {
    try {
      return await this.getGit(projectPath).raw(['push', remote, name]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to push tag: ${message}`);
    }
  }

  async deleteTag(projectPath: string, name: string): Promise<void> {
    try {
      await this.getGit(projectPath).tag(['-d', name]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to delete tag: ${message}`);
    }
  }

  async getRemoteUrl(projectPath: string, remote = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.getGit(projectPath).getRemotes(true);
      const match = remotes.find(r => r.name === remote);
      return match?.refs?.fetch || null;
    } catch {
      return null;
    }
  }

  async getUserName(projectPath: string): Promise<string | null> {
    try {
      const result = await this.getGit(projectPath).getConfig('user.name');
      return result.value || null;
    } catch {
      return null;
    }
  }

  async getUserEmail(projectPath: string): Promise<string | null> {
    try {
      const result = await this.getGit(projectPath).getConfig('user.email');
      return result.value || null;
    } catch {
      return null;
    }
  }

  async setUserIdentity(projectPath: string, name: string, email: string): Promise<void> {
    try {
      const git = this.getGit(projectPath);
      await git.raw(['config', 'user.name', name]);
      await git.raw(['config', 'user.email', email]);
    } catch (error) {
      throw new GitError(`Failed to set git identity: ${this.toGitErrorMessage(error)}`);
    }
  }
}

export function createGitService(): GitService {
  return new SimpleGitService();
}
