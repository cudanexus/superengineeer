import fs from 'fs';
import path from 'path';
import os from 'os';
import { DefaultDataWipeService } from '../../../src/services/data-wipe-service';
import { ProjectRepository, ProjectStatus } from '../../../src/repositories';
import { createMockProjectRepository } from '../helpers/mock-factories';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

function createProject(id: string, projectPath: string): ProjectStatus {
  return {
    id,
    name: `Project ${id}`,
    path: projectPath,
    status: 'stopped',
    currentConversationId: null,
    nextItem: null,
    currentItem: null,
    lastContextUsage: null,
    permissionOverrides: null,
    modelOverride: null,
    mcpOverrides: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('DefaultDataWipeService', () => {
  let mockProjectRepository: jest.Mocked<ProjectRepository>;
  let service: DefaultDataWipeService;
  const dataDirectory = '/home/user/.claudito';

  beforeEach(() => {
    jest.resetAllMocks();
    mockOs.tmpdir.mockReturnValue('/tmp');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.rmSync.mockImplementation(() => undefined);

    mockProjectRepository = createMockProjectRepository([
      createProject('proj-1', '/projects/alpha'),
      createProject('proj-2', '/projects/beta'),
    ]);

    service = new DefaultDataWipeService({
      projectRepository: mockProjectRepository,
      dataDirectory,
    });
  });

  it('should wipe per-project .claudito directories', async () => {
    const summary = await service.wipeAll();

    expect(mockFs.rmSync).toHaveBeenCalledWith(
      path.join('/projects/alpha', '.claudito'),
      { recursive: true, force: true },
    );
    expect(mockFs.rmSync).toHaveBeenCalledWith(
      path.join('/projects/beta', '.claudito'),
      { recursive: true, force: true },
    );
    expect(summary.projectsWiped).toBe(2);
  });

  it('should delete the global data directory', async () => {
    const summary = await service.wipeAll();

    expect(mockFs.rmSync).toHaveBeenCalledWith(
      dataDirectory,
      { recursive: true, force: true },
    );
    expect(summary.globalDataDeleted).toBe(true);
  });

  it('should delete the MCP temp directory', async () => {
    const summary = await service.wipeAll();

    expect(mockFs.rmSync).toHaveBeenCalledWith(
      path.join('/tmp', 'claudito-mcp'),
      { recursive: true, force: true },
    );
    expect(summary.mcpTempDeleted).toBe(true);
  });

  it('should handle missing directories gracefully', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const summary = await service.wipeAll();

    expect(summary.projectsWiped).toBe(0);
    expect(summary.globalDataDeleted).toBe(false);
    expect(summary.mcpTempDeleted).toBe(false);
    expect(mockFs.rmSync).not.toHaveBeenCalled();
  });

  it('should handle rmSync errors without throwing', async () => {
    mockFs.rmSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const summary = await service.wipeAll();

    expect(summary.projectsWiped).toBe(0);
    expect(summary.globalDataDeleted).toBe(false);
    expect(summary.mcpTempDeleted).toBe(false);
  });

  it('should handle project repository errors gracefully', async () => {
    mockProjectRepository.findAll.mockRejectedValue(new Error('Corrupt index'));

    const summary = await service.wipeAll();

    // Per-project wipe skipped, but global and MCP still wiped
    expect(summary.projectsWiped).toBe(0);
    expect(summary.globalDataDeleted).toBe(true);
    expect(summary.mcpTempDeleted).toBe(true);
  });

  it('should return accurate summary with no projects', async () => {
    mockProjectRepository = createMockProjectRepository([]);
    service = new DefaultDataWipeService({
      projectRepository: mockProjectRepository,
      dataDirectory,
    });

    const summary = await service.wipeAll();

    expect(summary.projectsWiped).toBe(0);
    expect(summary.globalDataDeleted).toBe(true);
    expect(summary.mcpTempDeleted).toBe(true);
  });
});
