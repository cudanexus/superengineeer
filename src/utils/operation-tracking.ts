import { getLogger } from './logger';

const logger = getLogger('operation-tracking');

/**
 * Tracks pending async operations for coordinated shutdown
 */
export class PendingOperationsTracker {
  private readonly pendingOperations: Set<Promise<unknown>> = new Set();
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Track a promise and automatically remove when complete
   */
  track<T>(promise: Promise<T>): Promise<T> {
    this.pendingOperations.add(promise);
    void promise.finally(() => {
      this.pendingOperations.delete(promise);
      logger.debug(`${this.name}: Operation completed`, {
        remaining: this.pendingOperations.size,
      });
    });
    return promise;
  }

  /**
   * Get count of pending operations
   */
  get size(): number {
    return this.pendingOperations.size;
  }

  /**
   * Wait for all pending operations to complete
   */
  async flush(): Promise<void> {
    while (this.pendingOperations.size > 0) {
      logger.debug(`${this.name}: Flushing operations`, {
        count: this.pendingOperations.size,
      });
      await Promise.all(Array.from(this.pendingOperations));
    }
    logger.debug(`${this.name}: All operations flushed`);
  }

  /**
   * Clear all pending operations without waiting
   */
  clear(): void {
    this.pendingOperations.clear();
  }
}

/**
 * Write queue manager for serializing operations on entities
 */
export class WriteQueueManager<K = string> {
  private readonly writeQueues: Map<K, Promise<void>> = new Map();
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Execute operation with exclusive lock on key
   */
  async withLock<T>(
    key: K,
    operation: () => Promise<T>
  ): Promise<T> {
    const previousOperation = this.writeQueues.get(key) || Promise.resolve();

    const newOperation = previousOperation.then(operation, operation);

    // Store void promise to avoid memory leaks
    this.writeQueues.set(
      key,
      newOperation.then(
        () => {},
        () => {}
      )
    );

    // Clean up after operation
    void newOperation.finally(() => {
      if (this.writeQueues.get(key) === newOperation) {
        this.writeQueues.delete(key);
      }
    });

    return newOperation;
  }

  /**
   * Wait for all queued operations to complete
   */
  async flush(): Promise<void> {
    if (this.writeQueues.size > 0) {
      logger.debug(`${this.name}: Flushing write queues`, {
        count: this.writeQueues.size,
      });
      await Promise.all(Array.from(this.writeQueues.values()));
    }
  }

  /**
   * Get count of active write queues
   */
  get size(): number {
    return this.writeQueues.size;
  }

  /**
   * Clear all write queues without waiting
   */
  clear(): void {
    this.writeQueues.clear();
  }
}