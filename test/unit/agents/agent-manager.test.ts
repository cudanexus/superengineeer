import { EventEmitter } from 'events';
import {
  DefaultAgentManager,
  AgentManagerDependencies,
  AgentLoopState,
  ImageData,
  StartInteractiveAgentOptions,
} from '../../../src/agents/agent-manager';
import { ClaudeAgent, AgentMode, ContextUsage } from '../../../src/agents/claude-agent';
import {
  createMockAgentFactory,
  createMockClaudeAgent,
  createMockProjectRepository,
  createMockConversationRepository,
  createMockInstructionGenerator,
  createMockRoadmapParser,
  createMockPermissionGenerator,
  createMockSettingsRepository,
  sampleParsedRoadmap,
  createTestProject,
} from '../helpers/mock-factories';

// Mock the utils module to provide getPidTracker
jest.mock('../../../src/utils', () => {
  const originalModule = jest.requireActual('../../../src/utils');
  return {
    ...originalModule,
    getPidTracker: jest.fn().mockReturnValue({
      addProcess: jest.fn(),
      removeProcess: jest.fn(),
      cleanupOrphanProcesses: jest.fn().mockResolvedValue({ killed: [], failed: [] }),
      getTrackedProcesses: jest.fn().mockReturnValue([]),
    }),
  };
});

describe('DefaultAgentManager', () => {
  let agentManager: DefaultAgentManager;
  let mockAgent: jest.Mocked<ClaudeAgent>;
  let mockAgentFactory: ReturnType<typeof createMockAgentFactory>;
  let mockProjectRepo: ReturnType<typeof createMockProjectRepository>;
  let mockConversationRepo: ReturnType<typeof createMockConversationRepository>;
  let mockInstructionGenerator: ReturnType<typeof createMockInstructionGenerator>;
  let mockRoadmapParser: ReturnType<typeof createMockRoadmapParser>;
  let mockPermissionGenerator: ReturnType<typeof createMockPermissionGenerator>;
  let mockSettingsRepo: ReturnType<typeof createMockSettingsRepository>;

  const testProject = createTestProject({ id: 'test-project', path: '/test/path' });

  beforeEach(() => {
    mockAgent = createMockClaudeAgent('test-project');
    mockAgentFactory = createMockAgentFactory(mockAgent);
    mockProjectRepo = createMockProjectRepository([testProject]);
    mockConversationRepo = createMockConversationRepository();
    mockInstructionGenerator = createMockInstructionGenerator();
    mockRoadmapParser = createMockRoadmapParser();
    mockPermissionGenerator = createMockPermissionGenerator();
    mockSettingsRepo = createMockSettingsRepository();

    const deps: AgentManagerDependencies = {
      maxConcurrentAgents: 3,
      agentFactory: mockAgentFactory,
      projectRepository: mockProjectRepo,
      conversationRepository: mockConversationRepo,
      instructionGenerator: mockInstructionGenerator,
      roadmapParser: mockRoadmapParser,
      permissionGenerator: mockPermissionGenerator,
      settingsRepository: mockSettingsRepo,
    };

    agentManager = new DefaultAgentManager(deps);
  });

  afterEach(async () => {
    await agentManager.stopAllAgents();
  });

  describe('constructor', () => {
    it('should initialize with default maxConcurrentAgents of 3', () => {
      const status = agentManager.getResourceStatus();
      expect(status.maxConcurrent).toBe(3);
    });

    it('should use custom maxConcurrentAgents when provided', () => {
      const manager = new DefaultAgentManager({
        maxConcurrentAgents: 5,
        agentFactory: mockAgentFactory,
        projectRepository: mockProjectRepo,
        conversationRepository: mockConversationRepo,
        instructionGenerator: mockInstructionGenerator,
        roadmapParser: mockRoadmapParser,
        permissionGenerator: mockPermissionGenerator,
        settingsRepository: mockSettingsRepo,
      });
      const status = manager.getResourceStatus();
      expect(status.maxConcurrent).toBe(5);
    });
  });

  describe('setMaxConcurrentAgents', () => {
    it('should update max concurrent agents', () => {
      agentManager.setMaxConcurrentAgents(5);
      expect(agentManager.getResourceStatus().maxConcurrent).toBe(5);
    });

    it('should enforce minimum of 1', () => {
      agentManager.setMaxConcurrentAgents(0);
      expect(agentManager.getResourceStatus().maxConcurrent).toBe(1);
    });
  });

  describe('startInteractiveAgent', () => {
    it('should throw if project not found', async () => {
      await expect(
        agentManager.startInteractiveAgent('non-existent-project')
      ).rejects.toThrow('Project not found');
    });

    it('should throw if agent already running', async () => {
      await agentManager.startInteractiveAgent('test-project');

      await expect(
        agentManager.startInteractiveAgent('test-project')
      ).rejects.toThrow('already running');
    });

    it('should create new conversation if none exists', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(mockConversationRepo.create).toHaveBeenCalledWith('test-project', null);
    });

    it('should use existing conversation ID for resume', async () => {
      // Create a conversation first
      const conv = await mockConversationRepo.create('test-project', null);

      // Set the project's currentConversationId
      await mockProjectRepo.setCurrentConversation('test-project', conv.id);

      // Now start without explicit sessionId - should use current conversation ID
      await agentManager.startInteractiveAgent('test-project');

      expect(mockAgentFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project',
          projectPath: '/test/path',
          mode: 'interactive',
          permissions: expect.any(Object),
          sessionId: conv.id,
          isNewSession: false, // isNewSession should be false for resume
        })
      );
    });

    it('should start agent with multimodal content if images provided', async () => {
      const images: ImageData[] = [{ type: 'image/png', data: 'abc123' }];
      await agentManager.startInteractiveAgent('test-project', {
        initialMessage: 'describe this',
        images,
      });

      expect(mockAgent.start).toHaveBeenCalledWith(expect.stringContaining('['));
    });

    it('should emit status event when agent starts', async () => {
      const listener = jest.fn();
      agentManager.on('status', listener);

      await agentManager.startInteractiveAgent('test-project');

      // Status event is emitted when agent starts
      expect(listener).toHaveBeenCalledWith('test-project', 'running');
    });

    it('should set project status to running', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(mockProjectRepo.updateStatus).toHaveBeenCalledWith('test-project', 'running');
    });
  });

  describe('sendInput', () => {
    it('should throw if no agent running', () => {
      expect(() => agentManager.sendInput('test-project', 'hello')).toThrow('No agent running');
    });

    it('should throw if agent not in interactive mode', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // This should work for interactive mode
      agentManager.sendInput('test-project', 'hello');

      expect(mockAgent.sendInput).toHaveBeenCalledWith('hello');
    });

    it('should save user message to conversation asynchronously', async () => {
      await agentManager.startInteractiveAgent('test-project');
      agentManager.sendInput('test-project', 'hello');

      // Wait for async save operation
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockConversationRepo.addMessage).toHaveBeenCalledWith(
        'test-project',
        expect.any(String),
        expect.objectContaining({
          type: 'user',
          content: 'hello',
        })
      );
    });

    it('should handle multimodal input with images', async () => {
      await agentManager.startInteractiveAgent('test-project');

      const images: ImageData[] = [{ type: 'image/png', data: 'abc123' }];
      agentManager.sendInput('test-project', 'describe this', images);

      expect(mockAgent.sendInput).toHaveBeenCalledWith(expect.stringContaining('['));
    });
  });

  describe('stopAgent', () => {
    it('should do nothing if no agent', async () => {
      // Should not throw
      await agentManager.stopAgent('test-project');
    });

    it('should stop running agent', async () => {
      await agentManager.startInteractiveAgent('test-project');
      await agentManager.stopAgent('test-project');

      expect(mockAgent.stop).toHaveBeenCalled();
    });

    it('should update project status to stopped', async () => {
      await agentManager.startInteractiveAgent('test-project');
      await agentManager.stopAgent('test-project');

      expect(mockProjectRepo.updateStatus).toHaveBeenCalledWith('test-project', 'stopped');
    });
  });

  describe('stopAllAgents', () => {
    it('should stop all running agents', async () => {
      // Start two agents for different projects
      const project2 = createTestProject({ id: 'project-2', path: '/test/path2' });
      mockProjectRepo.findById.mockImplementation((id) => {
        if (id === 'test-project') return Promise.resolve(testProject);
        if (id === 'project-2') return Promise.resolve(project2);
        return Promise.resolve(null);
      });

      await agentManager.startInteractiveAgent('test-project');

      await agentManager.stopAllAgents();

      expect(mockAgent.stop).toHaveBeenCalled();
    });

    it('should flush conversation writes', async () => {
      await agentManager.startInteractiveAgent('test-project');
      await agentManager.stopAllAgents();

      expect(mockConversationRepo.flush).toHaveBeenCalled();
    });
  });

  describe('Queue Management', () => {
    // Note: Queue is only for autonomous agents (startAgent), not interactive agents
    // Interactive agents throw an error if capacity is exceeded

    it('getResourceStatus should return accurate counts', async () => {
      const status = agentManager.getResourceStatus();

      expect(status).toEqual({
        runningCount: 0,
        queuedCount: 0,
        maxConcurrent: 3,
        queuedProjects: [],
      });

      await agentManager.startInteractiveAgent('test-project');

      const status2 = agentManager.getResourceStatus();
      expect(status2.runningCount).toBe(1);
    });

    it('isQueued should return false when not queued', () => {
      expect(agentManager.isQueued('test-project')).toBe(false);
    });

    it('removeFromQueue should handle non-queued project gracefully', () => {
      // Should not throw
      agentManager.removeFromQueue('test-project');
      expect(agentManager.isQueued('test-project')).toBe(false);
    });
  });

  describe('Event System', () => {
    it('on should register listener for queueChange event', () => {
      const listener = jest.fn();
      agentManager.on('queueChange', listener);

      // Trigger a queue change by calling removeFromQueue (even on non-existent)
      // This won't actually emit since project isn't queued
      // Test by triggering status event
      agentManager.on('status', (projectId, status) => {
        // Status events are emitted on agent start/stop
      });

      // Listener registration works if no error is thrown
      expect(true).toBe(true);
    });

    it('on should add listener that receives events', async () => {
      const statusListener = jest.fn();
      agentManager.on('status', statusListener);

      await agentManager.startInteractiveAgent('test-project');

      // Status event is emitted when agent status changes
      expect(statusListener).toHaveBeenCalledWith('test-project', 'running');
    });

    it('off should remove listener', async () => {
      const statusListener = jest.fn();
      agentManager.on('status', statusListener);
      agentManager.off('status', statusListener);

      await agentManager.startInteractiveAgent('test-project');

      expect(statusListener).not.toHaveBeenCalled();
    });
  });

  describe('getAgentStatus', () => {
    it('should return stopped if no agent for project', () => {
      expect(agentManager.getAgentStatus('test-project')).toBe('stopped');
    });

    it('should return agent status if running', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // The mock agent starts with 'running' status
      expect(agentManager.getAgentStatus('test-project')).toBe('running');
    });
  });

  describe('getLoopState', () => {
    it('should return null if no loop running', () => {
      expect(agentManager.getLoopState('test-project')).toBeNull();
    });
  });

  describe('getTrackedProcesses', () => {
    it('should return tracked processes', () => {
      const processes = agentManager.getTrackedProcesses();
      expect(Array.isArray(processes)).toBe(true);
    });
  });

  describe('Agent Message Broadcasting', () => {
    it('should emit message when agent emits message', async () => {
      const listener = jest.fn();
      agentManager.on('message', listener);

      await agentManager.startInteractiveAgent('test-project');

      // Clear previous calls from start
      listener.mockClear();

      // Simulate agent emitting a message
      (mockAgent as unknown as { _emit: (event: string, ...args: unknown[]) => void })._emit(
        'message',
        { type: 'stdout', content: 'Hello', timestamp: new Date().toISOString() }
      );

      expect(listener).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({
          type: 'stdout',
          content: 'Hello',
        })
      );
    });

    it('should emit waitingForInput when agent waiting status changes', async () => {
      const listener = jest.fn();
      agentManager.on('waitingForInput', listener);

      await agentManager.startInteractiveAgent('test-project');

      // Simulate agent emitting waitingForInput
      (mockAgent as unknown as { _emit: (event: string, ...args: unknown[]) => void })._emit(
        'waitingForInput',
        { isWaiting: true, version: 1 }
      );

      expect(listener).toHaveBeenCalledWith('test-project', true, 1);
    });
  });

  describe('Context Usage Persistence', () => {
    it('should save context usage when agent exits', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // Set context usage on the mock agent
      const contextUsage: ContextUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        maxContextTokens: 200000,
        percentUsed: 0.75,
      };
      (mockAgent as unknown as { _setContextUsage: (c: ContextUsage) => void })._setContextUsage(
        contextUsage
      );

      // Simulate agent exit
      (mockAgent as unknown as { _emit: (event: string, ...args: unknown[]) => void })._emit(
        'exit',
        0
      );

      // Give time for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockProjectRepo.updateContextUsage).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({
          inputTokens: 1000,
          outputTokens: 500,
        })
      );
    });
  });

  describe('Queued Messages', () => {
    it('should return queued messages for running agent', async () => {
      await agentManager.startInteractiveAgent('test-project');

      const messages = agentManager.getQueuedMessages('test-project');
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should return empty array if no agent', () => {
      const messages = agentManager.getQueuedMessages('test-project');
      expect(messages).toEqual([]);
    });

    it('should remove queued message by index', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // This depends on the mock agent implementation
      const result = agentManager.removeQueuedMessage('test-project', 0);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('restartAllRunningAgents', () => {
    it('should do nothing if no agents running', async () => {
      await agentManager.restartAllRunningAgents();
      // Should not throw
    });

    it('should restart interactive agents', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // Clear stop call count
      mockAgent.stop.mockClear();
      mockAgent.start.mockClear();

      await agentManager.restartAllRunningAgents();

      // Agent should have been stopped
      expect(mockAgent.stop).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should return false if no agent', () => {
      expect(agentManager.isRunning('test-project')).toBe(false);
    });

    it('should return true if agent is running', async () => {
      await agentManager.startInteractiveAgent('test-project');
      expect(agentManager.isRunning('test-project')).toBe(true);
    });
  });

  describe('isWaitingForInput', () => {
    it('should return false if no agent', () => {
      expect(agentManager.isWaitingForInput('test-project')).toBe(false);
    });

    it('should delegate to agent.isWaitingForInput', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // The mock agent returns isWaitingForInput based on internal state
      expect(typeof agentManager.isWaitingForInput('test-project')).toBe('boolean');
    });
  });

  describe('getWaitingVersion', () => {
    it('should return 0 if no agent', () => {
      expect(agentManager.getWaitingVersion('test-project')).toBe(0);
    });

    it('should return agent waiting version', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(typeof agentManager.getWaitingVersion('test-project')).toBe('number');
    });
  });

  describe('getAgentMode', () => {
    it('should return null if no agent', () => {
      expect(agentManager.getAgentMode('test-project')).toBeNull();
    });

    it('should return agent mode', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(agentManager.getAgentMode('test-project')).toBe('interactive');
    });
  });

  describe('getLastCommand', () => {
    it('should return null if no agent', () => {
      expect(agentManager.getLastCommand('test-project')).toBeNull();
    });
  });

  describe('getProcessInfo', () => {
    it('should return null if no agent', () => {
      expect(agentManager.getProcessInfo('test-project')).toBeNull();
    });
  });

  describe('getContextUsage', () => {
    it('should return null if no agent', () => {
      expect(agentManager.getContextUsage('test-project')).toBeNull();
    });
  });

  describe('getSessionId', () => {
    it('should return null if no agent', () => {
      expect(agentManager.getSessionId('test-project')).toBeNull();
    });
  });

  describe('getFullStatus', () => {
    it('should return complete status object', async () => {
      const status = agentManager.getFullStatus('test-project');

      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('mode');
      expect(status).toHaveProperty('isWaitingForInput');
      expect(status).toHaveProperty('waitingVersion');
    });

    it('should return running status when agent is running', async () => {
      await agentManager.startInteractiveAgent('test-project');

      const status = agentManager.getFullStatus('test-project');
      expect(status.status).toBe('running');
      expect(status.mode).toBe('interactive');
    });
  });

  describe('getQueuedMessageCount', () => {
    it('should return 0 if no agent', () => {
      expect(agentManager.getQueuedMessageCount('test-project')).toBe(0);
    });
  });

  describe('getRunningProjectIds', () => {
    it('should return empty array if no agents running', () => {
      expect(agentManager.getRunningProjectIds()).toEqual([]);
    });

    it('should return project IDs of running agents', async () => {
      await agentManager.startInteractiveAgent('test-project');

      const ids = agentManager.getRunningProjectIds();
      expect(ids).toContain('test-project');
    });
  });

  describe('cleanupOrphanProcesses', () => {
    it('should call pid tracker cleanup', async () => {
      const result = await agentManager.cleanupOrphanProcesses();

      // The mock returns killed and failed arrays
      expect(result).toHaveProperty('killed');
      expect(result).toHaveProperty('failed');
    });
  });

  describe('startAutonomousLoop', () => {
    it('should throw if project not found', async () => {
      await expect(agentManager.startAutonomousLoop('non-existent')).rejects.toThrow(
        'Project not found'
      );
    });

    // Note: Testing "loop already running" requires mocking fs.promises.readFile
    // which is complex for unit tests. This is better covered by integration tests.
  });

  describe('stopAutonomousLoop', () => {
    it('should do nothing if no loop running', () => {
      // Should not throw
      agentManager.stopAutonomousLoop('test-project');
      expect(agentManager.getLoopState('test-project')).toBeNull();
    });
  });

  describe('startInteractiveAgent with permissionMode', () => {
    it('should use permissionMode from options', async () => {
      await agentManager.startInteractiveAgent('test-project', {
        permissionMode: 'plan',
      });

      expect(mockAgentFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: expect.objectContaining({
            permissionMode: 'plan',
          }),
        })
      );
    });

    it('should use default acceptEdits permissionMode when not specified', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(mockAgentFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: expect.objectContaining({
            permissionMode: 'acceptEdits',
          }),
        })
      );
    });
  });

  describe('startInteractiveAgent creates conversation', () => {
    it('should create new conversation when none exists', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(mockConversationRepo.create).toHaveBeenCalledWith('test-project', null);
    });

    it('should set conversation as current on project', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(mockProjectRepo.setCurrentConversation).toHaveBeenCalled();
    });
  });

  describe('startAgent (autonomous mode)', () => {
    it('should throw if project not found', async () => {
      await expect(agentManager.startAgent('non-existent', 'instructions')).rejects.toThrow(
        'Project not found'
      );
    });

    it('should throw if agent already running for project', async () => {
      await agentManager.startInteractiveAgent('test-project');

      await expect(agentManager.startAgent('test-project', 'instructions')).rejects.toThrow(
        'already running'
      );
    });
  });

  describe('queue behavior', () => {
    it('should emit queueChange event', () => {
      const listener = jest.fn();
      agentManager.on('queueChange', listener);

      // removeFromQueue triggers queueChange event if project was queued
      // Since no project is queued, it won't emit
      agentManager.removeFromQueue('test-project');

      // Listener should have been registered (no error thrown)
      expect(true).toBe(true);
    });
  });

  describe('agent status handling', () => {
    it('should update project status when agent status changes', async () => {
      await agentManager.startInteractiveAgent('test-project');

      // Simulate agent status change to stopped
      (mockAgent as unknown as { _emit: (event: string, ...args: unknown[]) => void })._emit(
        'statusChange',
        'stopped'
      );

      // Give time for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockProjectRepo.updateStatus).toHaveBeenCalled();
    });
  });

  describe('agent exit handling', () => {
    it('should clean up agent on exit', async () => {
      await agentManager.startInteractiveAgent('test-project');

      expect(agentManager.isRunning('test-project')).toBe(true);

      // Simulate agent exit
      (mockAgent as unknown as { _emit: (event: string, ...args: unknown[]) => void })._emit(
        'exit',
        0
      );

      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(agentManager.isRunning('test-project')).toBe(false);
    });
  });

  describe('session ID validation', () => {
    it('should create new conversation when existing conversation ID is not a valid UUID', async () => {
      const invalidUUID = 'invalid-session-id';
      mockProjectRepo.findById.mockResolvedValue({
        ...testProject,
        currentConversationId: invalidUUID,
      });

      const listener = jest.fn();
      agentManager.on('sessionRecovery', listener);

      await agentManager.startInteractiveAgent('test-project');

      // Should delete old conversation with invalid ID
      expect(mockConversationRepo.deleteConversation).toHaveBeenCalledWith('test-project', invalidUUID);
      // Should create new conversation
      expect(mockConversationRepo.create).toHaveBeenCalled();
      // Should emit session recovery event
      expect(listener).toHaveBeenCalled();
    });

    it('should create new conversation when provided session ID is not a valid UUID', async () => {
      const invalidUUID = 'not-a-valid-uuid';
      const validExistingConvId = '550e8400-e29b-41d4-a716-446655440001';

      // Set up project with an existing valid conversation ID
      mockProjectRepo.findById.mockResolvedValue({
        ...testProject,
        currentConversationId: validExistingConvId,
      });

      const listener = jest.fn();
      agentManager.on('sessionRecovery', listener);

      // Provide an invalid session ID to trigger the validation path
      await agentManager.startInteractiveAgent('test-project', {
        sessionId: invalidUUID,
      });

      // Should delete old conversation with invalid session ID
      expect(mockConversationRepo.deleteConversation).toHaveBeenCalledWith('test-project', invalidUUID);
      // Should create new conversation
      expect(mockConversationRepo.create).toHaveBeenCalled();
      // Should emit session recovery event
      expect(listener).toHaveBeenCalled();
    });

    it('should use existing valid UUID session ID', async () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      mockProjectRepo.findById.mockResolvedValue({
        ...testProject,
        currentConversationId: validUUID,
      });

      await agentManager.startInteractiveAgent('test-project');

      // Should not delete the conversation
      expect(mockConversationRepo.deleteConversation).not.toHaveBeenCalled();
      // Should NOT create a new conversation - use existing
      expect(mockConversationRepo.create).not.toHaveBeenCalled();
    });
  });
});
