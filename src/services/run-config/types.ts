/**
 * Run Configuration Types
 * Data model and service interfaces for project run configurations
 */

export interface RunConfiguration {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  shell: string | null;
  autoRestart: boolean;
  autoRestartDelay: number;
  autoRestartMaxRetries: number;
  preLaunchConfigId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunConfigData {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | null;
  autoRestart?: boolean;
  autoRestartDelay?: number;
  autoRestartMaxRetries?: number;
  preLaunchConfigId?: string | null;
}

export interface UpdateRunConfigData {
  name?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | null;
  autoRestart?: boolean;
  autoRestartDelay?: number;
  autoRestartMaxRetries?: number;
  preLaunchConfigId?: string | null;
}

export interface RunConfigurationService {
  list(projectId: string): Promise<RunConfiguration[]>;
  getById(projectId: string, configId: string): Promise<RunConfiguration | null>;
  create(projectId: string, data: CreateRunConfigData): Promise<RunConfiguration>;
  update(projectId: string, configId: string, data: UpdateRunConfigData): Promise<RunConfiguration | null>;
  delete(projectId: string, configId: string): Promise<boolean>;
}
