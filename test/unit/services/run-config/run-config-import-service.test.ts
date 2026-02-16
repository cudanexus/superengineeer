import { DefaultRunConfigImportService } from '../../../../src/services/run-config/run-config-import-service';
import fs from 'fs';

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
  },
}));

const mockAccess = fs.promises.access as jest.Mock;
const mockReadFile = fs.promises.readFile as jest.Mock;

describe('DefaultRunConfigImportService', () => {
  let service: DefaultRunConfigImportService;

  beforeEach(() => {
    service = new DefaultRunConfigImportService();
    jest.clearAllMocks();

    // By default, no files exist
    mockAccess.mockRejectedValue(new Error('ENOENT'));
  });

  describe('scan', () => {
    it('should return empty when no config files exist', async () => {
      const result = await service.scan('/test/project');
      expect(result.projectPath).toBe('/test/project');
      expect(result.importable).toHaveLength(0);
    });

    it('should detect package.json scripts', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue(JSON.stringify({
        scripts: {
          dev: 'ts-node src/index.ts',
          build: 'tsc',
          test: 'jest',
        },
      }));

      const result = await service.scan('/test/project');

      expect(result.importable).toHaveLength(1);
      const group = result.importable[0]!;
      expect(group.source).toBe('package.json');
      expect(group.configs).toHaveLength(3);
      expect(group.configs[0]!.name).toBe('npm: dev');
      expect(group.configs[0]!.args).toEqual(['run', 'dev']);
    });

    it('should detect Cargo.toml', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('Cargo.toml')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue(
        '[package]\nname = "myapp"\nversion = "0.1.0"\n'
      );

      const result = await service.scan('/test/project');

      expect(result.importable).toHaveLength(1);
      const group = result.importable[0]!;
      expect(group.source).toBe('Cargo.toml');
      expect(group.configs.length).toBeGreaterThanOrEqual(3);
      expect(group.configs.map(c => c.name)).toContain('cargo: build');
      expect(group.configs.map(c => c.name)).toContain('cargo: run');
      expect(group.configs.map(c => c.name)).toContain('cargo: test');
    });

    it('should detect Cargo.toml with [[bin]] sections', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('Cargo.toml')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue(
        '[package]\nname = "myapp"\n[[bin]]\nname = "mybin"\n'
      );

      const result = await service.scan('/test/project');

      const group = result.importable[0]!;
      expect(group.configs.map(c => c.name)).toContain('cargo: build --release');
    });

    it('should detect go.mod', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('go.mod')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await service.scan('/test/project');

      expect(result.importable).toHaveLength(1);
      const group = result.importable[0]!;
      expect(group.source).toBe('go.mod');
      expect(group.configs.map(c => c.name)).toContain('go: build');
      expect(group.configs.map(c => c.name)).toContain('go: run');
      expect(group.configs.map(c => c.name)).toContain('go: test');
    });

    it('should detect Makefile targets', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('Makefile')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue(
        'build:\n\tgo build\n\ntest:\n\tgo test\n\n.PHONY: build test\n'
      );

      const result = await service.scan('/test/project');

      expect(result.importable).toHaveLength(1);
      const group = result.importable[0]!;
      expect(group.source).toBe('Makefile');
      expect(group.configs.map(c => c.name)).toContain('make: build');
      expect(group.configs.map(c => c.name)).toContain('make: test');
    });

    it('should detect pyproject.toml', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('pyproject.toml')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await service.scan('/test/project');

      expect(result.importable).toHaveLength(1);
      const group = result.importable[0]!;
      expect(group.source).toBe('pyproject.toml');
      expect(group.configs.map(c => c.name)).toContain('python: run');
      expect(group.configs.map(c => c.name)).toContain('pytest: test');
    });

    it('should scan multiple file types in parallel', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('package.json') || filePath.includes('Makefile')) {
          return Promise.resolve();
        }

        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify({ scripts: { start: 'node .' } }));
        }

        if (filePath.includes('Makefile')) {
          return Promise.resolve('run:\n\tnode .\n');
        }

        return Promise.reject(new Error('ENOENT'));
      });

      const result = await service.scan('/test/project');
      expect(result.importable).toHaveLength(2);
    });

    it('should handle malformed package.json gracefully', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue('not valid json {{{');

      const result = await service.scan('/test/project');
      expect(result.importable).toHaveLength(0);
    });

    it('should skip package.json with no scripts', async () => {
      mockAccess.mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'test' }));

      const result = await service.scan('/test/project');
      expect(result.importable).toHaveLength(0);
    });
  });
});
