/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:3000"}
 */

const WebSocketModule = require('../../public/js/modules/websocket-module');

describe('WebSocketModule', () => {
  let mockWebSocket;
  let originalWebSocket;

  beforeEach(() => {
    // Mock WebSocket
    mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1, // WebSocket.OPEN
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null
    };

    originalWebSocket = global.WebSocket;
    global.WebSocket = jest.fn(() => mockWebSocket);
    global.WebSocket.OPEN = 1;
    global.WebSocket.CLOSED = 3;

    jest.useFakeTimers();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  describe('createWebSocketManager', () => {
    it('should create a manager with default config', () => {
      const manager = WebSocketModule.createWebSocketManager();

      expect(manager).toBeDefined();
      expect(typeof manager.connect).toBe('function');
      expect(typeof manager.disconnect).toBe('function');
      expect(typeof manager.send).toBe('function');
    });

    it('should accept custom config options', () => {
      const manager = WebSocketModule.createWebSocketManager({
        maxAttempts: 10,
        baseDelay: 500
      });

      expect(manager).toBeDefined();
    });
  });

  describe('ConnectionState', () => {
    it('should export connection state constants', () => {
      const { ConnectionState } = WebSocketModule;

      expect(ConnectionState.DISCONNECTED).toBe('disconnected');
      expect(ConnectionState.CONNECTING).toBe('connecting');
      expect(ConnectionState.CONNECTED).toBe('connected');
      expect(ConnectionState.RECONNECTING).toBe('reconnecting');
      expect(ConnectionState.ERROR).toBe('error');
      expect(ConnectionState.FAILED).toBe('failed');
    });
  });

  describe('connect', () => {
    it('should create WebSocket with correct URL', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();

      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:3000');
    });

    // Note: Testing wss:// for https requires complex JSDOM location mocking
    // which is not straightforward. The implementation correctly checks
    // window.location.protocol and uses 'wss:' for 'https:' (see connect function)

    it('should notify state change to connecting', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const stateHandler = jest.fn();
      manager.onStateChange(stateHandler);

      manager.connect();

      expect(stateHandler).toHaveBeenCalledWith('connecting', undefined);
    });

    it('should notify state change to connected on open', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const stateHandler = jest.fn();
      manager.onStateChange(stateHandler);

      manager.connect();
      mockWebSocket.onopen();

      expect(stateHandler).toHaveBeenCalledWith('connected', undefined);
    });

    it('should schedule reconnect on connection failure', () => {
      global.WebSocket = jest.fn(() => {
        throw new Error('Connection failed');
      });

      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();

      expect(manager.getState()).toBe('reconnecting');
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      manager.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    it('should notify state change to disconnected', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const stateHandler = jest.fn();
      manager.onStateChange(stateHandler);

      manager.connect();
      stateHandler.mockClear();
      manager.disconnect();

      expect(stateHandler).toHaveBeenCalledWith('disconnected', undefined);
    });

    it('should clear reconnect timeout', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.onclose({ code: 1000 });

      // Should schedule reconnect
      expect(manager.getState()).toBe('reconnecting');

      manager.disconnect();

      // Run timers - reconnect should not happen
      jest.runAllTimers();
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('send', () => {
    it('should send JSON message when connected', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.onopen();

      const result = manager.send({ type: 'test', data: 'hello' });

      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith('{"type":"test","data":"hello"}');
    });

    it('should return false when not connected', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const result = manager.send({ type: 'test' });

      expect(result).toBe(false);
    });

    it('should return false when socket is not open', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.readyState = WebSocket.CLOSED;

      const result = manager.send({ type: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should send subscribe message', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.onopen();

      manager.subscribe('project-123');

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', projectId: 'project-123' })
      );
    });

    it('should send unsubscribe message', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.onopen();

      manager.unsubscribe('project-123');

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe', projectId: 'project-123' })
      );
    });

    it('should re-subscribe on reconnect', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.onopen();
      manager.subscribe('project-123');

      mockWebSocket.send.mockClear();

      // Simulate disconnect and reconnect
      mockWebSocket.onclose({ code: 1000 });
      jest.runOnlyPendingTimers();
      mockWebSocket.onopen();

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', projectId: 'project-123' })
      );
    });
  });

  describe('onMessage', () => {
    it('should register and call message handlers', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();
      manager.onMessage('test_type', handler);

      manager.connect();
      mockWebSocket.onmessage({ data: '{"type":"test_type","data":"hello"}' });

      expect(handler).toHaveBeenCalledWith({ type: 'test_type', data: 'hello' });
    });

    it('should support multiple handlers for same type', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      manager.onMessage('test_type', handler1);
      manager.onMessage('test_type', handler2);

      manager.connect();
      mockWebSocket.onmessage({ data: '{"type":"test_type"}' });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should not call handlers for different types', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();
      manager.onMessage('test_type', handler);

      manager.connect();
      mockWebSocket.onmessage({ data: '{"type":"other_type"}' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();
      manager.onMessage('test_type', handler);

      manager.connect();
      expect(() => {
        mockWebSocket.onmessage({ data: 'not json' });
      }).not.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('offMessage', () => {
    it('should remove message handler', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();
      manager.onMessage('test_type', handler);
      manager.offMessage('test_type', handler);

      manager.connect();
      mockWebSocket.onmessage({ data: '{"type":"test_type"}' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle removing non-existent handler gracefully', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();

      expect(() => {
        manager.offMessage('test_type', handler);
      }).not.toThrow();
    });
  });

  describe('onStateChange/offStateChange', () => {
    it('should register and call state change handlers', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();
      manager.onStateChange(handler);

      manager.connect();

      expect(handler).toHaveBeenCalledWith('connecting', undefined);
    });

    it('should remove state change handler', () => {
      const manager = WebSocketModule.createWebSocketManager();
      const handler = jest.fn();
      manager.onStateChange(handler);
      manager.offStateChange(handler);

      manager.connect();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('should reset attempt counter and connect', () => {
      const manager = WebSocketModule.createWebSocketManager({ maxAttempts: 2 });
      manager.connect();

      // Simulate multiple disconnects to increase attempt counter
      mockWebSocket.onclose({ code: 1000 });
      jest.runOnlyPendingTimers();
      mockWebSocket.onclose({ code: 1000 });

      // Manual reconnect should reset counter
      manager.reconnect();
      mockWebSocket.onopen();

      expect(manager.getState()).toBe('connected');
    });
  });

  describe('getState/isConnected', () => {
    it('should return current state', () => {
      const manager = WebSocketModule.createWebSocketManager();

      expect(manager.getState()).toBe('disconnected');

      manager.connect();
      expect(manager.getState()).toBe('connecting');

      mockWebSocket.onopen();
      expect(manager.getState()).toBe('connected');
    });

    it('should return true when connected', () => {
      const manager = WebSocketModule.createWebSocketManager();
      manager.connect();
      mockWebSocket.onopen();

      expect(manager.isConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      const manager = WebSocketModule.createWebSocketManager();

      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('exponential backoff', () => {
    it('should increase delay exponentially', () => {
      const manager = WebSocketModule.createWebSocketManager({
        baseDelay: 1000,
        maxDelay: 30000
      });
      const stateHandler = jest.fn();
      manager.onStateChange(stateHandler);

      manager.connect();
      mockWebSocket.onclose({ code: 1000 });

      // First reconnect
      const firstCall = stateHandler.mock.calls.find(
        call => call[0] === 'reconnecting'
      );
      expect(firstCall[1].nextRetryMs).toBeGreaterThanOrEqual(1000);
      expect(firstCall[1].nextRetryMs).toBeLessThanOrEqual(1250); // 1000 + 25% jitter

      jest.runOnlyPendingTimers();
      mockWebSocket.onclose({ code: 1000 });

      // Second reconnect should have longer delay
      const allReconnectCalls = stateHandler.mock.calls.filter(
        call => call[0] === 'reconnecting'
      );
      expect(allReconnectCalls[1][1].nextRetryMs).toBeGreaterThan(1250);
    });

    it('should cap delay at maxDelay', () => {
      const manager = WebSocketModule.createWebSocketManager({
        baseDelay: 1000,
        maxDelay: 2000
      });
      const stateHandler = jest.fn();
      manager.onStateChange(stateHandler);

      manager.connect();

      // Force many reconnects
      for (let i = 0; i < 10; i++) {
        mockWebSocket.onclose({ code: 1000 });
        jest.runOnlyPendingTimers();
      }

      const allReconnectCalls = stateHandler.mock.calls.filter(
        call => call[0] === 'reconnecting'
      );
      const lastDelay = allReconnectCalls[allReconnectCalls.length - 1][1].nextRetryMs;

      // Should be at most maxDelay + 25% jitter
      expect(lastDelay).toBeLessThanOrEqual(2500);
    });

    it('should fail after max attempts', () => {
      const manager = WebSocketModule.createWebSocketManager({
        maxAttempts: 3
      });
      const stateHandler = jest.fn();
      manager.onStateChange(stateHandler);

      manager.connect();

      for (let i = 0; i < 3; i++) {
        mockWebSocket.onclose({ code: 1000 });
        jest.runOnlyPendingTimers();
      }

      // After 3 attempts, should move to failed state
      mockWebSocket.onclose({ code: 1000 });

      expect(stateHandler).toHaveBeenCalledWith('failed', undefined);
    });
  });
});
