import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectRepository } from '../repositories';
import { getLogger } from '../utils';

export interface WipeSummary {
  projectsWiped: number;
  globalDataDeleted: boolean;
  mcpTempDeleted: boolean;
}

export interface DataWipeService {
  wipeAll(): Promise<WipeSummary>;
}

interface DataWipeServiceDependencies {
  projectRepository: ProjectRepository;
  dataDirectory: string;
}

export class DefaultDataWipeService implements DataWipeService {
  private readonly projectRepository: ProjectRepository;
  private readonly dataDirectory: string;
  private readonly logger = getLogger('data-wipe');

  constructor(deps: DataWipeServiceDependencies) {
    this.projectRepository = deps.projectRepository;
    this.dataDirectory = deps.dataDirectory;
  }

  async wipeAll(): Promise<WipeSummary> {
    const projectPaths = await this.collectProjectPaths();
    const projectsWiped = this.wipeProjectData(projectPaths);
    const mcpTempDeleted = this.wipeMcpTempData();
    const globalDataDeleted = this.wipeGlobalData();

    return { projectsWiped, globalDataDeleted, mcpTempDeleted };
  }

  private async collectProjectPaths(): Promise<string[]> {
    try {
      const projects = await this.projectRepository.findAll();
      return projects.map((p) => p.path);
    } catch {
      this.logger.warn('Failed to read project index, skipping per-project wipe');
      return [];
    }
  }

  private wipeProjectData(projectPaths: string[]): number {
    let wiped = 0;

    for (const projectPath of projectPaths) {
      const clauditoDir = path.join(projectPath, '.claudito');

      if (this.deleteDirectoryRecursive(clauditoDir)) {
        wiped++;
      }
    }

    return wiped;
  }

  private wipeMcpTempData(): boolean {
    const mcpTempDir = path.join(os.tmpdir(), 'claudito-mcp');
    return this.deleteDirectoryRecursive(mcpTempDir);
  }

  private wipeGlobalData(): boolean {
    return this.deleteDirectoryRecursive(this.dataDirectory);
  }

  private deleteDirectoryRecursive(dirPath: string): boolean {
    try {
      if (!fs.existsSync(dirPath)) {
        return false;
      }

      fs.rmSync(dirPath, { recursive: true, force: true });
      this.logger.info('Deleted directory', { path: dirPath });
      return true;
    } catch (error) {
      this.logger.warn('Failed to delete directory', {
        path: dirPath,
        error: String(error),
      });
      return false;
    }
  }
}
