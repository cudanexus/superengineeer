/**
 * WebSocket Module Type Definitions
 * @module websocket-module
 */

declare module 'websocket-module' {
  /**
   * WebSocket configuration options
   */
  interface WebSocketConfig {
    /** Maximum reconnection attempts (default: 50) */
    maxAttempts?: number;
    /** Base delay for reconnection in ms (default: 1000) */
    baseDelay?: number;
    /** Maximum delay for reconnection in ms (default: 30000) */
    maxDelay?: number;
  }

  /**
   * Connection state enum
   */
  type ConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error'
    | 'failed';

  /**
   * WebSocket message structure
   */
  interface WebSocketMessage {
    type: string;
    projectId?: string;
    data?: any;
    [key: string]: any;
  }

  /**
   * Message handler callback
   */
  type MessageHandler = (message: WebSocketMessage) => void;

  /**
   * State change handler callback
   */
  type StateChangeHandler = (
    state: ConnectionState,
    extra?: { nextRetryMs?: number; [key: string]: any }
  ) => void;

  /**
   * WebSocket manager interface
   */
  interface WebSocketManager {
    /** Connect to WebSocket server */
    connect(): void;

    /** Disconnect from server */
    disconnect(): void;

    /** Send message to server */
    send(message: WebSocketMessage): boolean;

    /** Subscribe to project updates */
    subscribe(projectId: string): void;

    /** Unsubscribe from project */
    unsubscribe(projectId: string): void;

    /** Register message handler */
    onMessage(type: string, handler: MessageHandler): void;

    /** Remove message handler */
    offMessage(type: string, handler: MessageHandler): void;

    /** Register state change handler */
    onStateChange(handler: StateChangeHandler): void;

    /** Remove state change handler */
    offStateChange(handler: StateChangeHandler): void;

    /** Force reconnection */
    reconnect(): void;

    /** Get current state */
    getState(): ConnectionState;

    /** Check if connected */
    isConnected(): boolean;
  }

  /**
   * Create a new WebSocket manager
   * @param options - Configuration options
   * @returns WebSocket manager interface
   */
  export function createWebSocketManager(options?: WebSocketConfig): WebSocketManager;

  /**
   * Connection state constants
   */
  export const ConnectionState: {
    DISCONNECTED: 'disconnected';
    CONNECTING: 'connecting';
    CONNECTED: 'connected';
    RECONNECTING: 'reconnecting';
    ERROR: 'error';
    FAILED: 'failed';
  };
}