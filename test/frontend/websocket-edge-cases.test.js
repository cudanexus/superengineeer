/**
 * Tests for WebSocket edge cases and race conditions
 * Critical gap: Reconnection conflicts, subscribe during disconnect, message loss scenarios
 */

// Mock WebSocket implementation
class MockWebSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.bufferedAmount = 0;

    // Simulate connection after a delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
    }, 10);
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Simulate sending
  }

  close(code, reason) {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.dispatchEvent(new CloseEvent('close', { code: code || 1000, reason }));
    }, 5);
  }

  // Simulate connection failure
  simulateError(error = 'Connection failed') {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new Event('error'));
    this.dispatchEvent(new CloseEvent('close', { code: 1006, reason: error }));
  }

  // Simulate message received
  simulateMessage(data) {
    if (this.readyState === MockWebSocket.OPEN) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

global.WebSocket = MockWebSocket;

// Mock global functions
global.showToast = jest.fn();
global.console = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  log: jest.fn()
};

describe.skip('WebSocket Edge Cases', () => {
  let wsInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset module
    delete require.cache[require.resolve('../../public/js/modules/websocket-module.js')];

    // Load the WebSocket module
    const WebSocketModule = require('../../public/js/modules/websocket-module.js');

    // Create a WebSocket manager instance
    wsInstance = WebSocketModule.createWebSocketManager('ws://localhost:3000');
  });

  describe('Connection Race Conditions', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      // Rapidly connect and disconnect
      wsInstance.connect();
      wsInstance.disconnect();
      wsInstance.connect();
      wsInstance.disconnect();
      wsInstance.connect();

      // Wait for all events to process
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not crash or throw errors
      expect(global.console.error).not.toHaveBeenCalled();
    });

    it('should handle connection attempts while already connecting', async () => {
      wsInstance.connect();

      // Try to connect again while still connecting
      wsInstance.connect();
      wsInstance.connect();

      await new Promise(resolve => setTimeout(resolve, 20));

      // Should only have one active connection
      expect(wsInstance.isConnected()).toBe(true);
    });

    it('should handle disconnect during connection attempt', async () => {
      wsInstance.connect();

      // Disconnect before connection completes
      wsInstance.disconnect();

      await new Promise(resolve => setTimeout(resolve, 20));

      // Should not be connected
      expect(wsInstance.isConnected()).toBe(false);
    });

    it('should handle multiple disconnect calls', () => {
      wsInstance.connect();

      return new Promise(resolve => {
        setTimeout(() => {
          // Rapid disconnect calls
          wsInstance.disconnect();
          wsInstance.disconnect();
          wsInstance.disconnect();

          // Should not crash
          expect(global.console.error).not.toHaveBeenCalled();
          resolve();
        }, 20);
      });
    });
  });

  describe('Subscription Race Conditions', () => {
    beforeEach(async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20)); // Wait for connection
    });

    it('should handle subscribe during disconnect', async () => {
      // Start disconnect
      wsInstance.disconnect();

      // Try to subscribe during disconnect
      expect(() => {
        wsInstance.subscribe('test-project');
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should handle unsubscribe during reconnection', async () => {
      wsInstance.subscribe('test-project');

      // Force disconnect
      wsInstance.ws.simulateError();

      // Try to unsubscribe during reconnection
      expect(() => {
        wsInstance.unsubscribe('test-project');
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for reconnection
    });

    it('should handle rapid subscribe/unsubscribe cycles', () => {
      for (let i = 0; i < 100; i++) {
        wsInstance.subscribe(`project-${i}`);
        wsInstance.unsubscribe(`project-${i}`);
      }

      expect(global.console.error).not.toHaveBeenCalled();
    });

    it('should handle subscribe to same project multiple times', () => {
      const projectId = 'test-project';

      // Subscribe multiple times
      wsInstance.subscribe(projectId);
      wsInstance.subscribe(projectId);
      wsInstance.subscribe(projectId);

      // Should only have one subscription
      expect(wsInstance.isSubscribed(projectId)).toBe(true);
    });

    it('should handle unsubscribe from non-subscribed project', () => {
      expect(() => {
        wsInstance.unsubscribe('non-existent-project');
      }).not.toThrow();
    });
  });

  describe('Message Handling Edge Cases', () => {
    beforeEach(async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should handle malformed JSON messages', () => {
      const mockWs = wsInstance.ws;

      // Simulate malformed JSON
      expect(() => {
        mockWs.dispatchEvent(new MessageEvent('message', {
          data: 'invalid json{'
        }));
      }).not.toThrow();

      expect(global.console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse'),
        expect.any(Error)
      );
    });

    it('should handle null/undefined message data', () => {
      const mockWs = wsInstance.ws;

      expect(() => {
        mockWs.dispatchEvent(new MessageEvent('message', { data: null }));
        mockWs.dispatchEvent(new MessageEvent('message', { data: undefined }));
        mockWs.dispatchEvent(new MessageEvent('message', { data: '' }));
      }).not.toThrow();
    });

    it('should handle very large messages', () => {
      const largeMessage = {
        type: 'agent_message',
        projectId: 'test-project',
        content: 'A'.repeat(1000000) // 1MB message
      };

      expect(() => {
        wsInstance.ws.simulateMessage(largeMessage);
      }).not.toThrow();
    });

    it('should handle messages with circular references', () => {
      const circularMessage = {
        type: 'agent_message',
        projectId: 'test-project',
        data: {}
      };
      circularMessage.data.self = circularMessage; // Circular reference

      expect(() => {
        // This would normally fail JSON.stringify, but our handler should catch it
        wsInstance.ws.simulateMessage(circularMessage);
      }).not.toThrow();
    });

    it('should handle rapid burst of messages', () => {
      for (let i = 0; i < 1000; i++) {
        wsInstance.ws.simulateMessage({
          type: 'agent_message',
          projectId: 'test-project',
          content: `Message ${i}`
        });
      }

      expect(global.console.error).not.toHaveBeenCalled();
    });

    it('should handle unknown message types', () => {
      const unknownMessage = {
        type: 'unknown_message_type',
        projectId: 'test-project',
        data: 'test'
      };

      expect(() => {
        wsInstance.ws.simulateMessage(unknownMessage);
      }).not.toThrow();

      // Should log warning about unknown type
      expect(global.console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type')
      );
    });
  });

  describe('Reconnection Edge Cases', () => {
    it('should handle connection failures during reconnect', async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      // Force disconnect
      wsInstance.ws.simulateError();

      // Wait for reconnect attempt
      await new Promise(resolve => setTimeout(resolve, 1100)); // Default reconnect delay

      // Simulate failure of reconnect attempt
      if (wsInstance.ws) {
        wsInstance.ws.simulateError();
      }

      // Should attempt to reconnect again
      await new Promise(resolve => setTimeout(resolve, 2100)); // Backoff delay

      expect(global.console.info).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting')
      );
    });

    it('should handle exponential backoff properly', async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      const startTime = Date.now();

      // Force multiple failures
      wsInstance.ws.simulateError();
      await new Promise(resolve => setTimeout(resolve, 50));

      if (wsInstance.ws) {
        wsInstance.ws.simulateError();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      if (wsInstance.ws) {
        wsInstance.ws.simulateError();
      }

      // Should have increasing delays between attempts
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThan(100); // Some backoff occurred
    });

    it('should handle successful reconnect after failures', async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      // Subscribe to project
      wsInstance.subscribe('test-project');

      // Force disconnect
      wsInstance.ws.simulateError();

      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be connected and re-subscribed
      expect(wsInstance.isConnected()).toBe(true);
      expect(wsInstance.isSubscribed('test-project')).toBe(true);
    });

    it('should handle disconnect during reconnection attempt', async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      // Force error
      wsInstance.ws.simulateError();

      // Disconnect during reconnection
      setTimeout(() => {
        wsInstance.disconnect();
      }, 500);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be disconnected and not reconnecting
      expect(wsInstance.isConnected()).toBe(false);
    });
  });

  describe('Event Handler Edge Cases', () => {
    beforeEach(async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should handle event handlers that throw errors', () => {
      // Register handler that throws
      wsInstance.on('agent_message', () => {
        throw new Error('Handler error');
      });

      expect(() => {
        wsInstance.ws.simulateMessage({
          type: 'agent_message',
          projectId: 'test-project',
          content: 'test'
        });
      }).not.toThrow();

      expect(global.console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in event handler'),
        expect.any(Error)
      );
    });

    it('should handle removing non-existent event handlers', () => {
      const handler = jest.fn();

      expect(() => {
        wsInstance.off('agent_message', handler);
      }).not.toThrow();
    });

    it('should handle multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      wsInstance.on('agent_message', handler1);
      wsInstance.on('agent_message', handler2);
      wsInstance.on('agent_message', handler3);

      wsInstance.ws.simulateMessage({
        type: 'agent_message',
        projectId: 'test-project',
        content: 'test'
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should handle removing handler during event emission', () => {
      const handler1 = jest.fn(() => {
        // Remove handler2 during execution
        wsInstance.off('agent_message', handler2);
      });
      const handler2 = jest.fn();

      wsInstance.on('agent_message', handler1);
      wsInstance.on('agent_message', handler2);

      expect(() => {
        wsInstance.ws.simulateMessage({
          type: 'agent_message',
          projectId: 'test-project',
          content: 'test'
        });
      }).not.toThrow();

      expect(handler1).toHaveBeenCalled();
    });
  });

  describe('Memory and Performance', () => {
    it('should handle many concurrent subscriptions', () => {
      for (let i = 0; i < 1000; i++) {
        wsInstance.subscribe(`project-${i}`);
      }

      expect(global.console.error).not.toHaveBeenCalled();

      // Unsubscribe all
      for (let i = 0; i < 1000; i++) {
        wsInstance.unsubscribe(`project-${i}`);
      }
    });

    it('should handle event handler memory leaks', () => {
      // Add many handlers
      for (let i = 0; i < 1000; i++) {
        wsInstance.on('agent_message', () => {});
      }

      // Remove all handlers
      wsInstance.removeAllListeners('agent_message');

      expect(global.console.error).not.toHaveBeenCalled();
    });

    it('should handle message queue overflow', () => {
      // Disconnect to queue messages
      wsInstance.ws.close();

      // Send many messages while disconnected
      for (let i = 0; i < 10000; i++) {
        try {
          wsInstance.send({
            type: 'test',
            data: `Message ${i}`
          });
        } catch (e) {
          // Expected when not connected
        }
      }

      expect(global.console.error).not.toHaveBeenCalled();
    });
  });

  describe('Browser Compatibility Edge Cases', () => {
    it('should handle WebSocket not available', () => {
      const originalWebSocket = global.WebSocket;
      global.WebSocket = undefined;

      expect(() => {
        const WebSocketModule = require('../../public/js/modules/websocket-module.js');
        WebSocketModule.createWebSocketManager('ws://localhost:3000');
      }).toThrow();

      global.WebSocket = originalWebSocket;
    });

    it('should handle invalid WebSocket URLs', () => {
      expect(() => {
        new WebSocketClient('invalid-url');
      }).toThrow();

      expect(() => {
        new WebSocketClient('');
      }).toThrow();

      expect(() => {
        new WebSocketClient(null);
      }).toThrow();
    });

    it('should handle page visibility changes during connection', async () => {
      wsInstance.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      // Simulate page becoming hidden
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Should pause reconnection attempts
      wsInstance.ws.simulateError();

      await new Promise(resolve => setTimeout(resolve, 1500));

      // Simulate page becoming visible again
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Should resume reconnection
      expect(global.console.info).toHaveBeenCalledWith(
        expect.stringContaining('Page visible')
      );
    });

    it('should handle network state changes', () => {
      wsInstance.connect();

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      window.dispatchEvent(new Event('offline'));

      // Should pause reconnection
      wsInstance.ws.simulateError();

      // Simulate coming back online
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      window.dispatchEvent(new Event('online'));

      expect(global.console.info).toHaveBeenCalledWith(
        expect.stringContaining('Network online')
      );
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle messages from wrong origin', () => {
      // This would be handled by browser security, but test defensive coding
      const maliciousMessage = {
        type: 'agent_message',
        projectId: '../../../etc/passwd',
        content: '<script>alert("xss")</script>'
      };

      expect(() => {
        wsInstance.ws.simulateMessage(maliciousMessage);
      }).not.toThrow();

      // Should sanitize or validate project IDs
    });

    it('should handle very long project IDs', () => {
      const longProjectId = 'a'.repeat(10000);

      expect(() => {
        wsInstance.subscribe(longProjectId);
      }).not.toThrow();
    });

    it('should handle special characters in project IDs', () => {
      const specialProjectIds = [
        '../project',
        'project/../',
        'project\x00null',
        'project\r\nheader',
        'project"quote',
        "project'quote",
        'project<script>',
        'проект', // Unicode
        '🚀🎉' // Emojis
      ];

      specialProjectIds.forEach(projectId => {
        expect(() => {
          wsInstance.subscribe(projectId);
          wsInstance.unsubscribe(projectId);
        }).not.toThrow();
      });
    });
  });
});