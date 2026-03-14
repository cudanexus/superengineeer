import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { spawn, execFile, ChildProcessWithoutNullStreams } from 'child_process';
import { access, constants } from 'fs/promises';
import * as path from 'path';
import { getLogger, Logger } from '../utils/logger';
import { FlyDeploymentInfo, ProjectRepository } from '../repositories/project';

export type FlyDeployStage = 'validating' | 'creating_app' | 'deploying';
export type FlyDeployStatus = 'idle' | 'validating' | 'creating_app' | 'deploying' | 'completed' | 'failed';

export interface FlyDeployOutputEvent {
  deploymentId: string;
  appName: string;
  appUrl: string;
  stage: FlyDeployStage;
  data: string;
}

export interface FlyDeployStatusEvent {
  deploymentId: string;
  appName: string;
  appUrl: string;
  status: FlyDeployStatus;
  stage: FlyDeployStage | null;
  isActive: boolean;
  message: string;
  startedAt: string;
  completedAt?: string;
  missingFiles?: string[];
}

export interface FlyDeploymentRecord {
  deploymentId: string;
  projectId: string;
  projectPath: string;
  appName: string;
  appUrl: string;
  reuseExistingApp: boolean;
  status: FlyDeployStatus;
  stage: FlyDeployStage | null;
  startedAt: string;
  completedAt?: string;
  message: string;
  missingFiles?: string[];
  process?: ChildProcessWithoutNullStreams;
}

export interface FlyDeployServiceEvents {
  output: (projectId: string, event: FlyDeployOutputEvent) => void;
  status: (projectId: string, event: FlyDeployStatusEvent) => void;
}

export interface FlyDeployService {
  deploy(
    projectId: string,
    projectPath: string,
    projectName: string,
    existingDeployment?: FlyDeploymentInfo | null,
  ): Promise<FlyDeploymentRecord>;
  getDeploymentByProject(projectId: string): FlyDeploymentRecord | undefined;
  getAppLogs(projectId: string, existingDeployment?: FlyDeploymentInfo | null): Promise<{ appName: string; appUrl: string; logs: string }>;
  stopAllDeployments(): void;
  on<K extends keyof FlyDeployServiceEvents>(event: K, listener: FlyDeployServiceEvents[K]): void;
  off<K extends keyof FlyDeployServiceEvents>(event: K, listener: FlyDeployServiceEvents[K]): void;
}

function appUrlFromName(appName: string): string {
  return `https://${appName}.fly.dev`;
}

const REQUIRED_FILES = ['fly.toml'];
const DEPLOYABLE_FILE_GROUPS = [
  ['Dockerfile'],
  ['package.json'],
  ['Procfile'],
];

function slugifyAppSegment(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function generateAppName(projectName: string): string {
  const projectSlug = slugifyAppSegment(projectName).slice(0, 24) || 'app';
  const suffix = Math.random().toString(36).slice(2, 6);
  const rawName = `${projectSlug}-${suffix}`;
  const trimmed = rawName.slice(0, 30).replace(/-+$/g, '');
  return trimmed || `app-${suffix}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getMissingFiles(projectPath: string): Promise<string[]> {
  const missing: string[] = [];

  for (const file of REQUIRED_FILES) {
    if (!(await fileExists(path.join(projectPath, file)))) {
      missing.push(file);
    }
  }

  let hasDeployableConfig = false;

  for (const group of DEPLOYABLE_FILE_GROUPS) {
    for (const file of group) {
      if (await fileExists(path.join(projectPath, file))) {
        hasDeployableConfig = true;
        break;
      }
    }

    if (hasDeployableConfig) {
      break;
    }
  }

  if (!hasDeployableConfig) {
    missing.push('one of: Dockerfile, package.json, Procfile');
  }

  return missing;
}

export class DefaultFlyDeployService extends EventEmitter implements FlyDeployService {
  private readonly logger: Logger;
  private readonly projectRepository: ProjectRepository;
  private readonly activeDeployments = new Map<string, FlyDeploymentRecord>();
  private readonly lastDeployments = new Map<string, FlyDeploymentRecord>();

  constructor(projectRepository: ProjectRepository) {
    super();
    this.projectRepository = projectRepository;
    this.logger = getLogger('fly-deploy-service');
  }

  async deploy(
    projectId: string,
    projectPath: string,
    projectName: string,
    existingFlyDeployment?: FlyDeploymentInfo | null,
  ): Promise<FlyDeploymentRecord> {
    const existingDeployment = this.activeDeployments.get(projectId);

    if (existingDeployment) {
      throw new Error(`Deployment already running for project ${projectId}`);
    }

    const savedFlyDeployment = existingFlyDeployment || null;
    const appName = savedFlyDeployment?.appName || generateAppName(projectName);
    const appUrl = savedFlyDeployment?.appUrl || appUrlFromName(appName);

    const deployment: FlyDeploymentRecord = {
      deploymentId: randomUUID(),
      projectId,
      projectPath,
      appName,
      appUrl,
      reuseExistingApp: !!savedFlyDeployment?.appName,
      status: 'validating',
      stage: 'validating',
      startedAt: new Date().toISOString(),
      message: 'Checking Fly.io deployment files',
    };

    this.activeDeployments.set(projectId, deployment);
    this.lastDeployments.set(projectId, deployment);
    this.emitStatus(projectId, deployment);

    const missingFiles = await getMissingFiles(projectPath);

    if (missingFiles.length > 0) {
      deployment.status = 'failed';
      deployment.stage = 'validating';
      deployment.message = 'Missing required Fly.io deployment files';
      deployment.missingFiles = missingFiles;
      deployment.completedAt = new Date().toISOString();
      this.emitOutput(projectId, deployment, 'validating', `Missing files:\n- ${missingFiles.join('\n- ')}\n`);
      this.emitStatus(projectId, deployment);
      this.activeDeployments.delete(projectId);
      return deployment;
    }

    this.emitOutput(projectId, deployment, 'validating', 'Validation passed.\n');
    void this.runDeployment(deployment);
    return deployment;
  }

  getDeploymentByProject(projectId: string): FlyDeploymentRecord | undefined {
    return this.activeDeployments.get(projectId) || this.lastDeployments.get(projectId);
  }

  async getAppLogs(projectId: string, existingDeployment?: FlyDeploymentInfo | null): Promise<{ appName: string; appUrl: string; logs: string }> {
    const project = await this.projectRepository.findById(projectId);
    const flyDeployment = existingDeployment || this.activeDeployments.get(projectId) || this.lastDeployments.get(projectId);

    if (!flyDeployment?.appName) {
      throw new Error('No deployed Fly.io app found for this project');
    }

    return new Promise((resolve, reject) => {
      execFile(
        'flyctl',
        ['logs', '-a', flyDeployment.appName, '--no-tail'],
        {
          cwd: project?.path,
          env: process.env,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const message = error.message.includes('ENOENT')
              ? 'flyctl is not installed or not available in PATH'
              : (stderr || stdout || error.message || 'Failed to fetch app logs');
            reject(new Error(String(message).trim()));
            return;
          }

          resolve({
            appName: flyDeployment.appName,
            appUrl: flyDeployment.appUrl,
            logs: String(stdout || stderr || '').trim(),
          });
        }
      );
    });
  }

  stopAllDeployments(): void {
    for (const deployment of this.activeDeployments.values()) {
      if (deployment.process && !deployment.process.killed) {
        deployment.process.kill('SIGTERM');
      }
    }
    this.activeDeployments.clear();
  }

  private async runDeployment(deployment: FlyDeploymentRecord): Promise<void> {
    const projectLogger = this.logger.withProject(deployment.projectId);

    try {
      if (!deployment.reuseExistingApp) {
        deployment.status = 'creating_app';
        deployment.stage = 'creating_app';
        deployment.message = `Creating Fly.io app ${deployment.appName}`;
        this.emitStatus(deployment.projectId, deployment);
        await this.runCommand(deployment, 'creating_app', 'flyctl', ['apps', 'create', deployment.appName]);
      }

      deployment.status = 'deploying';
      deployment.stage = 'deploying';
      deployment.message = `${deployment.reuseExistingApp ? 'Updating' : 'Deploying'} ${deployment.appName} on Fly.io`;
      this.emitStatus(deployment.projectId, deployment);
      await this.runCommand(deployment, 'deploying', 'flyctl', ['deploy', '-a', deployment.appName, '--remote-only']);

      deployment.status = 'completed';
      deployment.stage = null;
      deployment.message = `Deployment finished for ${deployment.appName}`;
      deployment.completedAt = new Date().toISOString();
      this.emitStatus(deployment.projectId, deployment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      projectLogger.error('Fly deploy failed', { appName: deployment.appName, error: message });
      deployment.status = 'failed';
      deployment.message = message;
      deployment.completedAt = new Date().toISOString();
      this.emitStatus(deployment.projectId, deployment);
    } finally {
      deployment.process = undefined;
      this.lastDeployments.set(deployment.projectId, { ...deployment });
      this.activeDeployments.delete(deployment.projectId);
    }
  }

  private runCommand(
    deployment: FlyDeploymentRecord,
    stage: FlyDeployStage,
    command: string,
    args: string[],
  ): Promise<void> {
    this.emitOutput(
      deployment.projectId,
      deployment,
      stage,
      `$ ${[command].concat(args).join(' ')}\n`
    );

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: deployment.projectPath,
        env: process.env,
      });

      deployment.process = child;

      child.stdout.on('data', (chunk: Buffer | string) => {
        this.emitOutput(deployment.projectId, deployment, stage, chunk.toString());
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        this.emitOutput(deployment.projectId, deployment, stage, chunk.toString());
      });

      child.on('error', (error) => {
        const message = error.message.includes('ENOENT')
          ? 'flyctl is not installed or not available in PATH'
          : `Failed to start ${command}: ${error.message}`;
        this.emitOutput(deployment.projectId, deployment, stage, `${message}\n`);
        reject(new Error(message));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      });
    });
  }

  private emitOutput(projectId: string, deployment: FlyDeploymentRecord, stage: FlyDeployStage, data: string): void {
    this.emit('output', projectId, {
      deploymentId: deployment.deploymentId,
      appName: deployment.appName,
      appUrl: deployment.appUrl,
      stage,
      data,
    } satisfies FlyDeployOutputEvent);
  }

  private emitStatus(projectId: string, deployment: FlyDeploymentRecord): void {
    this.emit('status', projectId, {
      deploymentId: deployment.deploymentId,
      appName: deployment.appName,
      appUrl: deployment.appUrl,
      status: deployment.status,
      stage: deployment.stage,
      isActive: deployment.status === 'validating' || deployment.status === 'creating_app' || deployment.status === 'deploying',
      message: deployment.message,
      startedAt: deployment.startedAt,
      completedAt: deployment.completedAt,
      missingFiles: deployment.missingFiles,
    } satisfies FlyDeployStatusEvent);
  }
}

let flyDeployServiceInstance: FlyDeployService | null = null;

export function createFlyDeployService(projectRepository: ProjectRepository): FlyDeployService {
  if (!flyDeployServiceInstance) {
    flyDeployServiceInstance = new DefaultFlyDeployService(projectRepository);
  }

  return flyDeployServiceInstance;
}

export function getFlyDeployService(): FlyDeployService | null {
  return flyDeployServiceInstance;
}

export function getOrCreateFlyDeployService(projectRepository: ProjectRepository): FlyDeployService {
  return createFlyDeployService(projectRepository);
}
