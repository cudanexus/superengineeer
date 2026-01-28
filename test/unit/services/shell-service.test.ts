import { EventEmitter } from 'events';
import { DefaultShellService } from '../../../src/services/shell-service';

// Factory function to create fresh mock PTY processes
function createMockPty() {
  const emitter = new EventEmitter();
  return {
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    onData: jest.fn((callback: (data: string) => void) => {
      emitter.on('data', callback);
    }),
    onExit: jest.fn((callback: (e: { exitCode: number }) => void) => {
      emitter.on('exit', callback);
    }),
    pid: 12345,
    // Helper to simulate events in tests
    _emit: (event: string, data: unknown) => emitter.emit(event, data)
  };
}

let currentMockPty = createMockPty();

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => currentMockPty),
}));

// Mock os.platform
jest.mock('os', () => ({
  platform: jest.fn(() => 'win32'),
}));

import * as pty from 'node-pty';
import { platform } from 'os';

describe('DefaultShellService', () => {
  let service: DefaultShellService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create fresh mock PTY for each test
    currentMockPty = createMockPty();
    (pty.spawn as jest.Mock).mockImplementation(() => currentMockPty);
    service = new DefaultShellService();
  });

  afterEach(() => {
    service.killAllSessions();
  });

  describe('createSession', () => {
    it('should create a new shell session', () => {
      const session = service.createSession('project-1', '/test/path');

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^shell-project-1-\d+-\d+$/);
      expect(session.projectId).toBe('project-1');
      expect(session.cwd).toBe('/test/path');
      expect(session.projectPath).toBe('/test/path');
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should spawn PowerShell on Windows', () => {
      service.createSession('project-1', '/test/path');

      expect(pty.spawn).toHaveBeenCalledWith(
        'powershell.exe',
        [],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: '/test/path',
          env: expect.objectContaining({
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            CLAUDITO_PROJECT_ROOT: '/test/path'
          }),
        })
      );
    });

    it('should spawn bash on Unix-like systems', () => {
      (platform as jest.Mock).mockReturnValue('linux');
      // Need to recreate service after changing platform
      service = new DefaultShellService();

      service.createSession('project-2', '/test/path');

      expect(pty.spawn).toHaveBeenCalledWith(
        expect.stringContaining('bash'),
        ['-i'],
        expect.objectContaining({
          cwd: '/test/path',
        })
      );
    });

    it('should use custom cols and rows from options', () => {
      service.createSession('project-1', '/test/path', { cols: 120, rows: 40 });

      expect(pty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          cols: 120,
          rows: 40,
        })
      );
    });

    it('should kill existing session for same project', () => {
      // Create first session
      const mockPty1 = createMockPty();
      (pty.spawn as jest.Mock).mockReturnValueOnce(mockPty1);
      const session1 = service.createSession('project-1', '/test/path');
      const session1Id = session1.id;

      // Create second session for same project - should kill the first one
      const mockPty2 = createMockPty();
      (pty.spawn as jest.Mock).mockReturnValueOnce(mockPty2);
      const session2 = service.createSession('project-1', '/test/path');

      // First session should have been killed
      expect(mockPty1.kill).toHaveBeenCalled();
      // First session should no longer be accessible
      expect(service.getSession(session1Id)).toBeUndefined();
      // Second session should be accessible
      expect(service.getSession(session2.id)).toBeDefined();
      // Project should map to second session
      expect(service.getSessionByProject('project-1')?.id).toBe(session2.id);
    });

    it('should allow multiple sessions for different projects', () => {
      const mockPty1 = createMockPty();
      const mockPty2 = createMockPty();
      (pty.spawn as jest.Mock)
        .mockReturnValueOnce(mockPty1)
        .mockReturnValueOnce(mockPty2);

      const session1 = service.createSession('project-1', '/test/path1');
      const session2 = service.createSession('project-2', '/test/path2');

      expect(service.getSession(session1.id)).toBeDefined();
      expect(service.getSession(session2.id)).toBeDefined();
    });
  });

  describe('getSession', () => {
    it('should return session by id', () => {
      const created = service.createSession('project-1', '/test/path');
      const retrieved = service.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const session = service.getSession('non-existent-id');

      expect(session).toBeUndefined();
    });
  });

  describe('getSessionByProject', () => {
    it('should return session by project id', () => {
      const created = service.createSession('project-1', '/test/path');
      const retrieved = service.getSessionByProject('project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for project without session', () => {
      const session = service.getSessionByProject('non-existent-project');

      expect(session).toBeUndefined();
    });
  });

  describe('write', () => {
    it('should write data to PTY', () => {
      const session = service.createSession('project-1', '/test/path');

      const result = service.write(session.id, 'echo hello\n');

      expect(result).toBe(true);
      expect(currentMockPty.write).toHaveBeenCalledWith('echo hello\n');
    });

    it('should return false for non-existent session', () => {
      const result = service.write('non-existent-id', 'echo hello\n');

      expect(result).toBe(false);
    });

    it('should return false when PTY write fails', () => {
      const session = service.createSession('project-1', '/test/path');
      currentMockPty.write.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      const result = service.write(session.id, 'echo hello\n');

      expect(result).toBe(false);
    });
  });

  describe('resize', () => {
    it('should resize the PTY', () => {
      const session = service.createSession('project-1', '/test/path');

      service.resize(session.id, 120, 40);

      expect(currentMockPty.resize).toHaveBeenCalledWith(120, 40);
    });

    it('should handle non-existent session gracefully', () => {
      expect(() => {
        service.resize('non-existent-id', 80, 24);
      }).not.toThrow();
    });

    it('should handle resize error gracefully', () => {
      const session = service.createSession('project-1', '/test/path');
      currentMockPty.resize.mockImplementationOnce(() => {
        throw new Error('Resize failed');
      });

      expect(() => {
        service.resize(session.id, 80, 24);
      }).not.toThrow();
    });
  });

  describe('killSession', () => {
    it('should kill PTY process', () => {
      const session = service.createSession('project-1', '/test/path');

      service.killSession(session.id);

      expect(currentMockPty.kill).toHaveBeenCalled();
      expect(service.getSession(session.id)).toBeUndefined();
    });

    it('should remove project mapping', () => {
      const session = service.createSession('project-1', '/test/path');

      service.killSession(session.id);

      expect(service.getSessionByProject('project-1')).toBeUndefined();
    });

    it('should handle non-existent session gracefully', () => {
      expect(() => {
        service.killSession('non-existent-id');
      }).not.toThrow();
    });

    it('should handle PTY kill error gracefully', () => {
      const session = service.createSession('project-1', '/test/path');
      currentMockPty.kill.mockImplementationOnce(() => {
        throw new Error('Process already dead');
      });

      expect(() => {
        service.killSession(session.id);
      }).not.toThrow();
    });
  });

  describe('killAllSessions', () => {
    it('should kill all active sessions', () => {
      const mockPty1 = createMockPty();
      const mockPty2 = createMockPty();
      (pty.spawn as jest.Mock)
        .mockReturnValueOnce(mockPty1)
        .mockReturnValueOnce(mockPty2);

      service.createSession('project-1', '/test/path1');
      service.createSession('project-2', '/test/path2');

      service.killAllSessions();

      expect(service.getSessionByProject('project-1')).toBeUndefined();
      expect(service.getSessionByProject('project-2')).toBeUndefined();
    });

    it('should handle empty sessions gracefully', () => {
      expect(() => {
        service.killAllSessions();
      }).not.toThrow();
    });
  });

  describe('event emission', () => {
    it('should emit data event on PTY data', () => {
      const dataHandler = jest.fn();
      service.on('data', dataHandler);

      const session = service.createSession('project-1', '/test/path');

      // Simulate PTY data
      currentMockPty._emit('data', 'output data');

      expect(dataHandler).toHaveBeenCalledWith(session.id, 'output data');
    });

    it('should emit exit event when PTY exits', () => {
      const exitHandler = jest.fn();
      service.on('exit', exitHandler);

      const session = service.createSession('project-1', '/test/path');

      // Simulate PTY exit
      currentMockPty._emit('exit', { exitCode: 0 });

      expect(exitHandler).toHaveBeenCalledWith(session.id, 0);
    });

    it('should cleanup session on exit', () => {
      const session = service.createSession('project-1', '/test/path');

      // Simulate PTY exit
      currentMockPty._emit('exit', { exitCode: 0 });

      expect(service.getSession(session.id)).toBeUndefined();
      expect(service.getSessionByProject('project-1')).toBeUndefined();
    });
  });

  describe('off', () => {
    it('should remove event listener', () => {
      const dataHandler = jest.fn();
      service.on('data', dataHandler);
      service.off('data', dataHandler);

      service.createSession('project-1', '/test/path');
      currentMockPty._emit('data', 'output');

      // Handler should not be called since it was removed
      expect(dataHandler).not.toHaveBeenCalled();
    });
  });
});
