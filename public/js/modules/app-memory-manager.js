/**
 * App Memory Manager Module
 * Integrates memory cleanup utilities throughout the application
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppMemoryManager = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var MemoryCleanup = window.MemoryCleanup;
  var componentManagers = {};
  var globalCleanupFunctions = [];
  var isInitialized = false;

  /**
   * Initialize the memory manager
   * @param {Object} options Configuration options
   */
  function init(options) {
    if (isInitialized) {
      console.warn('AppMemoryManager already initialized');
      return;
    }

    options = options || {};
    MemoryCleanup = options.MemoryCleanup || window.MemoryCleanup;

    if (!MemoryCleanup) {
      console.error('MemoryCleanup module not found');
      return;
    }

    isInitialized = true;

    // Set up global cleanup handlers
    setupGlobalCleanup();

    // Monitor memory usage
    if (options.enableMonitoring) {
      startMemoryMonitoring();
    }
  }

  /**
   * Create a managed component with automatic cleanup
   * @param {string} componentName Component name
   * @param {Object} component Component module
   * @returns {Object} Managed component
   */
  function createManagedComponent(componentName, component) {
    if (!MemoryCleanup) {
      console.warn('MemoryCleanup not available, returning component as-is');
      return component;
    }

    var manager = MemoryCleanup.createCleanupManager(componentName);
    componentManagers[componentName] = manager;

    // Create a wrapper that adds cleanup tracking
    var managedComponent = Object.create(component);

    // Override init method if it exists
    if (typeof component.init === 'function') {
      managedComponent.init = function() {
        var result = component.init.apply(component, arguments);

        // Inject cleanup manager into dependencies if possible
        if (arguments[0] && typeof arguments[0] === 'object') {
          arguments[0].cleanupManager = manager;
          arguments[0].MemoryCleanup = MemoryCleanup;
        }

        return result;
      };
    }

    // Add cleanup method
    managedComponent.cleanup = function() {
      manager.cleanup();

      // Call original cleanup if exists
      if (typeof component.cleanup === 'function') {
        component.cleanup();
      }

      // Remove from registry
      delete componentManagers[componentName];
    };

    // Add memory management methods
    managedComponent.getCleanupManager = function() {
      return manager;
    };

    return managedComponent;
  }

  /**
   * Replace app.js WebSocket with managed version
   * @param {Object} state Application state object
   * @returns {Object} Managed WebSocket
   */
  function createManagedWebSocket(state) {
    if (!MemoryCleanup) {
      return null;
    }

    var manager = MemoryCleanup.createCleanupManager('WebSocket');
    var reconnectTimeout = null;

    var managedWebSocket = {
      socket: null,
      attempts: 0,

      connect: function(url) {
        this.cleanup();

        try {
          this.socket = new WebSocket(url);
          this.setupHandlers();
        } catch (err) {
          console.error('WebSocket creation failed:', err);
          this.scheduleReconnect();
        }
      },

      setupHandlers: function() {
        var self = this;

        manager.addEventListener(this.socket, 'open', function() {
          console.log('WebSocket connected');
          self.attempts = 0;

          if (typeof self.onopen === 'function') {
            self.onopen();
          }
        });

        manager.addEventListener(this.socket, 'message', function(event) {
          if (typeof self.onmessage === 'function') {
            self.onmessage(event);
          }
        });

        manager.addEventListener(this.socket, 'close', function(event) {
          console.log('WebSocket disconnected (code: ' + event.code + ')');

          if (typeof self.onclose === 'function') {
            self.onclose(event);
          }

          self.scheduleReconnect();
        });

        manager.addEventListener(this.socket, 'error', function(error) {
          console.error('WebSocket error:', error);

          if (typeof self.onerror === 'function') {
            self.onerror(error);
          }
        });
      },

      scheduleReconnect: function() {
        if (this.attempts >= 50) {
          console.error('Max WebSocket reconnection attempts reached');
          return;
        }

        this.attempts++;
        var delay = Math.min(1000 * Math.pow(2, this.attempts - 1), 30000);
        var self = this;

        reconnectTimeout = manager.setTimeout(function() {
          self.connect(self.url);
        }, delay);
      },

      send: function(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(data);
          return true;
        }
        return false;
      },

      cleanup: function() {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }

        if (this.socket) {
          this.socket.close();
          this.socket = null;
        }

        manager.cleanup();
      },

      // Public properties that can be set
      url: null,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null
    };

    return managedWebSocket;
  }

  /**
   * Setup global cleanup handlers
   */
  function setupGlobalCleanup() {
    // Handle page unload
    var unloadHandler = function() {
      cleanupAll();
    };

    window.addEventListener('beforeunload', unloadHandler);

    globalCleanupFunctions.push(function() {
      window.removeEventListener('beforeunload', unloadHandler);
    });

    // Handle visibility changes
    var visibilityHandler = function() {
      if (document.hidden) {
        // Page is hidden, cleanup non-essential resources
        cleanupInactive();
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);

    globalCleanupFunctions.push(function() {
      document.removeEventListener('visibilitychange', visibilityHandler);
    });
  }

  /**
   * Start memory monitoring
   */
  function startMemoryMonitoring() {
    if (!window.performance || !window.performance.memory) {
      console.log('Memory monitoring not available');
      return;
    }

    var checkInterval = setInterval(function() {
      var memory = window.performance.memory;
      var usedJSHeapSize = memory.usedJSHeapSize;
      var totalJSHeapSize = memory.totalJSHeapSize;
      var jsHeapSizeLimit = memory.jsHeapSizeLimit;

      var usage = (usedJSHeapSize / jsHeapSizeLimit) * 100;

      if (usage > 90) {
        console.warn('High memory usage detected:', usage.toFixed(2) + '%');
        // Trigger aggressive cleanup
        cleanupInactive();
      }

      // Log stats for debugging
      if (window.SUPERENGINEER_V5_DEBUG) {
        console.log('Memory stats:', {
          used: formatBytes(usedJSHeapSize),
          total: formatBytes(totalJSHeapSize),
          limit: formatBytes(jsHeapSizeLimit),
          usage: usage.toFixed(2) + '%'
        });
      }
    }, 30000); // Check every 30 seconds

    globalCleanupFunctions.push(function() {
      clearInterval(checkInterval);
    });
  }

  /**
   * Format bytes for display
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Cleanup inactive components
   */
  function cleanupInactive() {
    console.log('Cleaning up inactive components');

    // Clear large cached data
    if (window.state) {
      // Clear old conversation messages
      if (window.state.conversations) {
        var activeProjectId = window.state.selectedProjectId;
        for (var projectId in window.state.conversations) {
          if (projectId !== activeProjectId && window.state.conversations[projectId]) {
            // Keep only last 100 messages for inactive projects
            var messages = window.state.conversations[projectId].messages;
            if (messages && messages.length > 100) {
              window.state.conversations[projectId].messages = messages.slice(-100);
            }
          }
        }
      }

      // Clear file browser cache for non-visible files
      if (window.state.fileBrowser && window.state.fileBrowser.rootEntries) {
        cleanupFileTree(window.state.fileBrowser.rootEntries);
      }
    }

    // Run garbage collection if available
    if (window.gc) {
      window.gc();
    }
  }

  /**
   * Cleanup file tree entries
   * @param {Array} entries
   */
  function cleanupFileTree(entries) {
    if (!entries || !Array.isArray(entries)) return;

    entries.forEach(function(entry) {
      // Clear children of collapsed directories
      if (entry.isDirectory && entry.children && !window.state.fileBrowser.expandedDirs[entry.path]) {
        entry.children = null;
      } else if (entry.children) {
        cleanupFileTree(entry.children);
      }
    });
  }

  /**
   * Cleanup all components
   */
  function cleanupAll() {
    console.log('Cleaning up all components');

    // Cleanup all component managers
    for (var componentName in componentManagers) {
      if (componentManagers.hasOwnProperty(componentName)) {
        componentManagers[componentName].cleanup();
      }
    }
    componentManagers = {};

    // Run global cleanup functions
    globalCleanupFunctions.forEach(function(fn) {
      try {
        fn();
      } catch (err) {
        console.error('Global cleanup error:', err);
      }
    });
    globalCleanupFunctions = [];

    // Run MemoryCleanup global cleanup
    if (MemoryCleanup && MemoryCleanup.cleanupAll) {
      MemoryCleanup.cleanupAll();
    }

    isInitialized = false;
  }

  /**
   * Get memory statistics
   * @returns {Object}
   */
  function getMemoryStats() {
    var stats = {
      componentCount: Object.keys(componentManagers).length,
      components: Object.keys(componentManagers),
      memoryUsage: null
    };

    if (window.performance && window.performance.memory) {
      var memory = window.performance.memory;
      stats.memoryUsage = {
        used: formatBytes(memory.usedJSHeapSize),
        total: formatBytes(memory.totalJSHeapSize),
        limit: formatBytes(memory.jsHeapSizeLimit),
        percentage: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
      };
    }

    return stats;
  }

  return {
    init: init,
    createManagedComponent: createManagedComponent,
    createManagedWebSocket: createManagedWebSocket,
    cleanupInactive: cleanupInactive,
    cleanupAll: cleanupAll,
    getMemoryStats: getMemoryStats
  };
}));