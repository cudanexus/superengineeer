import express, { Express } from 'express';
import request from 'supertest';
import { getGlobalLogs, clearGlobalLogs, DefaultLogger } from '../../../src/utils/logger';

describe('Logs API Endpoint', () => {
  let app: Express;

  // Create a mock output that doesn't write to console
  function createMockOutput() {
    return {
      write: jest.fn(),
    };
  }

  beforeEach(() => {
    clearGlobalLogs();

    app = express();
    app.use(express.json());

    // Create the logs endpoint directly (mirrors the implementation in routes/index.ts)
    app.get('/api/logs', (req, res) => {
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 100;
      const logs = getGlobalLogs(limit);
      res.json({ logs });
    });
  });

  describe('GET /api/logs', () => {
    it('should return empty logs array when no logs exist', async () => {
      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ logs: [] });
    });

    it('should return logs from global buffer', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      logger.info('Test message 1');
      logger.info('Test message 2');

      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(2);
      expect(response.body.logs[0].message).toBe('Test message 1');
      expect(response.body.logs[1].message).toBe('Test message 2');
    });

    it('should return logs from loggers with projectId', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info', projectId: 'proj-123' }, mockOutput);

      logger.info('Project-specific message');

      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].message).toBe('Project-specific message');
      expect(response.body.logs[0].projectId).toBe('proj-123');
    });

    it('should return logs from loggers without projectId', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info', name: 'GlobalLogger' }, mockOutput);

      logger.info('Global message without projectId');

      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].message).toBe('Global message without projectId');
      expect(response.body.logs[0].projectId).toBeUndefined();
    });

    it('should respect limit query parameter', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const response = await request(app).get('/api/logs?limit=3');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(3);
      // Should return the last 3 messages
      expect(response.body.logs[0].message).toBe('Message 7');
      expect(response.body.logs[1].message).toBe('Message 8');
      expect(response.body.logs[2].message).toBe('Message 9');
    });

    it('should use default limit of 100 when not specified', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);

      for (let i = 0; i < 150; i++) {
        logger.info(`Message ${i}`);
      }

      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(100);
      // Should return the last 100 messages (50-149)
      expect(response.body.logs[0].message).toBe('Message 50');
      expect(response.body.logs[99].message).toBe('Message 149');
    });

    it('should include log metadata (level, timestamp, name)', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info', name: 'TestLogger' }, mockOutput);

      logger.warn('Warning message', { extra: 'data' });

      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(1);

      const log = response.body.logs[0];
      expect(log.level).toBe('warn');
      expect(log.message).toBe('Warning message');
      expect(log.name).toBe('TestLogger');
      expect(log.timestamp).toBeDefined();
      expect(log.context).toEqual({ extra: 'data' });
    });

    it('should return logs from multiple different loggers', async () => {
      const mockOutput = createMockOutput();
      const logger1 = new DefaultLogger({ level: 'info', name: 'Service1' }, mockOutput);
      const logger2 = new DefaultLogger({ level: 'info', name: 'Service2', projectId: 'proj' }, mockOutput);
      const logger3 = new DefaultLogger({ level: 'info' }, mockOutput);

      logger1.info('From service 1');
      logger2.error('Error from service 2');
      logger3.debug('Debug message'); // Won't appear - debug level not enabled

      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(2);
      expect(response.body.logs[0].name).toBe('Service1');
      expect(response.body.logs[1].name).toBe('Service2');
    });

    it('should handle invalid limit gracefully', async () => {
      const mockOutput = createMockOutput();
      const logger = new DefaultLogger({ level: 'info' }, mockOutput);
      logger.info('Test');

      // NaN limit should result in default behavior
      const response = await request(app).get('/api/logs?limit=invalid');

      expect(response.status).toBe(200);
      // NaN passed to getGlobalLogs should result in undefined limit
    });
  });
});
