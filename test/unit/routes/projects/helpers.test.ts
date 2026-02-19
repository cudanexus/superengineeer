import fs from 'fs';
import {
  computeConversationStats,
  checkProjectClaudeMd,
  checkGlobalClaudeMd,
  checkRoadmap,
  findClaudeFiles,
} from '../../../../src/routes/projects/helpers';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;

describe('projects/helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HOME = '/home/testuser';
  });

  describe('computeConversationStats', () => {
    it('should compute stats for empty messages', () => {
      const stats = computeConversationStats([], null);

      expect(stats.messageCount).toBe(0);
      expect(stats.toolCallCount).toBe(0);
      expect(stats.userMessageCount).toBe(0);
      expect(stats.durationMs).toBeNull();
      expect(stats.startedAt).toBeNull();
    });

    it('should count tool_use and user messages', () => {
      const messages = [
        { type: 'user' as const, content: 'hello', timestamp: '2024-01-01T10:00:00Z' },
        { type: 'tool_use' as const, content: '', timestamp: '2024-01-01T10:01:00Z' },
        { type: 'stdout' as const, content: 'hi', timestamp: '2024-01-01T10:02:00Z' },
        { type: 'user' as const, content: 'bye', timestamp: '2024-01-01T10:03:00Z' },
      ];

      const stats = computeConversationStats(messages, '2024-01-01T10:00:00Z');

      expect(stats.messageCount).toBe(4);
      expect(stats.toolCallCount).toBe(1);
      expect(stats.userMessageCount).toBe(2);
      expect(stats.durationMs).toBe(180000); // 3 minutes
    });

    it('should use first message timestamp when createdAt is null', () => {
      const messages = [
        { type: 'user' as const, content: 'hello', timestamp: '2024-01-01T10:00:00Z' },
        { type: 'stdout' as const, content: 'hi', timestamp: '2024-01-01T10:05:00Z' },
      ];

      const stats = computeConversationStats(messages, null);

      expect(stats.startedAt).toBe('2024-01-01T10:00:00Z');
      expect(stats.durationMs).toBe(300000); // 5 minutes
    });

    it('should handle messages with no timestamps', () => {
      const messages = [
        { type: 'user' as const, content: 'hello', timestamp: '' },
        { type: 'stdout' as const, content: 'hi', timestamp: '' },
      ];

      const stats = computeConversationStats(messages, null);

      expect(stats.durationMs).toBeNull();
    });
  });

  describe('checkProjectClaudeMd', () => {
    it('should return info status when file not found', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await checkProjectClaudeMd('/project');

      expect(result.status).toBe('info');
      expect(result.action).toBe('create');
    });

    it('should return warning when file is too short', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue('# Title\nShort');

      const result = await checkProjectClaudeMd('/project');

      expect(result.status).toBe('warning');
      expect(result.statusMessage).toContain('too short');
    });

    it('should return passed for good file', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(
        '# CLAUDE.md\n\nLine 1\nLine 2\nLine 3\nLine 4\nLine 5'
      );

      const result = await checkProjectClaudeMd('/project');

      expect(result.status).toBe('passed');
      expect(result.action).toBe('claude-files');
    });

    it('should return warning when read fails', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockRejectedValue(new Error('EACCES'));

      const result = await checkProjectClaudeMd('/project');

      expect(result.status).toBe('warning');
      expect(result.statusMessage).toContain('Failed to read');
    });
  });

  describe('checkGlobalClaudeMd', () => {
    it('should return info status when file not found', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await checkGlobalClaudeMd();

      expect(result.id).toBe('global-claude-md');
      expect(result.status).toBe('info');
    });

    it('should return warning when file is too short', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue('# Short');

      const result = await checkGlobalClaudeMd();

      expect(result.status).toBe('warning');
      expect(result.statusMessage).toContain('too short');
    });

    it('should return passed for good file', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(
        '# Global\n\nInstruction 1\nInstruction 2\nInstruction 3\nInstruction 4\nInstruction 5'
      );

      const result = await checkGlobalClaudeMd();

      expect(result.status).toBe('passed');
    });

    it('should return warning when read fails', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockRejectedValue(new Error('EPERM'));

      const result = await checkGlobalClaudeMd();

      expect(result.status).toBe('warning');
      expect(result.statusMessage).toContain('Failed to read');
    });
  });

  describe('checkRoadmap', () => {
    it('should return info status when file not found', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await checkRoadmap('/project');

      expect(result.id).toBe('roadmap-md');
      expect(result.status).toBe('info');
      expect(result.action).toBe('create');
    });

    it('should return warning when no phases or milestones', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue('# Roadmap\n\nJust some text');

      const result = await checkRoadmap('/project');

      expect(result.status).toBe('warning');
      expect(result.statusMessage).toContain('No phases or milestones');
    });

    it('should return passed when phases found', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(
        '# Roadmap\n## Phase 1\n### Milestone 1\nTask 1'
      );

      const result = await checkRoadmap('/project');

      expect(result.status).toBe('passed');
    });

    it('should return passed when only milestones found', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(
        '# Roadmap\n### Milestone 1\nTask 1'
      );

      const result = await checkRoadmap('/project');

      expect(result.status).toBe('passed');
    });

    it('should return warning when read fails', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockRejectedValue(new Error('EACCES'));

      const result = await checkRoadmap('/project');

      expect(result.status).toBe('warning');
      expect(result.statusMessage).toContain('Failed to read');
    });
  });

  describe('findClaudeFiles', () => {
    it('should return empty array when no files exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const files = findClaudeFiles('/project');

      expect(files).toEqual([]);
    });

    it('should find global, project, and local CLAUDE.md files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('# Content');
      mockFs.statSync.mockReturnValue({ size: 100 } as fs.Stats);

      const files = findClaudeFiles('/project');

      expect(files).toHaveLength(3);
      expect(files[0]!.isGlobal).toBe(true);
      expect(files[0]!.name).toContain('Global');
      expect(files[1]!.name).toContain('Project');
      expect(files[2]!.name).toContain('Local');
    });

    it('should handle read errors gracefully', () => {
      const existsCalls: string[] = [];
      // Global exists but throws on read, project does not exist, local exists
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString().replace(/\\/g, '/');
        existsCalls.push(pathStr);

        // Global ~/.claude/CLAUDE.md exists
        if (pathStr.includes('testuser/.claude/CLAUDE.md')) return true;
        // Project root CLAUDE.md does not exist
        if (pathStr === '/project/CLAUDE.md') return false;
        // Local .claude/CLAUDE.md exists
        if (pathStr === '/project/.claude/CLAUDE.md') return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const pathStr = p.toString().replace(/\\/g, '/');

        // Global file throws
        if (pathStr.includes('testuser/.claude/CLAUDE.md')) {
          throw new Error('EACCES');
        }

        return '# Local content';
      });
      mockFs.statSync.mockReturnValue({ size: 50 } as fs.Stats);

      const files = findClaudeFiles('/project');

      // Global fails silently, project doesn't exist, local succeeds
      expect(files).toHaveLength(1);
      expect(files[0]!.name).toContain('Local');
    });
  });
});
