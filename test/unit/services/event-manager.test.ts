import { createEventManager, EventManager, AgentEvent } from '../../../src/services/event-manager';

describe('EventManager', () => {
  let eventManager: EventManager;

  beforeEach(() => {
    eventManager = createEventManager();
  });

  describe('createEventManager', () => {
    it('should create a new event manager instance', () => {
      const manager = createEventManager();

      expect(manager).toBeDefined();
      expect(typeof manager.emit).toBe('function');
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.off).toBe('function');
    });

    it('should create independent instances', () => {
      const manager1 = createEventManager();
      const manager2 = createEventManager();
      const listener = jest.fn();

      manager1.on('agent_started', listener);
      manager2.emit('agent_started', 'project-1');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should emit event with project ID', () => {
      const listener = jest.fn();
      eventManager.on('agent_started', listener);

      eventManager.emit('agent_started', 'project-123');

      expect(listener).toHaveBeenCalledWith('project-123', undefined);
    });

    it('should emit event with data', () => {
      const listener = jest.fn();
      const data = { key: 'value', count: 42 };
      eventManager.on('tool_use_started', listener);

      eventManager.emit('tool_use_started', 'project-1', data);

      expect(listener).toHaveBeenCalledWith('project-1', data);
    });

    it('should emit to all registered listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('agent_stopped', listener1);
      eventManager.on('agent_stopped', listener2);

      eventManager.emit('agent_stopped', 'project-x');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should not call listeners for different events', () => {
      const listener = jest.fn();
      eventManager.on('agent_started', listener);

      eventManager.emit('agent_stopped', 'project-1');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('on', () => {
    const allEvents: AgentEvent[] = [
      'user_sent_message',
      'tool_use_started',
      'tool_use_completed',
      'assistant_response_completed',
      'agent_started',
      'agent_stopped',
    ];

    it.each(allEvents)('should register listener for event: %s', (event) => {
      const listener = jest.fn();

      eventManager.on(event, listener);
      eventManager.emit(event, 'test-project');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple listeners for same event', () => {
      const listeners = [jest.fn(), jest.fn(), jest.fn()];

      listeners.forEach((listener) => {
        eventManager.on('user_sent_message', listener);
      });

      eventManager.emit('user_sent_message', 'project');

      listeners.forEach((listener) => {
        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    it('should receive multiple emissions', () => {
      const listener = jest.fn();
      eventManager.on('tool_use_completed', listener);

      eventManager.emit('tool_use_completed', 'p1');
      eventManager.emit('tool_use_completed', 'p2');
      eventManager.emit('tool_use_completed', 'p3');

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('off', () => {
    it('should remove registered listener', () => {
      const listener = jest.fn();
      eventManager.on('agent_started', listener);
      eventManager.off('agent_started', listener);

      eventManager.emit('agent_started', 'project');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should only remove the specified listener', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('agent_stopped', listener1);
      eventManager.on('agent_stopped', listener2);
      eventManager.off('agent_stopped', listener1);

      eventManager.emit('agent_stopped', 'project');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle removing non-existent listener gracefully', () => {
      const listener = jest.fn();

      expect(() => {
        eventManager.off('agent_started', listener);
      }).not.toThrow();
    });

    it('should allow re-registering after removal', () => {
      const listener = jest.fn();

      eventManager.on('tool_use_started', listener);
      eventManager.off('tool_use_started', listener);
      eventManager.on('tool_use_started', listener);

      eventManager.emit('tool_use_started', 'project');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event data handling', () => {
    it('should pass undefined data when not provided', () => {
      const listener = jest.fn();
      eventManager.on('assistant_response_completed', listener);

      eventManager.emit('assistant_response_completed', 'proj');

      expect(listener).toHaveBeenCalledWith('proj', undefined);
    });

    it('should handle complex data objects', () => {
      const listener = jest.fn();
      const complexData = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        fn: undefined,
      };
      eventManager.on('tool_use_started', listener);

      eventManager.emit('tool_use_started', 'proj', complexData);

      expect(listener).toHaveBeenCalledWith('proj', complexData);
    });

    it('should handle null data', () => {
      const listener = jest.fn();
      eventManager.on('user_sent_message', listener);

      eventManager.emit('user_sent_message', 'proj', null);

      expect(listener).toHaveBeenCalledWith('proj', null);
    });
  });
});
