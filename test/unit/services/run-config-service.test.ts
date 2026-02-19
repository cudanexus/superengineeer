import { DefaultRunConfigurationService } from '../../../src/services/run-config/run-config-service';
import { RunConfiguration } from '../../../src/repositories/project';
import {
  createMockProjectRepository,
  createTestProject,
  createTestRunConfiguration,
} from '../helpers/mock-factories';

describe('DefaultRunConfigurationService', () => {
  const projectId = 'test-project-id';

  function createService(configs: RunConfiguration[] = []) {
    const project = createTestProject({
      id: projectId,
      runConfigurations: configs,
    });
    const repo = createMockProjectRepository([project]);
    const service = new DefaultRunConfigurationService({
      projectRepository: repo,
    });
    return { service, repo };
  }

  describe('list', () => {
    it('should return empty array when no configs exist', async () => {
      const { service } = createService();
      const result = await service.list(projectId);
      expect(result).toEqual([]);
    });

    it('should return existing configs', async () => {
      const config = createTestRunConfiguration({ name: 'Dev' });
      const { service } = createService([config]);

      const result = await service.list(projectId);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Dev');
    });

    it('should throw when project not found', async () => {
      const { service } = createService();
      await expect(service.list('nonexistent')).rejects.toThrow('Project not found');
    });
  });

  describe('getById', () => {
    it('should return config by id', async () => {
      const config = createTestRunConfiguration({ id: 'cfg-1', name: 'Test' });
      const { service } = createService([config]);

      const result = await service.getById(projectId, 'cfg-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test');
    });

    it('should return null when config not found', async () => {
      const { service } = createService();
      const result = await service.getById(projectId, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a config with defaults', async () => {
      const { service, repo } = createService();

      const result = await service.create(projectId, {
        name: 'Dev Server',
        command: 'npm run dev',
      });

      expect(result.name).toBe('Dev Server');
      expect(result.command).toBe('npm run dev');
      expect(result.args).toEqual([]);
      expect(result.cwd).toBe('.');
      expect(result.env).toEqual({});
      expect(result.shell).toBeNull();
      expect(result.autoRestart).toBe(false);
      expect(result.autoRestartDelay).toBe(1000);
      expect(result.autoRestartMaxRetries).toBe(5);
      expect(result.preLaunchConfigId).toBeNull();
      expect(result.id).toBeDefined();
      expect(repo.updateRunConfigurations).toHaveBeenCalledWith(projectId, [result]);
    });

    it('should create a config with all fields', async () => {
      const { service } = createService();

      const result = await service.create(projectId, {
        name: 'Custom',
        command: 'node',
        args: ['server.js'],
        cwd: 'src',
        env: { PORT: '3000' },
        shell: '/bin/zsh',
        autoRestart: true,
        autoRestartDelay: 2000,
        autoRestartMaxRetries: 10,
      });

      expect(result.args).toEqual(['server.js']);
      expect(result.cwd).toBe('src');
      expect(result.env).toEqual({ PORT: '3000' });
      expect(result.shell).toBe('/bin/zsh');
      expect(result.autoRestart).toBe(true);
      expect(result.autoRestartDelay).toBe(2000);
      expect(result.autoRestartMaxRetries).toBe(10);
    });

    it('should reject duplicate names (case-insensitive)', async () => {
      const config = createTestRunConfiguration({ name: 'Dev Server' });
      const { service } = createService([config]);

      await expect(
        service.create(projectId, { name: 'dev server', command: 'npm start' }),
      ).rejects.toThrow('already exists');
    });

    it('should reject empty command', async () => {
      const { service } = createService();

      await expect(
        service.create(projectId, { name: 'Test', command: '   ' }),
      ).rejects.toThrow('Command is required');
    });

    it('should reject absolute cwd', async () => {
      const { service } = createService();

      await expect(
        service.create(projectId, { name: 'Test', command: 'npm', cwd: '/etc' }),
      ).rejects.toThrow('relative to the project root');
    });

    it('should reject cwd with parent traversal', async () => {
      const { service } = createService();

      await expect(
        service.create(projectId, { name: 'Test', command: 'npm', cwd: '../outside' }),
      ).rejects.toThrow('must not escape');
    });

    it('should reject nonexistent pre-launch config', async () => {
      const { service } = createService();

      await expect(
        service.create(projectId, {
          name: 'Test',
          command: 'npm',
          preLaunchConfigId: 'nonexistent',
        }),
      ).rejects.toThrow('Pre-launch config not found');
    });

    it('should throw when project not found', async () => {
      const { service } = createService();
      await expect(
        service.create('nonexistent', { name: 'Test', command: 'npm' }),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('update', () => {
    it('should update specific fields', async () => {
      const config = createTestRunConfiguration({ id: 'cfg-1', name: 'Old' });
      const { service, repo } = createService([config]);

      const result = await service.update(projectId, 'cfg-1', { name: 'New' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('New');
      expect(result!.command).toBe(config.command); // unchanged
      expect(repo.updateRunConfigurations).toHaveBeenCalled();
    });

    it('should return null when config not found', async () => {
      const { service } = createService();
      const result = await service.update(projectId, 'nonexistent', { name: 'New' });
      expect(result).toBeNull();
    });

    it('should reject duplicate name on update', async () => {
      const cfg1 = createTestRunConfiguration({ id: 'cfg-1', name: 'First' });
      const cfg2 = createTestRunConfiguration({ id: 'cfg-2', name: 'Second' });
      const { service } = createService([cfg1, cfg2]);

      await expect(
        service.update(projectId, 'cfg-2', { name: 'First' }),
      ).rejects.toThrow('already exists');
    });

    it('should allow keeping the same name', async () => {
      const config = createTestRunConfiguration({ id: 'cfg-1', name: 'Same' });
      const { service } = createService([config]);

      const result = await service.update(projectId, 'cfg-1', { name: 'Same' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Same');
    });

    it('should detect circular pre-launch dependency', async () => {
      const cfgA = createTestRunConfiguration({
        id: 'cfg-a',
        name: 'A',
        preLaunchConfigId: null,
      });
      const cfgB = createTestRunConfiguration({
        id: 'cfg-b',
        name: 'B',
        preLaunchConfigId: 'cfg-a',
      });
      const { service } = createService([cfgA, cfgB]);

      // A -> B -> A would be a cycle
      await expect(
        service.update(projectId, 'cfg-a', { preLaunchConfigId: 'cfg-b' }),
      ).rejects.toThrow('Circular pre-launch dependency');
    });

    it('should detect self-referencing pre-launch', async () => {
      const config = createTestRunConfiguration({ id: 'cfg-1', name: 'Self' });
      const { service } = createService([config]);

      await expect(
        service.update(projectId, 'cfg-1', { preLaunchConfigId: 'cfg-1' }),
      ).rejects.toThrow('Circular pre-launch dependency');
    });
  });

  describe('delete', () => {
    it('should delete a config', async () => {
      const config = createTestRunConfiguration({ id: 'cfg-1' });
      const { service, repo } = createService([config]);

      const result = await service.delete(projectId, 'cfg-1');
      expect(result).toBe(true);
      expect(repo.updateRunConfigurations).toHaveBeenCalledWith(projectId, []);
    });

    it('should return false when config not found', async () => {
      const { service } = createService();
      const result = await service.delete(projectId, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should prevent deletion when referenced as pre-launch', async () => {
      const cfgA = createTestRunConfiguration({ id: 'cfg-a', name: 'A' });
      const cfgB = createTestRunConfiguration({
        id: 'cfg-b',
        name: 'B',
        preLaunchConfigId: 'cfg-a',
      });
      const { service } = createService([cfgA, cfgB]);

      await expect(service.delete(projectId, 'cfg-a')).rejects.toThrow(
        'Cannot delete',
      );
    });

    it('should throw when project not found', async () => {
      const { service } = createService();
      await expect(service.delete('nonexistent', 'cfg-1')).rejects.toThrow(
        'Project not found',
      );
    });
  });
});
