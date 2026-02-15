import { AgentQueue } from '../../../src/agents/agent-queue';

jest.mock('../../../src/utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('AgentQueue', () => {
  let queue: AgentQueue;

  beforeEach(() => {
    queue = new AgentQueue();
  });

  describe('enqueue', () => {
    it('should add a project to the queue', () => {
      queue.enqueue('project-1', 'instructions');

      expect(queue.isQueued('project-1')).toBe(true);
      expect(queue.getQueueLength()).toBe(1);
    });

    it('should throw when project is already queued', () => {
      queue.enqueue('project-1', 'instructions');

      expect(() => queue.enqueue('project-1', 'more instructions'))
        .toThrow('already queued');
    });

    it('should emit queue change event', () => {
      const listener = jest.fn();
      queue.on('queueChange', listener);

      queue.enqueue('project-1', 'instructions');

      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ projectId: 'project-1' }),
        ])
      );
    });
  });

  describe('dequeue', () => {
    it('should return and remove the first project', () => {
      queue.enqueue('project-1', 'first');
      queue.enqueue('project-2', 'second');

      const dequeued = queue.dequeue();

      expect(dequeued?.projectId).toBe('project-1');
      expect(queue.getQueueLength()).toBe(1);
      expect(queue.isQueued('project-1')).toBe(false);
    });

    it('should return undefined when queue is empty', () => {
      const dequeued = queue.dequeue();

      expect(dequeued).toBeUndefined();
    });
  });

  describe('removeFromQueue', () => {
    it('should remove a specific project', () => {
      queue.enqueue('project-1', 'first');
      queue.enqueue('project-2', 'second');

      const removed = queue.removeFromQueue('project-1');

      expect(removed).toBe(true);
      expect(queue.isQueued('project-1')).toBe(false);
      expect(queue.getQueueLength()).toBe(1);
    });

    it('should return false when project not in queue', () => {
      const removed = queue.removeFromQueue('non-existent');

      expect(removed).toBe(false);
    });
  });

  describe('getQueue', () => {
    it('should return a copy of the queue', () => {
      queue.enqueue('project-1', 'first');
      queue.enqueue('project-2', 'second');

      const q = queue.getQueue();

      expect(q).toHaveLength(2);
      expect(q[0]!.projectId).toBe('project-1');
    });
  });

  describe('getQueuedMessages', () => {
    it('should return instructions for queued project', () => {
      queue.enqueue('project-1', 'my instructions');

      const messages = queue.getQueuedMessages('project-1');

      expect(messages).toEqual(['my instructions']);
    });

    it('should return empty array for non-queued project', () => {
      const messages = queue.getQueuedMessages('non-existent');

      expect(messages).toEqual([]);
    });
  });

  describe('getQueuedMessageCount', () => {
    it('should return 1 for queued project', () => {
      queue.enqueue('project-1', 'instructions');

      expect(queue.getQueuedMessageCount('project-1')).toBe(1);
    });

    it('should return 0 for non-queued project', () => {
      expect(queue.getQueuedMessageCount('non-existent')).toBe(0);
    });
  });

  describe('removeQueuedMessage', () => {
    it('should remove queued message at index 0', () => {
      queue.enqueue('project-1', 'instructions');

      const removed = queue.removeQueuedMessage('project-1', 0);

      expect(removed).toBe(true);
      expect(queue.isQueued('project-1')).toBe(false);
    });

    it('should return false for non-zero index', () => {
      queue.enqueue('project-1', 'instructions');

      const removed = queue.removeQueuedMessage('project-1', 1);

      expect(removed).toBe(false);
    });

    it('should return false for non-queued project', () => {
      const removed = queue.removeQueuedMessage('non-existent', 0);

      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all queued projects', () => {
      queue.enqueue('project-1', 'first');
      queue.enqueue('project-2', 'second');

      queue.clear();

      expect(queue.getQueueLength()).toBe(0);
      expect(queue.isQueued('project-1')).toBe(false);
    });

    it('should not emit when queue is already empty', () => {
      const listener = jest.fn();
      queue.on('queueChange', listener);

      queue.clear();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should emit when clearing non-empty queue', () => {
      queue.enqueue('project-1', 'first');
      const listener = jest.fn();
      queue.on('queueChange', listener);

      queue.clear();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('event listeners', () => {
    it('should register and fire listeners', () => {
      const listener = jest.fn();
      queue.on('queueChange', listener);

      queue.enqueue('project-1', 'instructions');

      expect(listener).toHaveBeenCalled();
    });

    it('should unregister listeners', () => {
      const listener = jest.fn();
      queue.on('queueChange', listener);
      queue.off('queueChange', listener);

      queue.enqueue('project-1', 'instructions');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle off for non-registered event', () => {
      const listener = jest.fn();
      // Should not throw
      queue.off('queueChange', listener);
    });

    it('should handle listener errors gracefully', () => {
      const badListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      queue.on('queueChange', badListener);

      // Should not throw
      queue.enqueue('project-1', 'instructions');

      expect(badListener).toHaveBeenCalled();
    });
  });
});
