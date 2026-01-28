/**
 * WebSocket Module
 * Handles WebSocket connection, reconnection, and message routing
 */
(function(root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WebSocketModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Default configuration
  var DEFAULT_CONFIG = {
    maxAttempts: 50,
    baseDelay: 1000,
    maxDelay: 30000
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

      for (var i = 0; i < stateChangeHandlers.length; i++) {
        try {
          stateChangeHandlers[i](newState, extra);
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
      var message;

      try {
        message = JSON.parse(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
        return;
      }

      var type = message.type;

      if (messageHandlers[type]) {
        for (var i = 0; i < messageHandlers[type].length; i++) {
          try {
            messageHandlers[type][i](message);
          } catch (err) {
            console.error('Message handler error for type ' + type + ':', err);
          }
        }
      }
    }

    /**
     * Schedule a reconnection attempt
     */
    function scheduleReconnect() {
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
        connect();
      }, delay);
    }

    /**
     * Connect to WebSocket server
     */
    function connect() {
      // Clear any pending reconnect
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
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
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        notifyStateChange(ConnectionState.CONNECTED);

        // Re-subscribe if there was a previous subscription
        if (currentSubscription) {
          subscribe(currentSubscription);
        }
      };

      socket.onmessage = function(event) {
        handleMessage(event.data);
      };

      socket.onclose = function(event) {
        console.log('WebSocket disconnected (code: ' + event.code + ')');
        notifyStateChange(ConnectionState.DISCONNECTED);
        scheduleReconnect();
      };

      socket.onerror = function(error) {
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
        socket.onclose = null; // Prevent reconnect on intentional close
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
      if (!socket || socket.readyState !== WebSocket.OPEN) {
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
      messageHandlers[type].push(handler);
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
    }

    /**
     * Register a state change handler
     * @param {Function} handler Handler function
     */
    function onStateChange(handler) {
      stateChangeHandlers.push(handler);
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
     * Manual reconnect (resets attempt counter)
     */
    function reconnect() {
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
      return state === ConnectionState.CONNECTED;
    }

    return {
      connect: connect,
      disconnect: disconnect,
      send: send,
      subscribe: subscribe,
      unsubscribe: unsubscribe,
      onMessage: onMessage,
      offMessage: offMessage,
      onStateChange: onStateChange,
      offStateChange: offStateChange,
      reconnect: reconnect,
      getState: getState,
      isConnected: isConnected
    };
  }

  // Public API
  return {
    createWebSocketManager: createWebSocketManager,
    ConnectionState: ConnectionState
  };
}));
