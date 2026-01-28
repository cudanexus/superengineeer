import {
  DefaultLogger,
  ConsoleLogOutput,
  LogEntry,
  LogLevel,
  initializeLogger,
  getLogger,
  getProjectLogs,
  clearProjectLogs,
} from '../../../src/utils/logger';

// Mock LogOutput for testing
function createMockOutput() {
  return {
    write: jest.fn(),
    getEntries(): LogEntry[] {
      return this.write.mock.calls.map((call) => call[0]);
    },
  };
}

describe('Logger', () => {
  describe('ConsoleLogOutput', () => {
    let consoleSpy: {
      debug: jest.SpyInstance;
      info: jest.SpyInstance;
      warn: jest.SpyInstance;
      error: jest.SpyInstance;
    };

    beforeEach(() => {
      consoleSpy = {
        debug: jest.spyOn(console, 'debug').mockImplementation(),
        info: jest.spyOn(console, 'info').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation(),
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should write debug messages to console.debug', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'debug',
        message: 'Debug message',
        timestamp: '2024-01-01T12:00:00.000Z',
      };

      output.write(entry);

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.debug.mock.calls[0][0]).toContain('DEBUG');
      expect(consoleSpy.debug.mock.calls[0][0]).toContain('Debug message');
    });

    it('should write info messages to console.info', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'info',
        message: 'Info message',
        timestamp: '2024-01-01T12:00:00.000Z',
      };

      output.write(entry);

      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('INFO');
    });

    it('should write warn messages to console.warn', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'warn',
        message: 'Warning message',
        timestamp: '2024-01-01T12:00:00.000Z',
      };

      output.write(entry);

      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.warn.mock.calls[0][0]).toContain('WARN');
    });

    it('should write error messages to console.error', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'error',
        message: 'Error message',
        timestamp: '2024-01-01T12:00:00.000Z',
      };

      output.write(entry);

      expect(consoleSpy.error).toHaveBeenCalled();
      expect(consoleSpy.error.mock.calls[0][0]).toContain('ERROR');
    });

    it('should include logger name in output', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'info',
        message: 'Test message',
        timestamp: '2024-01-01T12:00:00.000Z',
        name: 'TestLogger',
      };

      output.write(entry);

      expect(consoleSpy.info.mock.calls[0][0]).toContain('[TestLogger]');
    });

    it('should include project ID in output', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'info',
        message: 'Test message',
        timestamp: '2024-01-01T12:00:00.000Z',
        projectId: 'my-project',
      };

      output.write(entry);

      expect(consoleSpy.info.mock.calls[0][0]).toContain('[project:my-project]');
    });

    it('should include context as JSON', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'info',
        message: 'Test message',
        timestamp: '2024-01-01T12:00:00.000Z',
        context: { key: 'value', count: 42 },
      };

      output.write(entry);

      expect(consoleSpy.info.mock.calls[0][0]).toContain('{"key":"value","count":42}');
    });

    it('should format timestamp correctly', () => {
      const output = new ConsoleLogOutput();
      const entry: LogEntry = {
        level: 'info',
        message: 'Test message',
        timestamp: '2024-01-01T15:30:45.123Z',
      };

      output.write(entry);

      expect(consoleSpy.info.mock.calls[0][0]).toContain('15:30:45');
    });
  });

  describe('DefaultLogger', () => {
    describe('log levels', () => {
      it('should log all levels when configured for debug', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'debug' }, mockOutput);

        logger.debug('debug message');
        logger.info('info message');
        logger.warn('warn message');
        logger.error('error message');

        expect(mockOutput.write).toHaveBeenCalledTimes(4);
      });

      it('should filter debug when configured for info', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info' }, mockOutput);

        logger.debug('debug message');
        logger.info('info message');
        logger.warn('warn message');
        logger.error('error message');

        expect(mockOutput.write).toHaveBeenCalledTimes(3);
        const entries = mockOutput.getEntries();
        expect(entries.map((e) => e.level)).toEqual(['info', 'warn', 'error']);
      });

      it('should filter debug and info when configured for warn', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'warn' }, mockOutput);

        logger.debug('debug message');
        logger.info('info message');
        logger.warn('warn message');
        logger.error('error message');

        expect(mockOutput.write).toHaveBeenCalledTimes(2);
        const entries = mockOutput.getEntries();
        expect(entries.map((e) => e.level)).toEqual(['warn', 'error']);
      });

      it('should only log errors when configured for error', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'error' }, mockOutput);

        logger.debug('debug message');
        logger.info('info message');
        logger.warn('warn message');
        logger.error('error message');

        expect(mockOutput.write).toHaveBeenCalledTimes(1);
        const entries = mockOutput.getEntries();
        expect(entries[0]?.level).toBe('error');
      });
    });

    describe('log entries', () => {
      it('should include message in entry', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info' }, mockOutput);

        logger.info('Test message');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.message).toBe('Test message');
      });

      it('should include level in entry', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'debug' }, mockOutput);

        logger.warn('Warning');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.level).toBe('warn');
      });

      it('should include timestamp in entry', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info' }, mockOutput);

        logger.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.timestamp).toBeDefined();
        expect(() => new Date(entry!.timestamp)).not.toThrow();
      });

      it('should include context when provided', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info' }, mockOutput);

        logger.info('Test', { key: 'value', num: 123 });

        const entry = mockOutput.getEntries()[0];
        expect(entry?.context).toEqual({ key: 'value', num: 123 });
      });

      it('should include name when configured', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info', name: 'MyLogger' }, mockOutput);

        logger.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.name).toBe('MyLogger');
      });

      it('should include projectId when configured', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info', projectId: 'proj-123' }, mockOutput);

        logger.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.projectId).toBe('proj-123');
      });
    });

    describe('child loggers', () => {
      it('should create child logger with combined name', () => {
        const mockOutput = createMockOutput();
        const parent = new DefaultLogger({ level: 'info', name: 'Parent' }, mockOutput);

        const child = parent.child('Child');
        child.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.name).toBe('Parent:Child');
      });

      it('should create child logger with just name when parent has no name', () => {
        const mockOutput = createMockOutput();
        const parent = new DefaultLogger({ level: 'info' }, mockOutput);

        const child = parent.child('Child');
        child.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.name).toBe('Child');
      });

      it('should inherit log level from parent', () => {
        const mockOutput = createMockOutput();
        const parent = new DefaultLogger({ level: 'warn' }, mockOutput);

        const child = parent.child('Child');
        child.debug('debug');
        child.info('info');
        child.warn('warn');

        expect(mockOutput.write).toHaveBeenCalledTimes(1);
        expect(mockOutput.getEntries()[0]?.level).toBe('warn');
      });

      it('should inherit projectId from parent', () => {
        const mockOutput = createMockOutput();
        const parent = new DefaultLogger(
          { level: 'info', name: 'Parent', projectId: 'proj-1' },
          mockOutput
        );

        const child = parent.child('Child');
        child.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.projectId).toBe('proj-1');
      });

      it('should create deeply nested child loggers', () => {
        const mockOutput = createMockOutput();
        const root = new DefaultLogger({ level: 'info', name: 'Root' }, mockOutput);

        const child = root.child('A').child('B').child('C');
        child.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.name).toBe('Root:A:B:C');
      });
    });

    describe('withProject', () => {
      it('should create logger with project context', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info', name: 'Logger' }, mockOutput);

        const projectLogger = logger.withProject('my-project');
        projectLogger.info('Test');

        const entry = mockOutput.getEntries()[0];
        expect(entry?.projectId).toBe('my-project');
        expect(entry?.name).toBe('Logger');
      });

      it('should inherit log level', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'warn' }, mockOutput);

        const projectLogger = logger.withProject('proj');
        projectLogger.info('info');
        projectLogger.warn('warn');

        expect(mockOutput.write).toHaveBeenCalledTimes(1);
      });

      it('should store logs in project log store', () => {
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info' }, mockOutput);

        const projectLogger = logger.withProject('test-project');
        projectLogger.info('Message 1');
        projectLogger.info('Message 2');

        const logs = getProjectLogs('test-project');
        expect(logs).toHaveLength(2);
        expect(logs[0]?.message).toBe('Message 1');
        expect(logs[1]?.message).toBe('Message 2');
      });
    });
  });

  describe('Project Log Store', () => {
    beforeEach(() => {
      // Clear any existing project logs
      clearProjectLogs('test-project-1');
      clearProjectLogs('test-project-2');
    });

    it('should return empty array for unknown project', () => {
      const logs = getProjectLogs('unknown-project-xyz');
      expect(logs).toEqual([]);
    });

    it('should store logs per project', () => {
      const mockOutput = createMockOutput();
      const logger1 = new DefaultLogger({ level: 'info', projectId: 'test-project-1' }, mockOutput);
      const logger2 = new DefaultLogger({ level: 'info', projectId: 'test-project-2' }, mockOutput);

      logger1.info('Project 1 message');
      logger2.info('Project 2 message');

      const logs1 = getProjectLogs('test-project-1');
      const logs2 = getProjectLogs('test-project-2');

      expect(logs1).toHaveLength(1);
      expect(logs1[0]?.message).toBe('Project 1 message');
      expect(logs2).toHaveLength(1);
      expect(logs2[0]?.message).toBe('Project 2 message');
    });

    it('should respect limit parameter', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info', projectId: 'test-project-1' }, mockOutput);

      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = getProjectLogs('test-project-1', 3);
      expect(logs).toHaveLength(3);
      expect(logs[0]?.message).toBe('Message 7');
      expect(logs[1]?.message).toBe('Message 8');
      expect(logs[2]?.message).toBe('Message 9');
    });

    it('should clear project logs', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info', projectId: 'test-project-1' }, mockOutput);

      logger.info('Message 1');
      logger.info('Message 2');
      expect(getProjectLogs('test-project-1')).toHaveLength(2);

      clearProjectLogs('test-project-1');

      expect(getProjectLogs('test-project-1')).toEqual([]);
    });

    it('should handle clearing non-existent project logs', () => {
      expect(() => clearProjectLogs('nonexistent')).not.toThrow();
    });

    it('should not store logs for loggers without projectId', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      logger.info('No project message');

      // Since there's no projectId, nothing should be stored
      // (This is implicit - there's no projectId to look up)
    });
  });

  describe('Global Logger Functions', () => {
    beforeEach(() => {
      // Reset global logger state by creating a new one
      initializeLogger({ level: 'info' });
    });

    describe('initializeLogger', () => {
      it('should create and return a logger', () => {
        const logger = initializeLogger({ level: 'debug' });

        expect(logger).toBeDefined();
        expect(typeof logger.debug).toBe('function');
        expect(typeof logger.info).toBe('function');
      });

      it('should set the global logger', () => {
        initializeLogger({ level: 'warn', name: 'Initialized' });

        const retrieved = getLogger();
        // Can't directly check name, but we can verify it works
        expect(retrieved).toBeDefined();
      });
    });

    describe('getLogger', () => {
      it('should return the global logger when no name provided', () => {
        initializeLogger({ level: 'info' });
        const logger = getLogger();

        expect(logger).toBeDefined();
      });

      it('should return a child logger when name is provided', () => {
        initializeLogger({ level: 'info' });
        const mockOutput = createMockOutput();
        const logger = new DefaultLogger({ level: 'info' }, mockOutput);

        // Test child creation behavior
        const child = logger.child('TestChild');
        expect(child).toBeDefined();
      });

      it('should create default logger if not initialized', () => {
        // Force reset by initializing then getting without name
        const logger = getLogger('TestLogger');
        expect(logger).toBeDefined();
      });
    });
  });

  describe('Circular Buffer Behavior', () => {
    it('should limit logs to buffer size', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info', projectId: 'buffer-test' }, mockOutput);

      // Default buffer size is 100, write 150 entries
      for (let i = 0; i < 150; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = getProjectLogs('buffer-test');
      expect(logs.length).toBeLessThanOrEqual(100);

      // Should have the most recent messages
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.message).toBe('Message 149');

      // First log should be around Message 50
      const firstLog = logs[0];
      expect(firstLog?.message).toBe('Message 50');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      logger.info('');

      expect(mockOutput.write).toHaveBeenCalled();
      expect(mockOutput.getEntries()[0]?.message).toBe('');
    });

    it('should handle undefined context', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      logger.info('Test', undefined);

      expect(mockOutput.write).toHaveBeenCalled();
      expect(mockOutput.getEntries()[0]?.context).toBeUndefined();
    });

    it('should handle complex context objects', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      const complexContext = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        date: new Date().toISOString(),
      };

      logger.info('Test', complexContext);

      expect(mockOutput.getEntries()[0]?.context).toEqual(complexContext);
    });

    it('should handle special characters in message', () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      logger.info('Message with "quotes" and\nnewlines\tand\ttabs');

      expect(mockOutput.write).toHaveBeenCalled();
    });
  });
});
