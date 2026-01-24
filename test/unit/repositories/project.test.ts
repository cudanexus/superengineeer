import path from 'path';
import {
  FileProjectRepository,
  FileSystem,
  MilestoneItemRef,
  generateIdFromPath,
} from '../../../src/repositories/project';

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function createMockFileSystem(): FileSystem & {
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFileSync: jest.fn((filePath: string) => {
      const normalized = normalizePath(filePath);
      const content = files.get(normalized);

      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory: ${filePath}`);
      }

      return content;
    }),
    writeFileSync: jest.fn((filePath: string, data: string) => {
      files.set(normalizePath(filePath), data);
    }),
    existsSync: jest.fn((filePath: string) => {
      const normalized = normalizePath(filePath);
      return files.has(normalized) || dirs.has(normalized);
    }),
    mkdirSync: jest.fn((dirPath: string) => {
      dirs.add(normalizePath(dirPath));
    }),
    rmdirSync: jest.fn((dirPath: string) => {
      const normalized = normalizePath(dirPath);
      dirs.delete(normalized);
      const prefix = normalized.endsWith('/') ? normalized : normalized + '/';

      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          files.delete(key);
        }
      }
    }),
  };
}

describe('generateIdFromPath', () => {
  it('should replace non-alphanumeric characters with underscores', () => {
    expect(generateIdFromPath('/home/user/project')).toBe('_home_user_project');
    expect(generateIdFromPath('C:\\Users\\test')).toBe('C__Users_test');
    expect(generateIdFromPath('my-project.name')).toBe('my_project_name');
  });

  it('should preserve alphanumeric characters', () => {
    expect(generateIdFromPath('project123')).toBe('project123');
    expect(generateIdFromPath('MyProject')).toBe('MyProject');
  });
});

describe('FileProjectRepository', () => {
  let mockFs: ReturnType<typeof createMockFileSystem>;
  let repository: FileProjectRepository;
  const dataDir = '/data';
  const projectsDir = normalizePath(path.join(dataDir, 'projects'));
  const indexPath = normalizePath(path.join(projectsDir, 'index.json'));

  beforeEach(() => {
    mockFs = createMockFileSystem();
    repository = new FileProjectRepository(dataDir, mockFs);
  });

  describe('constructor', () => {
    it('should create projects directory if it does not exist', () => {
      expect(mockFs.dirs.has(projectsDir)).toBe(true);
    });

    it('should not create projects directory if it exists', () => {
      const fs = createMockFileSystem();
      fs.dirs.add(projectsDir);
      new FileProjectRepository(dataDir, fs);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should load existing index file', () => {
      const fs = createMockFileSystem();
      fs.dirs.add(projectsDir);
      fs.files.set(indexPath, JSON.stringify([{ id: 'test', name: 'Test' }]));
      new FileProjectRepository(dataDir, fs);

      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should handle corrupted index file gracefully', () => {
      const fs = createMockFileSystem();
      fs.dirs.add(projectsDir);
      fs.files.set(indexPath, 'not valid json');

      expect(() => new FileProjectRepository(dataDir, fs)).not.toThrow();
    });
  });

  describe('create', () => {
    it('should create a new project with correct properties', async () => {
      const project = await repository.create({
        name: 'Test Project',
        path: '/path/to/project',
      });

      expect(project.id).toBe('_path_to_project');
      expect(project.name).toBe('Test Project');
      expect(project.path).toBe('/path/to/project');
      expect(project.status).toBe('stopped');
      expect(project.currentConversationId).toBeNull();
      expect(project.nextItem).toBeNull();
      expect(project.currentItem).toBeNull();
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it('should save project to index and status file', async () => {
      await repository.create({
        name: 'Test Project',
        path: '/path/to/project',
      });

      const indexContent = mockFs.files.get(indexPath);
      expect(indexContent).toBeDefined();
      const index = JSON.parse(indexContent!);
      expect(index).toHaveLength(1);
      expect(index[0]).toEqual({ id: '_path_to_project', name: 'Test Project', path: '/path/to/project' });

      // Data is now stored in {project-root}/.claudito/
      const statusPath = '/path/to/project/.claudito/status.json';
      const statusContent = mockFs.files.get(statusPath);
      expect(statusContent).toBeDefined();
      const status = JSON.parse(statusContent!);
      expect(status.name).toBe('Test Project');
    });

    it('should throw error if project with same path already exists', async () => {
      await repository.create({
        name: 'Test Project',
        path: '/path/to/project',
      });

      await expect(
        repository.create({
          name: 'Another Project',
          path: '/path/to/project',
        })
      ).rejects.toThrow('Project with this path already exists');
    });

    it('should create .claudito directory in project path', async () => {
      await repository.create({
        name: 'Test',
        path: '/test/path',
      });

      // Data is now stored in {project-root}/.claudito/
      const projectDataDir = '/test/path/.claudito';
      expect(mockFs.dirs.has(projectDataDir)).toBe(true);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no projects exist', async () => {
      const projects = await repository.findAll();
      expect(projects).toEqual([]);
    });

    it('should return all projects', async () => {
      await repository.create({ name: 'Project 1', path: '/path1' });
      await repository.create({ name: 'Project 2', path: '/path2' });

      const projects = await repository.findAll();

      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.name)).toContain('Project 1');
      expect(projects.map((p) => p.name)).toContain('Project 2');
    });

    it('should return copies of projects (not references)', async () => {
      await repository.create({ name: 'Project', path: '/path' });
      const projects1 = await repository.findAll();
      const projects2 = await repository.findAll();

      expect(projects1[0]).not.toBe(projects2[0]);
      expect(projects1[0]).toEqual(projects2[0]);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent project', async () => {
      const project = await repository.findById('non-existent');
      expect(project).toBeNull();
    });

    it('should return project by id', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.name).toBe('Test');
      expect(found!.id).toBe(created.id);
    });

    it('should return copy of project (not reference)', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      const found1 = await repository.findById(created.id);
      const found2 = await repository.findById(created.id);

      expect(found1).not.toBe(found2);
      expect(found1).toEqual(found2);
    });
  });

  describe('findByPath', () => {
    it('should return null for non-existent path', async () => {
      const project = await repository.findByPath('/non/existent');
      expect(project).toBeNull();
    });

    it('should return project by path', async () => {
      await repository.create({ name: 'Test', path: '/test/path' });
      const found = await repository.findByPath('/test/path');

      expect(found).toBeDefined();
      expect(found!.name).toBe('Test');
      expect(found!.path).toBe('/test/path');
    });
  });

  describe('updateStatus', () => {
    it('should return null for non-existent project', async () => {
      const result = await repository.updateStatus('non-existent', 'running');
      expect(result).toBeNull();
    });

    it('should update project status', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });

      const updated = await repository.updateStatus(created.id, 'running');

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('running');
    });

    it('should persist status change', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.updateStatus(created.id, 'error');

      const found = await repository.findById(created.id);

      expect(found!.status).toBe('error');
    });

    it('should update updatedAt timestamp', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      const originalUpdatedAt = created.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await repository.updateStatus(created.id, 'running');

      const found = await repository.findById(created.id);
      expect(new Date(found!.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
    });
  });

  describe('updateNextItem', () => {
    const testItem: MilestoneItemRef = {
      phaseId: 'phase1',
      milestoneId: 'milestone1',
      itemIndex: 0,
      taskTitle: 'Test Task',
    };

    it('should return null for non-existent project', async () => {
      const result = await repository.updateNextItem('non-existent', testItem);
      expect(result).toBeNull();
    });

    it('should update next item', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });

      const updated = await repository.updateNextItem(created.id, testItem);

      expect(updated).toBeDefined();
      expect(updated!.nextItem).toEqual(testItem);
    });

    it('should allow setting next item to null', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.updateNextItem(created.id, testItem);

      const updated = await repository.updateNextItem(created.id, null);

      expect(updated!.nextItem).toBeNull();
    });

    it('should persist next item change', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.updateNextItem(created.id, testItem);

      const found = await repository.findById(created.id);

      expect(found!.nextItem).toEqual(testItem);
    });
  });

  describe('updateCurrentItem', () => {
    const testItem: MilestoneItemRef = {
      phaseId: 'phase1',
      milestoneId: 'milestone1',
      itemIndex: 0,
      taskTitle: 'Test Task',
    };

    it('should return null for non-existent project', async () => {
      const result = await repository.updateCurrentItem('non-existent', testItem);
      expect(result).toBeNull();
    });

    it('should update current item', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });

      const updated = await repository.updateCurrentItem(created.id, testItem);

      expect(updated).toBeDefined();
      expect(updated!.currentItem).toEqual(testItem);
    });

    it('should allow setting current item to null', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.updateCurrentItem(created.id, testItem);

      const updated = await repository.updateCurrentItem(created.id, null);

      expect(updated!.currentItem).toBeNull();
    });

    it('should persist current item change', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.updateCurrentItem(created.id, testItem);

      const found = await repository.findById(created.id);

      expect(found!.currentItem).toEqual(testItem);
    });
  });

  describe('setCurrentConversation', () => {
    it('should return null for non-existent project', async () => {
      const result = await repository.setCurrentConversation('non-existent', 'conv-1');
      expect(result).toBeNull();
    });

    it('should set current conversation id', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });

      const updated = await repository.setCurrentConversation(created.id, 'conv-123');

      expect(updated).toBeDefined();
      expect(updated!.currentConversationId).toBe('conv-123');
    });

    it('should allow setting conversation id to null', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.setCurrentConversation(created.id, 'conv-123');

      const updated = await repository.setCurrentConversation(created.id, null);

      expect(updated!.currentConversationId).toBeNull();
    });

    it('should persist conversation id change', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.setCurrentConversation(created.id, 'conv-456');

      const found = await repository.findById(created.id);

      expect(found!.currentConversationId).toBe('conv-456');
    });
  });

  describe('delete', () => {
    it('should return false for non-existent project', async () => {
      const result = await repository.delete('non-existent');
      expect(result).toBe(false);
    });

    it('should delete existing project', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });

      const result = await repository.delete(created.id);

      expect(result).toBe(true);
    });

    it('should remove project from index', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.delete(created.id);

      const found = await repository.findById(created.id);

      expect(found).toBeNull();
    });

    it('should remove project from findAll results', async () => {
      await repository.create({ name: 'Test 1', path: '/test1' });
      const project2 = await repository.create({ name: 'Test 2', path: '/test2' });
      await repository.delete(project2.id);

      const projects = await repository.findAll();

      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe('Test 1');
    });

    it('should remove .claudito directory in project path', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      // Data is stored in {project-root}/.claudito/
      const projectDataDir = '/test/.claudito';

      // Verify the directory was created
      expect(mockFs.dirs.has(projectDataDir)).toBe(true);

      await repository.delete(created.id);

      expect(mockFs.dirs.has(projectDataDir)).toBe(false);
    });

    it('should update index file after deletion', async () => {
      await repository.create({ name: 'Test 1', path: '/test1' });
      const project2 = await repository.create({ name: 'Test 2', path: '/test2' });
      await repository.delete(project2.id);

      const indexContent = mockFs.files.get(indexPath);
      expect(indexContent).toBeDefined();
      const index = JSON.parse(indexContent!);

      expect(index).toHaveLength(1);
      expect(index[0].name).toBe('Test 1');
    });
  });

  describe('caching behavior', () => {
    it('should cache status after first load', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });

      await repository.findById(created.id);
      await repository.findById(created.id);

      const readCalls = (mockFs.readFileSync as jest.Mock).mock.calls.filter(
        (call: string[]) => call[0]?.includes('status.json') && call[0]?.includes('_test')
      );
      expect(readCalls.length).toBeLessThanOrEqual(1);
    });

    it('should update cache on status change', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.updateStatus(created.id, 'running');

      const found = await repository.findById(created.id);

      expect(found!.status).toBe('running');
    });

    it('should clear cache on delete', async () => {
      const created = await repository.create({ name: 'Test', path: '/test' });
      await repository.findById(created.id);
      await repository.delete(created.id);

      const found = await repository.findById(created.id);

      expect(found).toBeNull();
    });
  });

  describe('persistence across repository instances', () => {
    it('should load existing projects from a new repository instance', async () => {
      await repository.create({ name: 'Existing Project', path: '/existing' });

      const newRepository = new FileProjectRepository(dataDir, mockFs);
      const projects = await newRepository.findAll();

      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe('Existing Project');
    });
  });
});
