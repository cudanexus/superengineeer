/**
 * @jest-environment jsdom
 */

const StateModule = require('../../public/js/modules/state-module');

describe('StateModule', () => {
  describe('createDefaultState', () => {
    it('should return default state object', () => {
      const state = StateModule.createDefaultState();

      expect(state).toBeDefined();
      expect(state.selectedProjectId).toBeNull();
      expect(state.projects).toEqual([]);
    });

    it('should have agent state with default values', () => {
      const state = StateModule.createDefaultState();

      expect(state.agentMode).toBe('interactive');
      expect(state.permissionMode).toBe('plan');
      expect(state.agentStarting).toBe(false);
      expect(state.currentSessionId).toBeNull();
    });

    it('should have WebSocket reconnect state', () => {
      const state = StateModule.createDefaultState();

      expect(state.wsReconnect).toBeDefined();
      expect(state.wsReconnect.attempts).toBe(0);
      expect(state.wsReconnect.maxAttempts).toBe(50);
      expect(state.wsReconnect.baseDelay).toBe(1000);
      expect(state.wsReconnect.maxDelay).toBe(30000);
    });

    it('should have UI state with default values', () => {
      const state = StateModule.createDefaultState();

      expect(state.activeTab).toBe('agent-output');
      expect(state.fontSize).toBe(14);
      expect(state.agentOutputScrollLock).toBe(false);
      expect(state.debugPanelOpen).toBe(false);
    });

    it('should have conversation state with default values', () => {
      const state = StateModule.createDefaultState();

      expect(state.conversations).toEqual({});
      expect(state.currentConversationId).toBeNull();
      expect(state.currentConversationStats).toBeNull();
    });

    it('should have search state with default values', () => {
      const state = StateModule.createDefaultState();

      expect(state.search).toBeDefined();
      expect(state.search.query).toBe('');
      expect(state.search.currentIndex).toBe(-1);
      expect(state.search.matches).toEqual([]);
      expect(state.search.isOpen).toBe(false);
    });

    it('should have file browser state with default values', () => {
      const state = StateModule.createDefaultState();

      expect(state.fileBrowser).toBeDefined();
      expect(state.fileBrowser.expandedDirs).toEqual({});
      expect(state.fileBrowser.selectedFile).toBeNull();
      expect(state.openFiles).toEqual([]);
      expect(state.activeFilePath).toBeNull();
    });

    it('should have resource status state', () => {
      const state = StateModule.createDefaultState();

      expect(state.resourceStatus).toBeDefined();
      expect(state.resourceStatus.runningCount).toBe(0);
      expect(state.resourceStatus.maxConcurrent).toBe(3);
      expect(state.resourceStatus.queuedCount).toBe(0);
    });

    it('should have pending operations state', () => {
      const state = StateModule.createDefaultState();

      expect(state.pendingDeleteId).toBeNull();
      expect(state.pendingDeleteTask).toBeNull();
      expect(state.pendingImages).toEqual([]);
    });

    it('should have git state', () => {
      const state = StateModule.createDefaultState();

      expect(state.git).toBeDefined();
      expect(state.git.expandedDirs).toEqual({});
      expect(state.isGitOperating).toBe(false);
    });

    it('should return a new object each time', () => {
      const state1 = StateModule.createDefaultState();
      const state2 = StateModule.createDefaultState();

      expect(state1).not.toBe(state2);
      state1.selectedProjectId = 'test';
      expect(state2.selectedProjectId).toBeNull();
    });
  });

  describe('createStateManager', () => {
    it('should create a manager with required methods', () => {
      const manager = StateModule.createStateManager();

      expect(typeof manager.get).toBe('function');
      expect(typeof manager.set).toBe('function');
      expect(typeof manager.update).toBe('function');
      expect(typeof manager.reset).toBe('function');
      expect(typeof manager.onChange).toBe('function');
      expect(typeof manager.offChange).toBe('function');
      expect(typeof manager.getState).toBe('function');
    });

    it('should accept initial state', () => {
      const initialState = { selectedProjectId: 'test-project' };
      const manager = StateModule.createStateManager(initialState);

      expect(manager.get('selectedProjectId')).toBe('test-project');
    });

    it('should use default state when no initial state provided', () => {
      const manager = StateModule.createStateManager();

      expect(manager.get('agentMode')).toBe('interactive');
      expect(manager.get('permissionMode')).toBe('plan');
    });
  });

  describe('get', () => {
    it('should return value for simple key', () => {
      const manager = StateModule.createStateManager({ selectedProjectId: 'test' });

      expect(manager.get('selectedProjectId')).toBe('test');
    });

    it('should return value for nested key using dot notation', () => {
      const manager = StateModule.createStateManager({
        search: { query: 'hello', currentIndex: 5 }
      });

      expect(manager.get('search.query')).toBe('hello');
      expect(manager.get('search.currentIndex')).toBe(5);
    });

    it('should return undefined for non-existent key', () => {
      const manager = StateModule.createStateManager({});

      expect(manager.get('nonexistent')).toBeUndefined();
    });

    it('should return undefined for non-existent nested key', () => {
      const manager = StateModule.createStateManager({ search: {} });

      expect(manager.get('search.nonexistent')).toBeUndefined();
      expect(manager.get('nonexistent.nested')).toBeUndefined();
    });

    it('should return deep nested values', () => {
      const manager = StateModule.createStateManager({
        a: { b: { c: { d: 'deep' } } }
      });

      expect(manager.get('a.b.c.d')).toBe('deep');
    });

    it('should return full state when path is empty', () => {
      const initialState = { a: 1, b: 2 };
      const manager = StateModule.createStateManager(initialState);

      expect(manager.get('')).toEqual(initialState);
    });
  });

  describe('set', () => {
    it('should set value for simple key', () => {
      const manager = StateModule.createStateManager({});
      manager.set('selectedProjectId', 'new-project');

      expect(manager.get('selectedProjectId')).toBe('new-project');
    });

    it('should set value for nested key', () => {
      const manager = StateModule.createStateManager({ search: { query: '' } });
      manager.set('search.query', 'test');

      expect(manager.get('search.query')).toBe('test');
    });

    it('should create nested objects if they do not exist', () => {
      const manager = StateModule.createStateManager({});
      manager.set('search.query', 'test');

      expect(manager.get('search.query')).toBe('test');
      expect(manager.get('search')).toEqual({ query: 'test' });
    });

    it('should notify change listeners', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();
      manager.onChange('selectedProjectId', listener);

      manager.set('selectedProjectId', 'test');

      expect(listener).toHaveBeenCalledWith('test', undefined, 'selectedProjectId');
    });

    it('should notify wildcard listeners', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();
      manager.onChange('*', listener);

      manager.set('selectedProjectId', 'test');

      expect(listener).toHaveBeenCalledWith('test', undefined, 'selectedProjectId');
    });

    it('should notify parent path listeners', () => {
      const manager = StateModule.createStateManager({ search: { query: '' } });
      const listener = jest.fn();
      manager.onChange('search', listener);

      manager.set('search.query', 'test');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update multiple values at once', () => {
      const manager = StateModule.createStateManager({});

      manager.update({
        selectedProjectId: 'test',
        agentMode: 'autonomous'
      });

      expect(manager.get('selectedProjectId')).toBe('test');
      expect(manager.get('agentMode')).toBe('autonomous');
    });

    it('should update nested values', () => {
      const manager = StateModule.createStateManager({ search: { query: '', currentIndex: -1 } });

      manager.update({
        'search.query': 'hello',
        'search.currentIndex': 0
      });

      expect(manager.get('search.query')).toBe('hello');
      expect(manager.get('search.currentIndex')).toBe(0);
    });

    it('should notify change listeners for each update', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();
      manager.onChange('*', listener);

      manager.update({
        a: 1,
        b: 2
      });

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('should reset state to default values', () => {
      const manager = StateModule.createStateManager();

      manager.set('selectedProjectId', 'test');
      manager.set('agentMode', 'autonomous');

      manager.reset();

      expect(manager.get('selectedProjectId')).toBeNull();
      expect(manager.get('agentMode')).toBe('interactive');
    });

    it('should notify wildcard listeners', () => {
      const manager = StateModule.createStateManager({ selectedProjectId: 'test' });
      const listener = jest.fn();
      manager.onChange('*', listener);

      manager.reset();

      expect(listener).toHaveBeenCalledWith(expect.any(Object), null, '*');
    });
  });

  describe('onChange/offChange', () => {
    it('should register change listener for specific path', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();

      manager.onChange('selectedProjectId', listener);
      manager.set('selectedProjectId', 'value');

      expect(listener).toHaveBeenCalled();
    });

    it('should not call listener for different path', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();

      manager.onChange('selectedProjectId', listener);
      manager.set('agentMode', 'autonomous');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners for same path', () => {
      const manager = StateModule.createStateManager({});
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      manager.onChange('test', listener1);
      manager.onChange('test', listener2);
      manager.set('test', 'value');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should remove listener with offChange', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();

      manager.onChange('test', listener);
      manager.offChange('test', listener);
      manager.set('test', 'value');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle removing non-existent listener gracefully', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();

      expect(() => {
        manager.offChange('test', listener);
      }).not.toThrow();
    });

    it('should handle listener errors gracefully', () => {
      const manager = StateModule.createStateManager({});
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      manager.onChange('test', errorListener);
      manager.onChange('test', normalListener);
      manager.set('test', 'value');

      expect(normalListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getState', () => {
    it('should return full state object', () => {
      const initialState = { a: 1, b: 2 };
      const manager = StateModule.createStateManager(initialState);

      const state = manager.getState();

      expect(state).toEqual(initialState);
    });

    it('should return reference to internal state', () => {
      const manager = StateModule.createStateManager({ a: 1 });

      const state = manager.getState();
      state.a = 999;

      // Note: This returns a reference, not a copy
      expect(manager.get('a')).toBe(999);
    });
  });

  describe('complex state scenarios', () => {
    it('should handle array values', () => {
      const manager = StateModule.createStateManager({
        projects: ['a', 'b', 'c']
      });

      expect(manager.get('projects')).toEqual(['a', 'b', 'c']);

      manager.set('projects', ['x', 'y']);
      expect(manager.get('projects')).toEqual(['x', 'y']);
    });

    it('should handle null values', () => {
      const manager = StateModule.createStateManager({ value: 'test' });

      manager.set('value', null);
      expect(manager.get('value')).toBeNull();
    });

    it('should track multiple rapid changes', () => {
      const manager = StateModule.createStateManager({});
      const listener = jest.fn();
      manager.onChange('*', listener);

      manager.set('a', 1);
      manager.set('b', 2);
      manager.set('c', 3);

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should handle object values', () => {
      const manager = StateModule.createStateManager({});

      manager.set('resourceStatus', {
        runningCount: 2,
        maxConcurrent: 5
      });

      expect(manager.get('resourceStatus.runningCount')).toBe(2);
      expect(manager.get('resourceStatus.maxConcurrent')).toBe(5);
    });
  });
});
