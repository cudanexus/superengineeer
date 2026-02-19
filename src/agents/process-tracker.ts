import { getLogger, Logger, getPidTracker, PidTracker, TrackedProcess as PidTrackedProcess } from '../utils';

export interface TrackedProcessInfo {
  pid: number;
  projectId: string;
  startedAt: string;
}

export interface OrphanCleanupResult {
  foundCount: number;
  killedCount: number;
  killedPids: number[];
  failedPids: number[];
  skippedPids: number[];
}

/**
 * Tracks running agent processes and handles orphan cleanup.
 * Persists PIDs to disk to handle process cleanup across restarts.
 */
export class ProcessTracker {
  private readonly logger: Logger;
  private readonly pidTracker: PidTracker;
  private readonly processMap: Map<string, TrackedProcessInfo> = new Map();

  constructor() {
    this.logger = getLogger('process-tracker');
    this.pidTracker = getPidTracker();
  }

  /**
   * Track a new process.
   */
  trackProcess(projectId: string, pid: number): void {
    const info: TrackedProcessInfo = {
      pid,
      projectId,
      startedAt: new Date().toISOString(),
    };

    this.processMap.set(projectId, info);
    this.pidTracker.addProcess(pid, projectId);

    this.logger.info('Process tracked', {
      projectId,
      pid,
    });
  }

  /**
   * Stop tracking a process.
   */
  untrackProcess(projectId: string): void {
    const info = this.processMap.get(projectId);

    if (info) {
      this.processMap.delete(projectId);
      this.pidTracker.removeProcess(info.pid);

      this.logger.info('Process untracked', {
        projectId,
        pid: info.pid,
        duration: Date.now() - new Date(info.startedAt).getTime(),
      });
    }
  }

  /**
   * Get tracked process info for a project.
   */
  getProcessInfo(projectId: string): TrackedProcessInfo | null {
    return this.processMap.get(projectId) || null;
  }

  /**
   * Get PID for a project.
   */
  getPid(projectId: string): number | undefined {
    return this.processMap.get(projectId)?.pid;
  }

  /**
   * Get all tracked processes.
   */
  getTrackedProcesses(): TrackedProcessInfo[] {
    return Array.from(this.processMap.values());
  }

  /**
   * Get all running project IDs.
   */
  getRunningProjectIds(): string[] {
    return Array.from(this.processMap.keys());
  }

  /**
   * Check if a project has a tracked process.
   */
  isTracked(projectId: string): boolean {
    return this.processMap.has(projectId);
  }

  /**
   * Clean up orphan processes from previous runs.
   * Called on startup to kill any processes that were left running.
   */
  async cleanupOrphanProcesses(): Promise<OrphanCleanupResult> {
    const orphanPids = this.pidTracker.getTrackedProcesses();
    const result: OrphanCleanupResult = {
      foundCount: orphanPids.length,
      killedCount: 0,
      killedPids: [],
      failedPids: [],
      skippedPids: [],
    };

    if (orphanPids.length === 0) {
      return result;
    }

    this.logger.warn('Found orphan processes from previous run', {
      count: orphanPids.length,
      pids: orphanPids.map((p: PidTrackedProcess) => ({ projectId: p.projectId, pid: p.pid })),
    });

    for (const { projectId, pid } of orphanPids) {
      try {
        // Check if process is still running
        const isRunning = this.isProcessRunning(pid);

        if (!isRunning) {
          this.logger.debug('Orphan process already dead', { projectId, pid });
          this.pidTracker.removeProcess(pid);
          result.skippedPids.push(pid);
          continue;
        }

        // Try to kill the process
        this.logger.info('Killing orphan process', { projectId, pid });
        process.kill(pid, 'SIGTERM');

        // Give it time to die gracefully
        await this.delay(1000);

        // Check if it's still running and force kill if needed
        if (this.isProcessRunning(pid)) {
          this.logger.warn('Force killing stubborn orphan process', { projectId, pid });
          process.kill(pid, 'SIGKILL');
          await this.delay(500);
        }

        // Verify it's dead
        if (!this.isProcessRunning(pid)) {
          result.killedCount++;
          result.killedPids.push(pid);
          this.pidTracker.removeProcess(pid);
          this.logger.info('Successfully killed orphan process', { projectId, pid });
        } else {
          result.failedPids.push(pid);
          this.logger.error('Failed to kill orphan process', { projectId, pid });
        }
      } catch (error) {
        result.failedPids.push(pid);
        this.logger.error('Error killing orphan process', {
          projectId,
          pid,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Remove from tracker anyway if process doesn't exist
        if (
          error instanceof Error &&
          (error.message.includes('ESRCH') || error.message.includes('No such process'))
        ) {
          this.pidTracker.removeProcess(pid);
          result.skippedPids.push(pid);
        }
      }
    }

    this.logger.info('Orphan cleanup complete', {
      foundCount: result.foundCount,
      killedCount: result.killedCount,
      killedPids: result.killedPids,
      failedPids: result.failedPids,
      skippedPids: result.skippedPids,
    });
    return result;
  }

  /**
   * Kill a specific process by PID.
   *
   * @param pid Process ID to kill
   * @param signal Signal to send (default: SIGTERM)
   */
  killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          (error.message.includes('ESRCH') || error.message.includes('No such process'))
        )
      ) {
        throw error;
      }
      // Process doesn't exist, which is fine
    }
  }

  /**
   * Check if a process is running.
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all tracked processes.
   * Used during shutdown or testing.
   */
  clear(): void {
    this.processMap.clear();
  }

  /**
   * Persist current process map to disk.
   * Called periodically or on changes.
   */
  persist(): void {
    // The pidTracker automatically persists to disk on changes
    // No explicit persist method available, but the tracker
    // saves state on each add/remove operation
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}