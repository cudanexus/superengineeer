import { ProcessTracker } from '../../../src/agents/process-tracker';

jest.mock('../../../src/utils', () => ({
  getLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  getPidTracker: jest.fn().mockReturnValue({
    addProcess: jest.fn(),
    removeProcess: jest.fn(),
    getTrackedProcesses: jest.fn().mockReturnValue([]),
  }),
}));

describe('ProcessTracker', () => {
  let tracker: ProcessTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new ProcessTracker();
  });

  describe('trackProcess', () => {
    it('should track a process', () => {
      tracker.trackProcess('proj-1', 12345);

      expect(tracker.isTracked('proj-1')).toBe(true);
      expect(tracker.getPid('proj-1')).toBe(12345);
    });

    it('should store process info', () => {
      tracker.trackProcess('proj-1', 12345);

      const info = tracker.getProcessInfo('proj-1');
      expect(info).not.toBeNull();
      expect(info!.pid).toBe(12345);
      expect(info!.projectId).toBe('proj-1');
      expect(info!.startedAt).toBeTruthy();
    });
  });

  describe('untrackProcess', () => {
    it('should remove a tracked process', () => {
      tracker.trackProcess('proj-1', 12345);
      tracker.untrackProcess('proj-1');

      expect(tracker.isTracked('proj-1')).toBe(false);
      expect(tracker.getPid('proj-1')).toBeUndefined();
    });

    it('should handle untracking a non-existent process', () => {
      expect(() => tracker.untrackProcess('non-existent')).not.toThrow();
    });
  });

  describe('getProcessInfo', () => {
    it('should return null for unknown project', () => {
      expect(tracker.getProcessInfo('unknown')).toBeNull();
    });
  });

  describe('getTrackedProcesses', () => {
    it('should return all tracked processes', () => {
      tracker.trackProcess('proj-1', 111);
      tracker.trackProcess('proj-2', 222);

      const processes = tracker.getTrackedProcesses();
      expect(processes).toHaveLength(2);
      expect(processes.map(p => p.pid)).toContain(111);
      expect(processes.map(p => p.pid)).toContain(222);
    });

    it('should return empty array when nothing tracked', () => {
      expect(tracker.getTrackedProcesses()).toEqual([]);
    });
  });

  describe('getRunningProjectIds', () => {
    it('should return project IDs of tracked processes', () => {
      tracker.trackProcess('proj-1', 111);
      tracker.trackProcess('proj-2', 222);

      const ids = tracker.getRunningProjectIds();
      expect(ids).toContain('proj-1');
      expect(ids).toContain('proj-2');
    });
  });

  describe('isTracked', () => {
    it('should return false for untracked project', () => {
      expect(tracker.isTracked('proj-1')).toBe(false);
    });

    it('should return true for tracked project', () => {
      tracker.trackProcess('proj-1', 111);
      expect(tracker.isTracked('proj-1')).toBe(true);
    });
  });

  describe('cleanupOrphanProcesses', () => {
    it('should return empty result when no orphans', async () => {
      const result = await tracker.cleanupOrphanProcesses();

      expect(result.foundCount).toBe(0);
      expect(result.killedCount).toBe(0);
      expect(result.killedPids).toEqual([]);
      expect(result.failedPids).toEqual([]);
      expect(result.skippedPids).toEqual([]);
    });

    it('should skip already dead orphan processes', async () => {
      const { getPidTracker } = jest.requireMock('../../../src/utils');
      getPidTracker().getTrackedProcesses.mockReturnValue([
        { projectId: 'proj-1', pid: 99999 },
      ]);

      // Mock process.kill to throw ESRCH (process not found)
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        const err = new Error('ESRCH');
        throw err;
      });

      const freshTracker = new ProcessTracker();
      const result = await freshTracker.cleanupOrphanProcesses();

      expect(result.foundCount).toBe(1);
      expect(result.skippedPids).toContain(99999);

      killSpy.mockRestore();
    });

    it('should kill running orphan processes', async () => {
      const { getPidTracker } = jest.requireMock('../../../src/utils');
      getPidTracker().getTrackedProcesses.mockReturnValue([
        { projectId: 'proj-1', pid: 55555 },
      ]);

      let callCount = 0;
      const killSpy = jest.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
        callCount++;
        // First call: signal 0 check — process exists
        if (signal === 0 && callCount === 1) return true;
        // Second call: SIGTERM — process still alive
        if (signal === 'SIGTERM') return true;
        // Third call: signal 0 after SIGTERM — process dead
        if (signal === 0 && callCount >= 3) {
          throw new Error('ESRCH');
        }
        return true;
      });

      const freshTracker = new ProcessTracker();
      const result = await freshTracker.cleanupOrphanProcesses();

      expect(result.foundCount).toBe(1);
      expect(result.killedPids).toContain(55555);
      expect(result.killedCount).toBe(1);

      killSpy.mockRestore();
    });
  });

  describe('killProcess', () => {
    it('should call process.kill with signal', () => {
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

      tracker.killProcess(12345, 'SIGTERM');

      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      killSpy.mockRestore();
    });

    it('should default to SIGTERM', () => {
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

      tracker.killProcess(12345);

      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      killSpy.mockRestore();
    });

    it('should ignore ESRCH errors (process already dead)', () => {
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(() => tracker.killProcess(12345)).not.toThrow();
      killSpy.mockRestore();
    });

    it('should throw non-ESRCH errors', () => {
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('EPERM');
      });

      expect(() => tracker.killProcess(12345)).toThrow('EPERM');
      killSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should clear all tracked processes', () => {
      tracker.trackProcess('proj-1', 111);
      tracker.trackProcess('proj-2', 222);
      tracker.clear();

      expect(tracker.getTrackedProcesses()).toEqual([]);
      expect(tracker.isTracked('proj-1')).toBe(false);
    });
  });

  describe('persist', () => {
    it('should not throw', () => {
      expect(() => tracker.persist()).not.toThrow();
    });
  });
});
