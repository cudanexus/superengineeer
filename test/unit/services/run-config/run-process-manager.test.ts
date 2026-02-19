import { DefaultRunProcessManager } from '../../../../src/services/run-config/run-process-manager';
import { RunConfigurationService } from '../../../../src/services/run-config/types';
import {
  createMockRunConfigurationService,
  sampleRunConfiguration,
} from '../../helpers/mock-factories';

// Mock node-pty
const mockPtyOnData = jest.fn();
const mockPtyOnExit = jest.fn();
const mockPtyKill = jest.fn();

jest.mock('node-pty', () => ({
  spawn: jest.fn().mockImplementation(() => ({
    pid: 12345,
    onData: mockPtyOnData,
    onExit: mockPtyOnExit,
    kill: mockPtyKill,
    write: jest.fn(),
    resize: jest.fn(),
  })),
}));

describe('DefaultRunProcessManager', () => {
  let manager: DefaultRunProcessManager;
  let mockConfigService: jest.Mocked<RunConfigurationService>;
  const projectId = 'test-project';
  const projectPath = '/path/to/project';
  const configId = sampleRunConfiguration.id;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService = createMockRunConfigurationService();
    mockConfigService.getById.mockResolvedValue(sampleRunConfiguration);

    manager = new DefaultRunProcessManager({
      runConfigurationService: mockConfigService,
    });
  });

  describe('start', () => {
    it('should spawn a process and return running status', async () => {
      const status = await manager.start(projectId, projectPath, configId);

      expect(status.state).toBe('running');
      expect(status.pid).toBe(12345);
      expect(status.configId).toBe(configId);
      expect(status.restartCount).toBe(0);
      expect(status.error).toBeNull();
    });

    it('should throw when config not found', async () => {
      mockConfigService.getById.mockResolvedValue(null);

      await expect(
        manager.start(projectId, projectPath, 'nonexistent'),
      ).rejects.toThrow('Run configuration not found');
    });

    it('should emit output events', async () => {
      const outputHandler = jest.fn();
      manager.on('output', outputHandler);

      await manager.start(projectId, projectPath, configId);

      // Simulate PTY data
      const onDataCallback = mockPtyOnData.mock.calls[0]![0] as (data: string) => void;
      onDataCallback('Hello World');

      expect(outputHandler).toHaveBeenCalledWith(projectId, configId, 'Hello World');
    });

    it('should emit status events on exit', async () => {
      const statusHandler = jest.fn();
      manager.on('status', statusHandler);

      await manager.start(projectId, projectPath, configId);

      // Simulate PTY exit
      const onExitCallback = mockPtyOnExit.mock.calls[0]![0] as (data: { exitCode: number }) => void;
      onExitCallback({ exitCode: 0 });

      expect(statusHandler).toHaveBeenCalled();
      const emittedStatus = statusHandler.mock.calls[statusHandler.mock.calls.length - 1]![2];
      expect(emittedStatus.state).toBe('stopped');
      expect(emittedStatus.exitCode).toBe(0);
    });

    it('should set errored state on non-zero exit', async () => {
      await manager.start(projectId, projectPath, configId);

      const onExitCallback = mockPtyOnExit.mock.calls[0]![0] as (data: { exitCode: number }) => void;
      onExitCallback({ exitCode: 1 });

      const status = manager.getStatus(projectId, configId);
      expect(status.state).toBe('errored');
      expect(status.exitCode).toBe(1);
      expect(status.error).toContain('exited with code 1');
    });
  });

  describe('stop', () => {
    it('should kill the process', async () => {
      await manager.start(projectId, projectPath, configId);
      await manager.stop(projectId, configId);

      expect(mockPtyKill).toHaveBeenCalled();
    });

    it('should do nothing when process not found', async () => {
      await manager.stop(projectId, 'nonexistent');
      // Should not throw
    });

    it('should set status to stopped', async () => {
      await manager.start(projectId, projectPath, configId);
      await manager.stop(projectId, configId);

      const status = manager.getStatus(projectId, configId);
      expect(status.state).toBe('stopped');
      expect(status.pid).toBeNull();
    });
  });

  describe('stopAll', () => {
    it('should stop all processes for a project', async () => {
      const config2 = { ...sampleRunConfiguration, id: 'cfg-2', name: 'Second' };
      mockConfigService.getById
        .mockResolvedValueOnce(sampleRunConfiguration)
        .mockResolvedValueOnce(config2);

      await manager.start(projectId, projectPath, configId);
      await manager.start(projectId, projectPath, 'cfg-2');

      await manager.stopAll(projectId);

      const status1 = manager.getStatus(projectId, configId);
      const status2 = manager.getStatus(projectId, 'cfg-2');
      expect(status1.state).toBe('stopped');
      expect(status2.state).toBe('stopped');
    });
  });

  describe('getStatus', () => {
    it('should return stopped status for unknown process', () => {
      const status = manager.getStatus(projectId, 'unknown');

      expect(status.state).toBe('stopped');
      expect(status.pid).toBeNull();
      expect(status.restartCount).toBe(0);
    });

    it('should return running status for active process', async () => {
      await manager.start(projectId, projectPath, configId);

      const status = manager.getStatus(projectId, configId);
      expect(status.state).toBe('running');
      expect(status.pid).toBe(12345);
    });
  });

  describe('getAllStatuses', () => {
    it('should return empty array for unknown project', () => {
      const statuses = manager.getAllStatuses('unknown');
      expect(statuses).toEqual([]);
    });

    it('should return all statuses for a project', async () => {
      const config2 = { ...sampleRunConfiguration, id: 'cfg-2', name: 'Second' };
      mockConfigService.getById
        .mockResolvedValueOnce(sampleRunConfiguration)
        .mockResolvedValueOnce(config2);

      await manager.start(projectId, projectPath, configId);
      await manager.start(projectId, projectPath, 'cfg-2');

      const statuses = manager.getAllStatuses(projectId);
      expect(statuses).toHaveLength(2);
    });
  });

  describe('shutdown', () => {
    it('should stop all processes across all projects', async () => {
      await manager.start(projectId, projectPath, configId);
      await manager.shutdown();

      const status = manager.getStatus(projectId, configId);
      expect(status.state).toBe('stopped');
    });
  });
});
