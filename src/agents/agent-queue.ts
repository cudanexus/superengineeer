import { getLogger, Logger } from '../utils';

export interface QueuedProject {
  projectId: string;
  instructions: string;
  queuedAt: string;
}

export interface AgentQueueEvents {
  queueChange: (queue: QueuedProject[]) => void;
}

/**
 * Manages the queue of projects waiting for agent execution.
 * Implements FIFO queue with O(1) lookup for queued status.
 */
export class AgentQueue {
  private readonly queue: QueuedProject[] = [];
  private readonly queuedProjects = new Set<string>(); // O(1) lookup optimization
  private readonly logger: Logger;
  private readonly listeners: Map<keyof AgentQueueEvents, Set<(...args: unknown[]) => void>> = new Map();

  constructor() {
    this.logger = getLogger('agent-queue');
  }

  /**
   * Add a project to the queue.
   * @throws Error if the project is already queued
   */
  enqueue(projectId: string, instructions: string): void {
    if (this.isQueued(projectId)) {
      throw new Error(`Project ${projectId} is already queued`);
    }

    const queuedProject: QueuedProject = {
      projectId,
      instructions,
      queuedAt: new Date().toISOString(),
    };

    this.queue.push(queuedProject);
    this.queuedProjects.add(projectId);

    this.logger.info('Project added to queue', {
      projectId,
      queuePosition: this.queue.length,
      queueLength: this.queue.length,
    });

    this.emitQueueChange();
  }

  /**
   * Remove and return the next project from the queue.
   */
  dequeue(): QueuedProject | undefined {
    const project = this.queue.shift();

    if (project) {
      this.queuedProjects.delete(project.projectId);

      this.logger.info('Project dequeued', {
        projectId: project.projectId,
        queuedDuration: Date.now() - new Date(project.queuedAt).getTime(),
        remainingQueueLength: this.queue.length,
      });

      this.emitQueueChange();
    }

    return project;
  }

  /**
   * Check if a project is in the queue.
   * O(1) operation using Set lookup.
   */
  isQueued(projectId: string): boolean {
    return this.queuedProjects.has(projectId);
  }

  /**
   * Remove a specific project from the queue.
   */
  removeFromQueue(projectId: string): boolean {
    const index = this.queue.findIndex((q) => q.projectId === projectId);

    if (index >= 0) {
      this.queue.splice(index, 1);
      this.queuedProjects.delete(projectId);

      this.logger.info('Project removed from queue', {
        projectId,
        removedFromPosition: index + 1,
        remainingQueueLength: this.queue.length,
      });

      this.emitQueueChange();
      return true;
    }

    return false;
  }

  /**
   * Get all queued projects.
   */
  getQueue(): QueuedProject[] {
    return [...this.queue];
  }

  /**
   * Get the number of queued projects.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get the queued messages for a specific project.
   */
  getQueuedMessages(projectId: string): string[] {
    const queuedProject = this.queue.find((q) => q.projectId === projectId);
    return queuedProject ? [queuedProject.instructions] : [];
  }

  /**
   * Get the number of queued messages for a specific project.
   * Currently always returns 1 if queued, 0 otherwise.
   */
  getQueuedMessageCount(projectId: string): number {
    return this.isQueued(projectId) ? 1 : 0;
  }

  /**
   * Remove a queued message by index.
   * Currently only supports removing the single queued message (index 0).
   */
  removeQueuedMessage(projectId: string, index: number): boolean {
    if (index === 0 && this.isQueued(projectId)) {
      return this.removeFromQueue(projectId);
    }
    return false;
  }

  /**
   * Clear all queued projects.
   */
  clear(): void {
    const count = this.queue.length;
    this.queue.length = 0;
    this.queuedProjects.clear();

    if (count > 0) {
      this.logger.info('Queue cleared', { clearedCount: count });
      this.emitQueueChange();
    }
  }

  /**
   * Subscribe to queue events.
   */
  on<K extends keyof AgentQueueEvents>(event: K, listener: AgentQueueEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  /**
   * Unsubscribe from queue events.
   */
  off<K extends keyof AgentQueueEvents>(event: K, listener: AgentQueueEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener as (...args: unknown[]) => void);
    }
  }

  private emitQueueChange(): void {
    const listeners = this.listeners.get('queueChange');
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as AgentQueueEvents['queueChange'])(this.getQueue());
        } catch (error) {
          this.logger.error('Error in queue change listener', { error });
        }
      });
    }
  }
}