import { Server } from 'http';
import { WebSocket } from 'ws';
import {
  DefaultWebSocketServer,
  WebSocketServerDependencies,
} from '../../../src/websocket/websocket-server';
import { AgentManager, AgentMessage } from '../../../src/agents';

describe('DefaultWebSocketServer', () => {
  let wsServer: DefaultWebSocketServer;
  let mockAgentManager: jest.Mocked<AgentManager>;
  let mockHttpServer: jest.Mocked<Server>;

  const createMockAgentManager = (): jest.Mocked<AgentManager> => {
    const listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

    return {
      on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(listener);
      }),
      off: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.get(event)?.delete(listener);
      }),
      emit: (event: string, ...args: unknown[]) => {
        listeners.get(event)?.forEach((listener) => listener(...args));
      },
      getFullStatus: jest.fn().mockReturnValue({
        status: 'stopped',
        mode: null,
        queued: false,
        queuedMessageCount: 0,
        isWaitingForInput: false,
        waitingVersion: 0,
        sessionId: null,
        permissionMode: null,
      }),
      getResourceStatus: jest.fn().mockReturnValue({
        runningCount: 0,
        maxConcurrent: 3,
        queuedCount: 0,
        queuedProjects: [],
      }),
      getContextUsage: jest.fn().mockReturnValue(null),
      startAgent: jest.fn(),
      startInteractiveAgent: jest.fn(),
      sendInput: jest.fn(),
      stopAgent: jest.fn(),
      stopAllAgents: jest.fn(),
      getAgentStatus: jest.fn().mockReturnValue('stopped'),
      getAgentMode: jest.fn().mockReturnValue(null),
      isRunning: jest.fn().mockReturnValue(false),
      isQueued: jest.fn().mockReturnValue(false),
      isWaitingForInput: jest.fn().mockReturnValue(false),
      getWaitingVersion: jest.fn().mockReturnValue(0),
      removeFromQueue: jest.fn(),
      setMaxConcurrentAgents: jest.fn(),
      startAutonomousLoop: jest.fn(),
      stopAutonomousLoop: jest.fn(),
      getLoopState: jest.fn().mockReturnValue(null),
      getLastCommand: jest.fn().mockReturnValue(null),
      getProcessInfo: jest.fn().mockReturnValue(null),
      getQueuedMessageCount: jest.fn().mockReturnValue(0),
      getQueuedMessages: jest.fn().mockReturnValue([]),
      removeQueuedMessage: jest.fn().mockReturnValue(false),
      getSessionId: jest.fn().mockReturnValue(null),
      getTrackedProcesses: jest.fn().mockReturnValue([]),
      cleanupOrphanProcesses: jest.fn().mockResolvedValue({ killed: [], failed: [] }),
      restartAllRunningAgents: jest.fn(),
      getRunningProjectIds: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<AgentManager>;
  };

  beforeEach(() => {
    mockAgentManager = createMockAgentManager();
    mockHttpServer = {
      on: jest.fn(),
    } as unknown as jest.Mocked<Server>;

    const deps: WebSocketServerDependencies = {
      agentManager: mockAgentManager,
    };

    wsServer = new DefaultWebSocketServer(deps);
  });

  afterEach(() => {
    wsServer.close();
  });

  describe('constructor', () => {
    it('should create websocket server with agent manager', () => {
      expect(wsServer).toBeDefined();
    });

    it('should set up agent listeners', () => {
      expect(mockAgentManager.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockAgentManager.on).toHaveBeenCalledWith('status', expect.any(Function));
      expect(mockAgentManager.on).toHaveBeenCalledWith('waitingForInput', expect.any(Function));
      expect(mockAgentManager.on).toHaveBeenCalledWith('queueChange', expect.any(Function));
      expect(mockAgentManager.on).toHaveBeenCalledWith('sessionRecovery', expect.any(Function));
    });
  });

  describe('broadcast', () => {
    it('should not throw when wss is null', () => {
      expect(() => {
        wsServer.broadcast({
          type: 'connected',
          data: 'test',
        });
      }).not.toThrow();
    });
  });

  describe('broadcastToProject', () => {
    it('should not throw when no subscribers', () => {
      expect(() => {
        wsServer.broadcastToProject('test-project', {
          type: 'agent_message',
          projectId: 'test-project',
          data: { type: 'stdout', content: 'test', timestamp: new Date().toISOString() },
        });
      }).not.toThrow();
    });
  });

  describe('close', () => {
    it('should handle close when wss is null', () => {
      expect(() => {
        wsServer.close();
        wsServer.close(); // Call twice to ensure it handles null
      }).not.toThrow();
    });
  });

  describe('agent event forwarding', () => {
    it('should emit message events from agent manager', () => {
      const message: AgentMessage = {
        type: 'stdout',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      // Get the message listener that was registered
      const messageListener = mockAgentManager.on.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1] as (projectId: string, message: AgentMessage) => void;

      expect(messageListener).toBeDefined();

      // Trigger the listener (should not throw even without subscribers)
      expect(() => {
        messageListener('test-project', message);
      }).not.toThrow();
    });

    it('should emit status events from agent manager', () => {
      const statusListener = mockAgentManager.on.mock.calls.find(
        (call) => call[0] === 'status'
      )?.[1] as (projectId: string, status: string) => void;

      expect(statusListener).toBeDefined();

      expect(() => {
        statusListener('test-project', 'running');
      }).not.toThrow();
    });

    it('should emit waitingForInput events from agent manager', () => {
      const waitingListener = mockAgentManager.on.mock.calls.find(
        (call) => call[0] === 'waitingForInput'
      )?.[1] as (projectId: string, isWaiting: boolean, version: number) => void;

      expect(waitingListener).toBeDefined();

      expect(() => {
        waitingListener('test-project', true, 1);
      }).not.toThrow();
    });

    it('should emit queueChange events from agent manager', () => {
      const queueListener = mockAgentManager.on.mock.calls.find(
        (call) => call[0] === 'queueChange'
      )?.[1] as (queue: unknown[]) => void;

      expect(queueListener).toBeDefined();

      expect(() => {
        queueListener([]);
      }).not.toThrow();
    });

    it('should emit sessionRecovery events from agent manager', () => {
      const recoveryListener = mockAgentManager.on.mock.calls.find(
        (call) => call[0] === 'sessionRecovery'
      )?.[1] as (projectId: string, oldId: string, newId: string, reason: string) => void;

      expect(recoveryListener).toBeDefined();

      expect(() => {
        recoveryListener('test-project', 'old-id', 'new-id', 'test reason');
      }).not.toThrow();
    });
  });

  describe('with optional dependencies', () => {
    it('should handle missing roadmap generator', () => {
      const deps: WebSocketServerDependencies = {
        agentManager: mockAgentManager,
        // No roadmapGenerator
      };

      const server = new DefaultWebSocketServer(deps);
      expect(server).toBeDefined();
      server.close();
    });

    it('should handle missing auth service', () => {
      const deps: WebSocketServerDependencies = {
        agentManager: mockAgentManager,
        // No authService
      };

      const server = new DefaultWebSocketServer(deps);
      expect(server).toBeDefined();
      server.close();
    });

    it('should handle missing shell service', () => {
      const deps: WebSocketServerDependencies = {
        agentManager: mockAgentManager,
        // No shellService
      };

      const server = new DefaultWebSocketServer(deps);
      expect(server).toBeDefined();
      server.close();
    });
  });
});
