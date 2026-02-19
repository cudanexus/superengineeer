import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { GitError } from '../utils/errors';

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

export interface GitService {
  getStatus(projectPath: string): Promise<GitStatus>;
  getBranches(projectPath: string): Promise<BranchInfo>;
  stageFiles(projectPath: string, paths: string[]): Promise<void>;
  unstageFiles(projectPath: string, paths: string[]): Promise<void>;
  stageAll(projectPath: string): Promise<void>;
  unstageAll(projectPath: string): Promise<void>;
  commit(projectPath: string, message: string): Promise<CommitResult>;
  createBranch(projectPath: string, name: string, checkout?: boolean): Promise<void>;
  checkout(projectPath: string, branch: string): Promise<void>;
  push(projectPath: string, remote?: string, branch?: string, setUpstream?: boolean): Promise<string>;
  pull(projectPath: string, remote?: string, branch?: string, rebase?: boolean): Promise<string>;
  getDiff(projectPath: string, staged?: boolean): Promise<string>;
  getFileDiff(projectPath: string, filePath: string, staged?: boolean): Promise<FileDiffResult>;
  discardChanges(projectPath: string, paths: string[]): Promise<void>;
  isGitRepo(projectPath: string): Promise<boolean>;
  listTags(projectPath: string): Promise<string[]>;
  createTag(projectPath: string, name: string, message?: string): Promise<void>;
  pushTag(projectPath: string, name: string, remote?: string): Promise<string>;
  deleteTag(projectPath: string, name: string): Promise<void>;
  getRemoteUrl(projectPath: string, remote?: string): Promise<string | null>;
  getUserName(projectPath: string): Promise<string | null>;
}

export class SimpleGitService implements GitService {
  private getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath);
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

  async commit(projectPath: string, message: string): Promise<CommitResult> {
    const result = await this.getGit(projectPath).commit(message);
    const hash = result.commit.substring(0, 7);

    return { hash, message };
  }

  async createBranch(projectPath: string, name: string, checkout = false): Promise<void> {
    const git = this.getGit(projectPath);

    if (checkout) {
      await git.checkoutLocalBranch(name);
    } else {
      await git.branch([name]);
    }
  }

  async checkout(projectPath: string, branch: string): Promise<void> {
    await this.getGit(projectPath).checkout(branch);
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

    return await this.getGit(projectPath).raw(args);
  }

  async pull(projectPath: string, remote = 'origin', branch?: string, rebase = false): Promise<string> {
    const args = ['pull'];

    if (rebase) {
      args.push('--rebase');
    }

    args.push(remote);

    if (branch) {
      args.push(branch);
    }

    return await this.getGit(projectPath).raw(args);
  }

  async getDiff(projectPath: string, staged = false): Promise<string> {
    const args = staged ? ['--staged'] : [];
    return await this.getGit(projectPath).diff(args);
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
    await this.getGit(projectPath).checkout(['--', ...paths]);
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
}

export function createGitService(): GitService {
  return new SimpleGitService();
}
