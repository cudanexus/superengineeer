/**
 * Run Process Manager Types
 * Interface and types for managing running configuration processes
 */

export type RunProcessState = 'stopped' | 'starting' | 'running' | 'errored';

export interface RunProcessStatus {
  configId: string;
  state: RunProcessState;
  pid: number | null;
  startedAt: string | null;
  uptimeMs: number | null;
  exitCode: number | null;
  restartCount: number;
  error: string | null;
}

export interface RunProcessEvents {
  output: (projectId: string, configId: string, data: string) => void;
  status: (projectId: string, configId: string, status: RunProcessStatus) => void;
}

export interface RunProcessManager {
  start(projectId: string, projectPath: string, configId: string): Promise<RunProcessStatus>;
  stop(projectId: string, configId: string): Promise<void>;
  stopAll(projectId: string): Promise<void>;
  getStatus(projectId: string, configId: string): RunProcessStatus;
  getAllStatuses(projectId: string): RunProcessStatus[];
  shutdown(): Promise<void>;
  on<K extends keyof RunProcessEvents>(event: K, listener: RunProcessEvents[K]): void;
  off<K extends keyof RunProcessEvents>(event: K, listener: RunProcessEvents[K]): void;
}
