/**
 * State Module
 * Centralized application state management
 */
(function(root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StateModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /**
   * Create the default application state
   * @returns {Object} Default state object
   */
  function createDefaultState() {
    return {
      // Project management
      projects: [],
      selectedProjectId: null,
      projectSearchQuery: '',

      // Conversations
      conversations: {},
      currentConversationId: null,
      currentConversationStats: null,
      currentConversationMetadata: null,
      conversationHistoryOpen: false,

      // WebSocket
      websocket: null,
      wsReconnect: {
        attempts: 0,
        maxAttempts: 50,
        baseDelay: 1000,
        maxDelay: 30000,
        timeout: null
      },

      // Agent state
      agentMode: 'interactive',
      permissionMode: 'plan',
      pendingPermissionMode: null,
      currentAgentMode: null,
      agentStarting: false,
      messageSending: false,
      queuedMessageCount: 0,
      currentSessionId: null,
      currentPlanFile: null,
      waitingVersion: 0,
      activePromptType: null,
      isModeSwitching: false,

      // Resource status
      resourceStatus: {
        runningCount: 0,
        maxConcurrent: 3,
        queuedCount: 0,
        queuedProjects: []
      },

      // UI state
      activeTab: 'agent-output',
      fontSize: 14,
      agentOutputScrollLock: false,
      debugPanelOpen: false,
      debugRefreshInterval: null,
      agentStatusInterval: null,
      roadmapGenerating: false,
      devMode: false,

      // Folder browser
      folderBrowser: {
        currentPath: null
      },

      // File browser
      fileBrowser: {
        expandedDirs: {},
        selectedFile: null,
        rootEntries: []
      },

      // Open files
      openFiles: [],
      activeFilePath: null,

      // Claude files
      claudeFilesState: {
        files: [],
        currentFile: null
      },

      // Pending operations
      pendingDeleteId: null,
      pendingDeleteTask: null,
      pendingDeleteMilestone: null,
      pendingDeletePhase: null,
      pendingRenameConversationId: null,
      pendingDeleteFile: null,
      pendingCreateFile: null,
      pendingCreateFolder: null,
      pendingImages: [],

      // Tasks
      currentTodos: [],

      // Search
      search: {
        isOpen: false,
        query: '',
        matches: [],
        currentIndex: -1,
        filters: {
          user: true,
          assistant: true,
          tool: true,
          system: true
        },
        searchHistory: false,
        historyResults: []
      },

      // Debug
      debugExpandedLogs: {},
      debugLogFilters: {
        error: true,
        warn: true,
        info: true,
        debug: true,
        frontend: true
      },

      // Git
      git: {
        expandedDirs: {},
        selectedFile: null
      },
      gitContextTarget: null,
      isGitOperating: false,

      // Context menu
      contextMenuTarget: null,

      // Settings
      sendWithCtrlEnter: true,
      historyLimit: 25
    };
  }

  /**
   * Create a state manager with change tracking
   * @param {Object} initialState Optional initial state
   * @returns {Object} State manager interface
   */
  function createStateManager(initialState) {
    var state = initialState || createDefaultState();
    var changeListeners = {};

    /**
     * Get a value from state
     * @param {string} path Dot-notation path (e.g., 'search.query')
     * @returns {*} The value at the path
     */
    function get(path) {
      if (!path) return state;

      var parts = path.split('.');
      var value = state;

      for (var i = 0; i < parts.length; i++) {
        if (value === undefined || value === null) return undefined;
        value = value[parts[i]];
      }

      return value;
    }

    /**
     * Set a value in state
     * @param {string} path Dot-notation path
     * @param {*} value Value to set
     */
    function set(path, value) {
      var parts = path.split('.');
      var target = state;

      for (var i = 0; i < parts.length - 1; i++) {
        if (target[parts[i]] === undefined) {
          target[parts[i]] = {};
        }
        target = target[parts[i]];
      }

      var lastKey = parts[parts.length - 1];
      var oldValue = target[lastKey];
      target[lastKey] = value;

      notifyListeners(path, value, oldValue);
    }

    /**
     * Update multiple values at once
     * @param {Object} updates Object with path: value pairs
     */
    function update(updates) {
      for (var path in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, path)) {
          set(path, updates[path]);
        }
      }
    }

    /**
     * Reset state to defaults
     */
    function reset() {
      state = createDefaultState();
      notifyListeners('*', state, null);
    }

    /**
     * Register a change listener for a path
     * @param {string} path Path to watch (use '*' for all changes)
     * @param {Function} listener Callback function
     */
    function onChange(path, listener) {
      if (!changeListeners[path]) {
        changeListeners[path] = [];
      }
      changeListeners[path].push(listener);
    }

    /**
     * Remove a change listener
     * @param {string} path Path the listener was registered for
     * @param {Function} listener Callback to remove
     */
    function offChange(path, listener) {
      if (!changeListeners[path]) return;

      var index = changeListeners[path].indexOf(listener);

      if (index !== -1) {
        changeListeners[path].splice(index, 1);
      }
    }

    /**
     * Notify listeners of a change
     * @param {string} path Changed path
     * @param {*} newValue New value
     * @param {*} oldValue Old value
     */
    function notifyListeners(path, newValue, oldValue) {
      // Notify specific path listeners
      if (changeListeners[path]) {
        for (var i = 0; i < changeListeners[path].length; i++) {
          try {
            changeListeners[path][i](newValue, oldValue, path);
          } catch (err) {
            console.error('State change listener error:', err);
          }
        }
      }

      // Notify wildcard listeners
      if (changeListeners['*']) {
        for (var j = 0; j < changeListeners['*'].length; j++) {
          try {
            changeListeners['*'][j](newValue, oldValue, path);
          } catch (err) {
            console.error('State change listener error:', err);
          }
        }
      }

      // Notify parent path listeners (e.g., 'search' when 'search.query' changes)
      var parts = path.split('.');

      for (var k = 1; k < parts.length; k++) {
        var parentPath = parts.slice(0, k).join('.');

        if (changeListeners[parentPath]) {
          for (var l = 0; l < changeListeners[parentPath].length; l++) {
            try {
              changeListeners[parentPath][l](get(parentPath), null, parentPath);
            } catch (err) {
              console.error('State change listener error:', err);
            }
          }
        }
      }
    }

    /**
     * Get the raw state object (for backward compatibility)
     * @returns {Object} The state object
     */
    function getState() {
      return state;
    }

    return {
      get: get,
      set: set,
      update: update,
      reset: reset,
      onChange: onChange,
      offChange: offChange,
      getState: getState
    };
  }

  // Public API
  return {
    createDefaultState: createDefaultState,
    createStateManager: createStateManager
  };
}));
