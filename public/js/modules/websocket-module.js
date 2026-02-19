/**
 * @module WebSocketModule
 * @description Handles WebSocket connection, reconnection, and message routing for real-time communication
 * with the Claudito backend. Provides automatic reconnection with exponential backoff.
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

  /**
   * @typedef {Object} WebSocketConfig
   * @property {number} [maxAttempts=50] - Maximum reconnection attempts
   * @property {number} [baseDelay=1000] - Base delay for reconnection in ms
   * @property {number} [maxDelay=30000] - Maximum delay for reconnection in ms
   */

  // Default configuration
  var DEFAULT_CONFIG = {
    maxAttempts: 50,
    baseDelay: 1000,
    maxDelay: 30000
  };

  /**
   * @typedef {'disconnected'|'connecting'|'connected'|'reconnecting'|'error'|'failed'} ConnectionState
   */

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
   * @function createWebSocketManager
   * @memberof module:WebSocketModule
   * @param {WebSocketConfig} [options] - Configuration options
   * @returns {WebSocketManager} WebSocket manager interface
   * @example
   * const wsManager = WebSocketModule.createWebSocketManager({
   *   maxAttempts: 10,
   *   baseDelay: 2000
   * });
   * wsManager.connect('ws://localhost:3000');
   */
  function createWebSocketManager(options) {
    var config = Object.assign({}, DEFAULT_CONFIG, options || {});
    var socket = null;
    /** @type {string} */
    var state = ConnectionState.DISCONNECTED;
    var reconnectAttempts = 0;
    var reconnectTimeout = null;
    var messageHandlers = {};
    var stateChangeHandlers = [];
    var currentSubscription = null;

    /**
     * Calculate exponential backoff delay with jitter
     * @function calculateBackoffDelay
     * @private
     * @returns {number} Delay in milliseconds
     * @example
     * // First attempt: ~1000ms
     * // Second attempt: ~2000ms
     * // Third attempt: ~4000ms (with jitter)
     */
    function calculateBackoffDelay() {
      var exponentialDelay = config.baseDelay * Math.pow(2, reconnectAttempts - 1);
      var cappedDelay = Math.min(exponentialDelay, config.maxDelay);
      var jitter = Math.random() * 0.25 * cappedDelay;
      return Math.floor(cappedDelay + jitter);
    }

    /**
     * Notify state change handlers
     * @function notifyStateChange
     * @private
     * @param {string} newState - The new connection state
     * @param {Object} [extra] - Extra data (e.g., {nextRetryMs: 5000})
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
     * @function handleMessage
     * @private
     * @param {string} data - Raw message data from WebSocket
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
     * @function scheduleReconnect
     * @private
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
     * @function connect
     * @memberof WebSocketManager
     * @returns {void}
     * @fires WebSocketManager#statechange
     * @example
     * wsManager.connect();
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

        // Register this client with the server
        var clientId = sessionStorage.getItem('superengineer-client-id');
        if (clientId) {
          send({
            type: 'register',
            clientId: clientId,
            userAgent: navigator.userAgent
          });
        }

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
     * @function disconnect
     * @memberof WebSocketManager
     * @returns {void}
     * @fires WebSocketManager#statechange
     * @example
     * wsManager.disconnect();
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
     * @function send
     * @memberof WebSocketManager
     * @param {Object} message - Message object to send
     * @returns {boolean} True if sent successfully, false if not connected
     * @example
     * const sent = wsManager.send({
     *   type: 'agent_message',
     *   projectId: 'proj-123',
     *   content: 'Hello'
     * });
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
     * @function subscribe
     * @memberof WebSocketManager
     * @param {string} projectId - Project UUID to subscribe to
     * @returns {void}
     * @example
     * wsManager.subscribe('proj-123');
     */
    function subscribe(projectId) {
      currentSubscription = projectId;
      send({ type: 'subscribe', projectId: projectId });
    }

    /**
     * Unsubscribe from a project's updates
     * @function unsubscribe
     * @memberof WebSocketManager
     * @param {string} projectId - Project UUID to unsubscribe from
     * @returns {void}
     * @example
     * wsManager.unsubscribe('proj-123');
     */
    function unsubscribe(projectId) {
      if (currentSubscription === projectId) {
        currentSubscription = null;
      }
      send({ type: 'unsubscribe', projectId: projectId });
    }

    /**
     * Register a message handler for a specific message type
     * @function onMessage
     * @memberof WebSocketManager
     * @param {string} type - Message type (e.g., 'agent_message', 'agent_status')
     * @param {MessageHandler} handler - Handler function
     * @returns {void}
     * @example
     * wsManager.onMessage('agent_message', (msg) => {
     *   console.log('Agent says:', msg.data.content);
     * });
     */
    function onMessage(type, handler) {
      if (!messageHandlers[type]) {
        messageHandlers[type] = [];
      }
      messageHandlers[type].push(handler);
    }

    /**
     * Remove a message handler
     * @function offMessage
     * @memberof WebSocketManager
     * @param {string} type - Message type
     * @param {MessageHandler} handler - Handler function to remove
     * @returns {void}
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
     * @function onStateChange
     * @memberof WebSocketManager
     * @param {StateChangeHandler} handler - Handler function
     * @returns {void}
     * @example
     * wsManager.onStateChange((state, extra) => {
     *   if (state === 'connected') {
     *     console.log('WebSocket connected!');
     *   } else if (state === 'reconnecting') {
     *     console.log(`Reconnecting in ${extra.nextRetryMs}ms`);
     *   }
     * });
     */
    function onStateChange(handler) {
      stateChangeHandlers.push(handler);
    }

    /**
     * Remove a state change handler
     * @function offStateChange
     * @memberof WebSocketManager
     * @param {StateChangeHandler} handler - Handler function to remove
     * @returns {void}
     */
    function offStateChange(handler) {
      var index = stateChangeHandlers.indexOf(handler);

      if (index !== -1) {
        stateChangeHandlers.splice(index, 1);
      }
    }

    /**
     * Manual reconnect (resets attempt counter)
     * @function reconnect
     * @memberof WebSocketManager
     * @returns {void}
     * @example
     * // Force reconnect after network change
     * wsManager.reconnect();
     */
    function reconnect() {
      reconnectAttempts = 0;
      connect();
    }

    /**
     * Get current connection state
     * @function getState
     * @memberof WebSocketManager
     * @returns {ConnectionState} Current state
     * @example
     * const state = wsManager.getState();
     * console.log(`WebSocket is ${state}`);
     */
    function getState() {
      return state;
    }

    /**
     * Check if connected
     * @function isConnected
     * @memberof WebSocketManager
     * @returns {boolean} True if connected
     * @example
     * if (wsManager.isConnected()) {
     *   wsManager.send({ type: 'ping' });
     * }
     */
    function isConnected() {
      return state === ConnectionState.CONNECTED;
    }

    /**
     * @typedef {Object} WebSocketManager
     * @property {Function} connect - Connect to WebSocket server
     * @property {Function} disconnect - Disconnect from server
     * @property {Function} send - Send message to server
     * @property {Function} subscribe - Subscribe to project updates
     * @property {Function} unsubscribe - Unsubscribe from project
     * @property {Function} onMessage - Register message handler
     * @property {Function} offMessage - Remove message handler
     * @property {Function} onStateChange - Register state change handler
     * @property {Function} offStateChange - Remove state change handler
     * @property {Function} reconnect - Force reconnection
     * @property {Function} getState - Get current state
     * @property {Function} isConnected - Check if connected
     */
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

  /**
   * @typedef {Function} MessageHandler
   * @param {WebSocketMessage} message - The WebSocket message
   */

  /**
   * @typedef {Function} StateChangeHandler
   * @param {ConnectionState} state - New connection state
   * @param {Object} [extra] - Additional information (e.g., nextRetryMs)
   */

  /**
   * @typedef {Object} WebSocketMessage
   * @property {string} type - Message type
   * @property {string} [projectId] - Project ID for project-specific messages
   * @property {*} [data] - Message payload
   */

  // Public API
  return {
    createWebSocketManager: createWebSocketManager,
    ConnectionState: ConnectionState
  };
}));
