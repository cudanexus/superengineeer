import { ClaudeOptimizationService } from '../../../src/services/claude-optimization-service';
import { createMockAgentManager } from '../helpers/mock-factories';
import { AgentManager } from '../../../src/agents/agent-manager';
import { getLogger } from '../../../src/utils';

jest.mock('../../../src/utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('ClaudeOptimizationService', () => {
  let service: ClaudeOptimizationService;
  let mockAgentManager: jest.Mocked<AgentManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentManager = createMockAgentManager();
    mockAgentManager.startOneOffAgent.mockResolvedValue('oneoff-123');

    const logger = getLogger('test');
    service = new ClaudeOptimizationService(logger, mockAgentManager);
  });

  describe('startOptimization', () => {
    it('should start a one-off agent with optimization prompt', async () => {
      const oneOffId = await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: '# Rules\n- Be nice',
      });

      expect(oneOffId).toBe('oneoff-123');
      expect(mockAgentManager.startOneOffAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          permissionMode: 'plan',
          label: 'Optimize CLAUDE.md',
        })
      );

      const callArgs = mockAgentManager.startOneOffAgent.mock.calls[0]![0];
      expect(callArgs.message).toContain('CLAUDE.md');
      expect(callArgs.message).toContain('# Rules');
    });

    it('should include default optimization goals in prompt', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      const callArgs = mockAgentManager.startOneOffAgent.mock.calls[0]![0];
      expect(callArgs.message).toContain('Remove any duplicated rules');
      expect(callArgs.message).toContain('Preserve all unique and valuable content');
    });

    it('should include custom optimization goals', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
        optimizationGoals: ['Custom goal 1', 'Custom goal 2'],
      });

      const callArgs = mockAgentManager.startOneOffAgent.mock.calls[0]![0];
      expect(callArgs.message).toContain('Custom goal 1');
      expect(callArgs.message).toContain('Custom goal 2');
    });

    it('should throw when optimization is already in progress', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      await expect(
        service.startOptimization({
          projectId: 'proj-1',
          filePath: '/project/CLAUDE.md',
          content: 'content',
        })
      ).rejects.toThrow('Optimization already in progress');
    });

    it('should register cleanup listener', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      expect(mockAgentManager.on).toHaveBeenCalledWith(
        'oneOffStatus',
        expect.any(Function)
      );
    });
  });

  describe('cleanup listener', () => {
    it('should clean up on stopped status', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      expect(service.isOptimizing('proj-1')).toBe(true);

      // Get the registered handler
      const handler = mockAgentManager.on.mock.calls.find(
        c => c[0] === 'oneOffStatus'
      )![1] as (id: string, status: string) => void;

      // Trigger stopped
      handler('oneoff-123', 'stopped');

      expect(service.isOptimizing('proj-1')).toBe(false);
    });

    it('should clean up on error status', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      const handler = mockAgentManager.on.mock.calls.find(
        c => c[0] === 'oneOffStatus'
      )![1] as (id: string, status: string) => void;

      handler('oneoff-123', 'error');

      expect(service.isOptimizing('proj-1')).toBe(false);
    });

    it('should ignore events for other one-off IDs', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      const handler = mockAgentManager.on.mock.calls.find(
        c => c[0] === 'oneOffStatus'
      )![1] as (id: string, status: string) => void;

      handler('other-id', 'stopped');

      expect(service.isOptimizing('proj-1')).toBe(true);
    });
  });

  describe('isOptimizing', () => {
    it('should return false when no optimization is running', () => {
      expect(service.isOptimizing('proj-1')).toBe(false);
    });

    it('should return true when optimization is running', async () => {
      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      expect(service.isOptimizing('proj-1')).toBe(true);
    });
  });

  describe('getActiveOptimizations', () => {
    it('should return empty array when no optimizations', () => {
      expect(service.getActiveOptimizations()).toEqual([]);
    });

    it('should return project IDs with active optimizations', async () => {
      mockAgentManager.startOneOffAgent
        .mockResolvedValueOnce('oneoff-1')
        .mockResolvedValueOnce('oneoff-2');

      await service.startOptimization({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      await service.startOptimization({
        projectId: 'proj-2',
        filePath: '/project/CLAUDE.md',
        content: 'content',
      });

      const active = service.getActiveOptimizations();
      expect(active).toContain('proj-1');
      expect(active).toContain('proj-2');
      expect(active).toHaveLength(2);
    });
  });
});
