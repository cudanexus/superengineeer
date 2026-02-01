import express, { Express } from 'express';
import request from 'supertest';
import {
  createProjectsRouter,
  ProjectRouterDependencies,
} from '../../../src/routes/projects';
import {
  createMockProjectRepository,
  createMockProjectService,
  createMockRoadmapParser,
  createMockRoadmapGenerator,
  createMockRoadmapEditor,
  createMockAgentManager,
  createMockConversationRepository,
  createMockSettingsRepository,
  createMockGitService,
  createMockInstructionGenerator,
  createMockRalphLoopService,
  sampleProject,
  sampleRalphLoopState,
} from '../helpers/mock-factories';
import { createErrorHandler } from '../../../src/utils';
import { RalphLoopState } from '../../../src/services/ralph-loop/types';

describe('Ralph Loop Routes', () => {
  let app: Express;
  let deps: ProjectRouterDependencies;
  let mockRalphLoopService: ReturnType<typeof createMockRalphLoopService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRalphLoopService = createMockRalphLoopService();

    deps = {
      projectRepository: createMockProjectRepository([{ ...sampleProject }]),
      projectService: createMockProjectService(),
      roadmapParser: createMockRoadmapParser(),
      roadmapGenerator: createMockRoadmapGenerator(),
      roadmapEditor: createMockRoadmapEditor(),
      agentManager: createMockAgentManager(),
      instructionGenerator: createMockInstructionGenerator(),
      conversationRepository: createMockConversationRepository(),
      settingsRepository: createMockSettingsRepository(),
      gitService: createMockGitService(),
      ralphLoopService: mockRalphLoopService,
    };

    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectsRouter(deps));
    app.use(createErrorHandler());
  });

  describe('POST /:id/ralph-loop/start', () => {
    it('should start a new Ralph Loop with valid config', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/start`)
        .send({
          taskDescription: 'Implement feature X',
          maxTurns: 3,
        });

      expect(response.status).toBe(201);
      expect(response.body.taskId).toBeDefined();
      expect(response.body.config.taskDescription).toBe('Implement feature X');
      expect(response.body.config.maxTurns).toBe(3);
      expect(mockRalphLoopService.start).toHaveBeenCalledWith(
        sampleProject.id,
        expect.objectContaining({
          taskDescription: 'Implement feature X',
          maxTurns: 3,
        })
      );
    });

    it('should use default settings when not provided', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/start`)
        .send({
          taskDescription: 'Implement feature Y',
        });

      expect(response.status).toBe(201);
      expect(mockRalphLoopService.start).toHaveBeenCalledWith(
        sampleProject.id,
        expect.objectContaining({
          taskDescription: 'Implement feature Y',
          maxTurns: 5, // default from settings
          workerModel: 'claude-opus-4-20250514',
          reviewerModel: 'claude-sonnet-4-20250514',
        })
      );
    });

    it('should return 400 when taskDescription is missing', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/start`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Task description is required');
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .post('/api/projects/nonexistent/ralph-loop/start')
        .send({
          taskDescription: 'Test',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should return 503 when service is not available', async () => {
      deps.ralphLoopService = null;
      app = express();
      app.use(express.json());
      app.use('/api/projects', createProjectsRouter(deps));
      app.use(createErrorHandler());

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/start`)
        .send({
          taskDescription: 'Test',
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Ralph Loop service is not available');
    });
  });

  describe('GET /:id/ralph-loop', () => {
    it('should list all Ralph Loops for a project', async () => {
      mockRalphLoopService.listByProject.mockResolvedValue([
        { ...sampleRalphLoopState, taskId: 'task-1' },
        { ...sampleRalphLoopState, taskId: 'task-2' },
      ]);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/ralph-loop`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(mockRalphLoopService.listByProject).toHaveBeenCalledWith(sampleProject.id);
    });

    it('should return empty array when no loops exist', async () => {
      mockRalphLoopService.listByProject.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/ralph-loop`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .get('/api/projects/nonexistent/ralph-loop');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should return 503 when service is not available', async () => {
      deps.ralphLoopService = null;
      app = express();
      app.use(express.json());
      app.use('/api/projects', createProjectsRouter(deps));
      app.use(createErrorHandler());

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/ralph-loop`);

      expect(response.status).toBe(503);
    });
  });

  describe('GET /:id/ralph-loop/:taskId', () => {
    it('should get specific Ralph Loop state', async () => {
      const testState: RalphLoopState = {
        ...sampleRalphLoopState,
        taskId: 'task-123',
        projectId: sampleProject.id,
      };
      mockRalphLoopService.getState.mockResolvedValue(testState);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/ralph-loop/task-123`);

      expect(response.status).toBe(200);
      expect(response.body.taskId).toBe('task-123');
      expect(mockRalphLoopService.getState).toHaveBeenCalledWith(sampleProject.id, 'task-123');
    });

    it('should return 404 when Ralph Loop not found', async () => {
      mockRalphLoopService.getState.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/ralph-loop/nonexistent`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Ralph Loop not found');
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .get('/api/projects/nonexistent/ralph-loop/task-123');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('POST /:id/ralph-loop/:taskId/stop', () => {
    it('should stop a running Ralph Loop', async () => {
      const runningState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'worker_running',
      };
      mockRalphLoopService.getState.mockResolvedValue(runningState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/stop`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockRalphLoopService.stop).toHaveBeenCalledWith(sampleProject.id, 'task-123');
    });

    it('should return 404 when Ralph Loop not found', async () => {
      mockRalphLoopService.getState.mockResolvedValue(null);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/nonexistent/stop`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Ralph Loop not found');
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .post('/api/projects/nonexistent/ralph-loop/task-123/stop');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('POST /:id/ralph-loop/:taskId/pause', () => {
    it('should pause a running Ralph Loop', async () => {
      const runningState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'worker_running',
      };
      mockRalphLoopService.getState.mockResolvedValue(runningState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/pause`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockRalphLoopService.pause).toHaveBeenCalledWith(sampleProject.id, 'task-123');
    });

    it('should pause a reviewer running loop', async () => {
      const runningState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'reviewer_running',
      };
      mockRalphLoopService.getState.mockResolvedValue(runningState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/pause`);

      expect(response.status).toBe(200);
      expect(mockRalphLoopService.pause).toHaveBeenCalled();
    });

    it('should return 409 when already paused', async () => {
      const pausedState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'paused',
      };
      mockRalphLoopService.getState.mockResolvedValue(pausedState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/pause`);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Ralph Loop is already paused');
    });

    it('should return 409 when not running', async () => {
      const idleState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'idle',
      };
      mockRalphLoopService.getState.mockResolvedValue(idleState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/pause`);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Ralph Loop is not running');
    });

    it('should return 404 when Ralph Loop not found', async () => {
      mockRalphLoopService.getState.mockResolvedValue(null);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/nonexistent/pause`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Ralph Loop not found');
    });
  });

  describe('POST /:id/ralph-loop/:taskId/resume', () => {
    it('should resume a paused Ralph Loop', async () => {
      const pausedState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'paused',
      };
      mockRalphLoopService.getState.mockResolvedValue(pausedState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/resume`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockRalphLoopService.resume).toHaveBeenCalledWith(sampleProject.id, 'task-123');
    });

    it('should return 409 when not paused', async () => {
      const runningState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'worker_running',
      };
      mockRalphLoopService.getState.mockResolvedValue(runningState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/resume`);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Ralph Loop is not paused');
    });

    it('should return 409 when idle', async () => {
      const idleState: RalphLoopState = {
        ...sampleRalphLoopState,
        status: 'idle',
      };
      mockRalphLoopService.getState.mockResolvedValue(idleState);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/task-123/resume`);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Ralph Loop is not paused');
    });

    it('should return 404 when Ralph Loop not found', async () => {
      mockRalphLoopService.getState.mockResolvedValue(null);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/ralph-loop/nonexistent/resume`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Ralph Loop not found');
    });
  });

  describe('DELETE /:id/ralph-loop/:taskId', () => {
    it('should delete a Ralph Loop successfully', async () => {
      mockRalphLoopService.delete.mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/ralph-loop/task-123`);

      expect(response.status).toBe(204);
      expect(mockRalphLoopService.delete).toHaveBeenCalledWith(sampleProject.id, 'task-123');
    });

    it('should return 404 when Ralph Loop not found', async () => {
      mockRalphLoopService.delete.mockResolvedValue(false);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/ralph-loop/nonexistent`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Ralph Loop not found');
      expect(mockRalphLoopService.delete).toHaveBeenCalledWith(sampleProject.id, 'nonexistent');
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .delete('/api/projects/nonexistent/ralph-loop/task-123');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });
});
