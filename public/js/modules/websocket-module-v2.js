/**
 * WebSocket Module V2 - With Memory Leak Fixes
 * Handles WebSocket connection, reconnection, and message routing
 */
(function(root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WebSocketModuleV2 = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Default configuration
  var DEFAULT_CONFIG = {
    maxAttempts: 50,
    baseDelay: 1000,
    maxDelay: 30000,
    maxMessageHandlers: 100, // Prevent unbounded growth
    maxStateHandlers: 50     // Prevent unbounded growth
  };

  // Connection states
  var ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error',
    FAILED: 'failed'
  };

  /**
   * Create a new WebSocket manager
   * @param {Object} options Configuration options
   * @returns {Object} WebSocket manager interface
   */
  function createWebSocketManager(options) {
    var config = Object.assign({}, DEFAULT_CONFIG, options || {});
    var socket = null;
    var state = ConnectionState.DISCONNECTED;
    var reconnectAttempts = 0;
    var reconnectTimeout = null;
    var messageHandlers = {};
    var stateChangeHandlers = [];
    var currentSubscription = null;
    var isDestroyed = false;

    // Weak references to prevent memory leaks
    var handlerWeakMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    /**
     * Calculate exponential backoff delay with jitter
     * @returns {number} Delay in milliseconds
     */
    function calculateBackoffDelay() {
      var exponentialDelay = config.baseDelay * Math.pow(2, reconnectAttempts - 1);
      var cappedDelay = Math.min(exponentialDelay, config.maxDelay);
      var jitter = Math.random() * 0.25 * cappedDelay;
      return Math.floor(cappedDelay + jitter);
    }

    /**
     * Notify state change handlers
     * @param {string} newState The new connection state
     * @param {Object} extra Extra data (e.g., nextRetryMs)
     */
    function notifyStateChange(newState, extra) {
      state = newState;

      // Create a copy to avoid modification during iteration
      var handlers = stateChangeHandlers.slice();

      for (var i = 0; i < handlers.length; i++) {
        try {
          handlers[i](newState, extra);
        } catch (err) {
          console.error('State change handler error:', err);
        }
      }
    }

    /**
     * Handle incoming WebSocket message
     * @param {string} data Raw message data
     */
    function handleMessage(data) {
      if (isDestroyed) return;

      var message;

      try {
        message = JSON.parse(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
        return;
      }

      var type = message.type;

      if (messageHandlers[type]) {
        // Create a copy to avoid modification during iteration
        var handlers = messageHandlers[type].slice();

        for (var i = 0; i < handlers.length; i++) {
          try {
            handlers[i](message);
          } catch (err) {
            console.error('Message handler error for type ' + type + ':', err);
          }
        }
      }
    }

    /**
     * Clean up socket event handlers
     */
    function cleanupSocketHandlers() {
      if (!socket) return;

      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    }

    /**
     * Schedule a reconnection attempt
     */
    function scheduleReconnect() {
      if (isDestroyed) return;

      if (reconnectAttempts >= config.maxAttempts) {
        console.error('Max WebSocket reconnection attempts reached');
        notifyStateChange(ConnectionState.FAILED);
        return;
      }

      reconnectAttempts++;
      var delay = calculateBackoffDelay();
      console.log('WebSocket reconnecting in ' + delay + 'ms (attempt ' + reconnectAttempts + ')');
      notifyStateChange(ConnectionState.RECONNECTING, { nextRetryMs: delay });

      reconnectTimeout = setTimeout(function() {
        if (!isDestroyed) {
          connect();
        }
      }, delay);
    }

    /**
     * Connect to WebSocket server
     */
    function connect() {
      if (isDestroyed) return;

      // Clear any pending reconnect
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Clean up existing socket
      if (socket) {
        cleanupSocketHandlers();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        socket = null;
      }

      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = protocol + '//' + window.location.host;

      notifyStateChange(ConnectionState.CONNECTING);

      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        console.error('WebSocket creation failed:', err);
        scheduleReconnect();
        return;
      }

      socket.onopen = function() {
        if (isDestroyed) {
          socket.close();
          return;
        }

        console.log('WebSocket connected');
        reconnectAttempts = 0;
        notifyStateChange(ConnectionState.CONNECTED);

        // Re-subscribe if there was a previous subscription
        if (currentSubscription) {
          subscribe(currentSubscription);
        }
      };

      socket.onmessage = function(event) {
        if (!isDestroyed) {
          handleMessage(event.data);
        }
      };

      socket.onclose = function(event) {
        if (isDestroyed) return;

        console.log('WebSocket disconnected (code: ' + event.code + ')');
        cleanupSocketHandlers();
        socket = null;
        notifyStateChange(ConnectionState.DISCONNECTED);
        scheduleReconnect();
      };

      socket.onerror = function(error) {
        if (isDestroyed) return;

        console.error('WebSocket error:', error);
        notifyStateChange(ConnectionState.ERROR);
      };
    }

    /**
     * Disconnect from WebSocket server
     */
    function disconnect() {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (socket) {
        cleanupSocketHandlers();
        socket.close();
        socket = null;
      }

      notifyStateChange(ConnectionState.DISCONNECTED);
    }

    /**
     * Send a message to the server
     * @param {Object} message Message object to send
     * @returns {boolean} True if sent successfully
     */
    function send(message) {
      if (isDestroyed || !socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected, cannot send message');
        return false;
      }

      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
        return false;
      }
    }

    /**
     * Subscribe to a project's updates
     * @param {string} projectId Project ID to subscribe to
     */
    function subscribe(projectId) {
      currentSubscription = projectId;
      send({ type: 'subscribe', projectId: projectId });
    }

    /**
     * Unsubscribe from a project's updates
     * @param {string} projectId Project ID to unsubscribe from
     */
    function unsubscribe(projectId) {
      if (currentSubscription === projectId) {
        currentSubscription = null;
      }
      send({ type: 'unsubscribe', projectId: projectId });
    }

    /**
     * Register a message handler for a specific message type
     * @param {string} type Message type
     * @param {Function} handler Handler function
     */
    function onMessage(type, handler) {
      if (!messageHandlers[type]) {
        messageHandlers[type] = [];
      }

      // Prevent unbounded growth
      if (messageHandlers[type].length >= config.maxMessageHandlers) {
        console.warn('Maximum message handlers reached for type: ' + type);
        return;
      }

      // Check for duplicate handlers
      if (messageHandlers[type].indexOf(handler) === -1) {
        messageHandlers[type].push(handler);
      }
    }

    /**
     * Remove a message handler
     * @param {string} type Message type
     * @param {Function} handler Handler function to remove
     */
    function offMessage(type, handler) {
      if (!messageHandlers[type]) return;

      var index = messageHandlers[type].indexOf(handler);

      if (index !== -1) {
        messageHandlers[type].splice(index, 1);
      }

      // Clean up empty handler arrays
      if (messageHandlers[type].length === 0) {
        delete messageHandlers[type];
      }
    }

    /**
     * Remove all message handlers for a type
     * @param {string} type Message type (optional, removes all if not specified)
     */
    function offAllMessages(type) {
      if (type) {
        delete messageHandlers[type];
      } else {
        messageHandlers = {};
      }
    }

    /**
     * Register a state change handler
     * @param {Function} handler Handler function
     */
    function onStateChange(handler) {
      // Prevent unbounded growth
      if (stateChangeHandlers.length >= config.maxStateHandlers) {
        console.warn('Maximum state change handlers reached');
        return;
      }

      // Check for duplicate handlers
      if (stateChangeHandlers.indexOf(handler) === -1) {
        stateChangeHandlers.push(handler);
      }
    }

    /**
     * Remove a state change handler
     * @param {Function} handler Handler function to remove
     */
    function offStateChange(handler) {
      var index = stateChangeHandlers.indexOf(handler);

      if (index !== -1) {
        stateChangeHandlers.splice(index, 1);
      }
    }

    /**
     * Remove all state change handlers
     */
    function offAllStateChanges() {
      stateChangeHandlers = [];
    }

    /**
     * Manual reconnect (resets attempt counter)
     */
    function reconnect() {
      if (isDestroyed) return;

      reconnectAttempts = 0;
      connect();
    }

    /**
     * Get current connection state
     * @returns {string} Current state
     */
    function getState() {
      return state;
    }

    /**
     * Check if connected
     * @returns {boolean} True if connected
     */
    function isConnected() {
      return state === ConnectionState.CONNECTED && socket && socket.readyState === WebSocket.OPEN;
    }

    /**
     * Get statistics about the WebSocket manager
     * @returns {Object} Statistics
     */
    function getStats() {
      var stats = {
        state: state,
        reconnectAttempts: reconnectAttempts,
        messageHandlerCount: 0,
        stateHandlerCount: stateChangeHandlers.length,
        currentSubscription: currentSubscription
      };

      for (var type in messageHandlers) {
        if (messageHandlers.hasOwnProperty(type)) {
          stats.messageHandlerCount += messageHandlers[type].length;
        }
      }

      return stats;
    }

    /**
     * Destroy the WebSocket manager and clean up all resources
     */
    function destroy() {
      isDestroyed = true;

      // Cancel any pending reconnect
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Disconnect and clean up socket
      if (socket) {
        cleanupSocketHandlers();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        socket = null;
      }

      // Clear all handlers
      messageHandlers = {};
      stateChangeHandlers = [];

      // Clear subscription
      currentSubscription = null;

      // Reset state
      state = ConnectionState.DISCONNECTED;
      reconnectAttempts = 0;
    }

    return {
      connect: connect,
      disconnect: disconnect,
      send: send,
      subscribe: subscribe,
      unsubscribe: unsubscribe,
      onMessage: onMessage,
      offMessage: offMessage,
      offAllMessages: offAllMessages,
      onStateChange: onStateChange,
      offStateChange: offStateChange,
      offAllStateChanges: offAllStateChanges,
      reconnect: reconnect,
      getState: getState,
      isConnected: isConnected,
      getStats: getStats,
      destroy: destroy
    };
  }

  // Public API
  return {
    createWebSocketManager: createWebSocketManager,
    ConnectionState: ConnectionState
  };
}));