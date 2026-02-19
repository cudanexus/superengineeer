import express, { Express } from 'express';
import request from 'supertest';
import { createOptimizationRouter } from '../../../../src/routes/projects/optimization';
import { ClaudeOptimizationService } from '../../../../src/services/claude-optimization-service';
import { createErrorHandler } from '../../../../src/utils';

describe('Optimization Routes', () => {
  let app: Express;
  let mockService: jest.Mocked<ClaudeOptimizationService>;

  function setupApp(service?: ClaudeOptimizationService): void {
    app = express();
    app.use(express.json());
    // Mount with :id param like the real router
    app.use('/api/projects/:id/optimization', createOptimizationRouter({
      optimizationService: service,
    }));
    app.use(createErrorHandler());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockService = {
      startOptimization: jest.fn().mockResolvedValue('oneoff-123'),
      isOptimizing: jest.fn().mockReturnValue(false),
      getActiveOptimizations: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ClaudeOptimizationService>;

    setupApp(mockService);
  });

  describe('POST /optimize-file', () => {
    it('should start optimization successfully', async () => {
      const response = await request(app)
        .post('/api/projects/proj-1/optimization/optimize-file')
        .send({ filePath: '/project/CLAUDE.md', content: 'rules' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, oneOffId: 'oneoff-123' });
      expect(mockService.startOptimization).toHaveBeenCalledWith({
        projectId: 'proj-1',
        filePath: '/project/CLAUDE.md',
        content: 'rules',
      });
    });

    it('should return error when already optimizing', async () => {
      mockService.isOptimizing.mockReturnValue(true);

      const response = await request(app)
        .post('/api/projects/proj-1/optimization/optimize-file')
        .send({ filePath: '/project/CLAUDE.md', content: 'rules' });

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/projects/proj-1/optimization/optimize-file')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should accept optimization goals', async () => {
      const response = await request(app)
        .post('/api/projects/proj-1/optimization/optimize-file')
        .send({
          filePath: '/project/CLAUDE.md',
          content: 'rules',
          optimizationGoals: ['goal1'],
        });

      expect(response.status).toBe(200);
      expect(mockService.startOptimization).toHaveBeenCalledWith(
        expect.objectContaining({ optimizationGoals: ['goal1'] })
      );
    });
  });

  describe('GET /optimization-status', () => {
    it('should return not optimizing', async () => {
      mockService.isOptimizing.mockReturnValue(false);

      const response = await request(app)
        .get('/api/projects/proj-1/optimization/optimization-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ isOptimizing: false });
    });

    it('should return optimizing true', async () => {
      mockService.isOptimizing.mockReturnValue(true);

      const response = await request(app)
        .get('/api/projects/proj-1/optimization/optimization-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ isOptimizing: true });
    });
  });

  describe('when optimization service is not provided', () => {
    it('should return 404 for all routes', async () => {
      setupApp(undefined);

      const response = await request(app)
        .post('/api/projects/proj-1/optimization/optimize-file')
        .send({ filePath: '/test', content: 'test' });

      expect(response.status).toBe(404);
    });
  });
});
