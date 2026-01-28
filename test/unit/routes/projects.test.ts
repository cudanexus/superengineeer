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
  sampleProject,
} from '../helpers/mock-factories';
import { createErrorHandler } from '../../../src/utils';

// Mock fs module
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      access: jest.fn(),
      stat: jest.fn(),
    },
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    statSync: jest.fn(),
  };
});

import fs from 'fs';

describe('Projects Routes', () => {
  let app: Express;
  let deps: ProjectRouterDependencies;

  beforeEach(() => {
    jest.clearAllMocks();

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
    };

    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectsRouter(deps));
    app.use(createErrorHandler());
  });

  describe('GET /', () => {
    it('should return all projects', async () => {
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(sampleProject.id);
    });

    it('should return empty array when no projects', async () => {
      deps.projectRepository = createMockProjectRepository([]);
      app = express();
      app.use(express.json());
      app.use('/api/projects', createProjectsRouter(deps));

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /', () => {
    it('should create a new project', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'New Project', path: '/test/path' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Project');
      expect(deps.projectService.createProject).toHaveBeenCalledWith({
        name: 'New Project',
        path: '/test/path',
        createNew: false,
      });
    });

    it('should return 400 when path is missing', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'New Project' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Path is required');
    });

    it('should return 400 when project creation fails', async () => {
      deps.projectService.createProject = jest.fn().mockResolvedValue({
        success: false,
        error: 'Folder not found',
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ path: '/invalid/path' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Folder not found');
    });

    it('should pass createNew flag to project service', async () => {
      await request(app)
        .post('/api/projects')
        .send({ name: 'New', path: '/test', createNew: true });

      expect(deps.projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ createNew: true })
      );
    });
  });

  describe('GET /:id', () => {
    it('should return project by id', async () => {
      const response = await request(app).get(`/api/projects/${sampleProject.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(sampleProject.id);
      expect(response.body.name).toBe(sampleProject.name);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app).get('/api/projects/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('should delete project', async () => {
      const response = await request(app).delete(`/api/projects/${sampleProject.id}`);

      expect(response.status).toBe(204);
      expect(deps.projectRepository.delete).toHaveBeenCalledWith(sampleProject.id);
    });

    it('should return 404 for non-existent project', async () => {
      deps.projectRepository.delete = jest.fn().mockResolvedValue(false);

      const response = await request(app).delete('/api/projects/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:id/roadmap', () => {
    it('should return roadmap content and parsed data', async () => {
      const roadmapContent = '# Roadmap\n## Phase 1';
      (fs.promises.readFile as jest.Mock).mockResolvedValue(roadmapContent);

      const response = await request(app).get(`/api/projects/${sampleProject.id}/roadmap`);

      expect(response.status).toBe(200);
      expect(response.body.content).toBe(roadmapContent);
      expect(response.body.parsed).toBeDefined();
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app).get('/api/projects/non-existent/roadmap');

      expect(response.status).toBe(404);
    });

    it('should return 404 when roadmap file not found', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const response = await request(app).get(`/api/projects/${sampleProject.id}/roadmap`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:id/roadmap/generate', () => {
    it('should generate roadmap with valid prompt', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/roadmap/generate`)
        .send({ prompt: 'Create a roadmap for a web app' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(deps.roadmapGenerator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: sampleProject.id,
          prompt: 'Create a roadmap for a web app',
        })
      );
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/roadmap/generate`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Prompt is required');
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .post('/api/projects/non-existent/roadmap/generate')
        .send({ prompt: 'test' });

      expect(response.status).toBe(404);
    });

    it('should return 500 when generation fails', async () => {
      deps.roadmapGenerator.generate = jest.fn().mockResolvedValue({
        success: false,
        error: 'Generation failed',
      });

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/roadmap/generate`)
        .send({ prompt: 'test' });

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /:id/roadmap', () => {
    it('should modify roadmap with valid prompt', async () => {
      const existingContent = '# Existing Roadmap';
      const updatedContent = '# Updated Roadmap';
      (fs.promises.readFile as jest.Mock)
        .mockResolvedValueOnce(existingContent)
        .mockResolvedValueOnce(updatedContent);

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap`)
        .send({ prompt: 'Add a new phase' });

      expect(response.status).toBe(200);
      expect(response.body.content).toBe(updatedContent);
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 when roadmap does not exist', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap`)
        .send({ prompt: 'test' });

      expect(response.status).toBe(404);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .put('/api/projects/non-existent/roadmap')
        .send({ prompt: 'test' });

      expect(response.status).toBe(404);
    });

    it('should return 500 when modification fails', async () => {
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Existing');
      deps.roadmapGenerator.generate = jest.fn().mockResolvedValue({
        success: false,
        error: 'Modification failed',
      });

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap`)
        .send({ prompt: 'test' });

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /:id/roadmap/task', () => {
    beforeEach(() => {
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Roadmap');
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('should delete task with valid params', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/task`)
        .send({ phaseId: 'phase-1', milestoneId: 'milestone-1', taskIndex: 0 });

      expect(response.status).toBe(200);
      expect(deps.roadmapEditor.deleteTask).toHaveBeenCalled();
    });

    it('should return 400 when params are missing', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/task`)
        .send({ phaseId: 'phase-1' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('phaseId, milestoneId, and taskIndex are required');
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .delete('/api/projects/non-existent/roadmap/task')
        .send({ phaseId: 'p', milestoneId: 'm', taskIndex: 0 });

      expect(response.status).toBe(404);
    });

    it('should return 404 when roadmap not found', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/task`)
        .send({ phaseId: 'phase-1', milestoneId: 'milestone-1', taskIndex: 0 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:id/roadmap/milestone', () => {
    beforeEach(() => {
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Roadmap');
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('should delete milestone with valid params', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/milestone`)
        .send({ phaseId: 'phase-1', milestoneId: 'milestone-1' });

      expect(response.status).toBe(200);
      expect(deps.roadmapEditor.deleteMilestone).toHaveBeenCalled();
    });

    it('should return 400 when params are missing', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/milestone`)
        .send({ phaseId: 'phase-1' });

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .delete('/api/projects/non-existent/roadmap/milestone')
        .send({ phaseId: 'p', milestoneId: 'm' });

      expect(response.status).toBe(404);
    });

    it('should return 404 when roadmap not found', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/milestone`)
        .send({ phaseId: 'phase-1', milestoneId: 'milestone-1' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:id/roadmap/phase', () => {
    beforeEach(() => {
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Roadmap');
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('should delete phase with valid params', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/phase`)
        .send({ phaseId: 'phase-1' });

      expect(response.status).toBe(200);
      expect(deps.roadmapEditor.deletePhase).toHaveBeenCalled();
    });

    it('should return 400 when phaseId is missing', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/phase`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .delete('/api/projects/non-existent/roadmap/phase')
        .send({ phaseId: 'p' });

      expect(response.status).toBe(404);
    });

    it('should return 404 when roadmap not found', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/roadmap/phase`)
        .send({ phaseId: 'phase-1' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:id/roadmap/respond', () => {
    it('should send response when generating', async () => {
      deps.roadmapGenerator.isGenerating = jest.fn().mockReturnValue(true);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/roadmap/respond`)
        .send({ response: 'yes' });

      expect(response.status).toBe(200);
      expect(deps.roadmapGenerator.sendResponse).toHaveBeenCalledWith(sampleProject.id, 'yes');
    });

    it('should return 400 when response is missing', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/roadmap/respond`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 400 when not generating', async () => {
      deps.roadmapGenerator.isGenerating = jest.fn().mockReturnValue(false);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/roadmap/respond`)
        .send({ response: 'yes' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No active roadmap generation');
    });
  });

  describe('PUT /:id/roadmap/next-item', () => {
    it('should set next item', async () => {
      const nextItem = {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1',
        itemIndex: 0,
        taskTitle: 'Test Task',
      };

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap/next-item`)
        .send(nextItem);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(deps.projectRepository.updateNextItem).toHaveBeenCalledWith(
        sampleProject.id,
        nextItem
      );
    });

    it('should clear next item with empty body', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap/next-item`)
        .send({});

      expect(response.status).toBe(200);
      expect(deps.projectRepository.updateNextItem).toHaveBeenCalledWith(
        sampleProject.id,
        null
      );
    });

    it('should return 400 when params are incomplete', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/roadmap/next-item`)
        .send({ phaseId: 'phase-1' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /:id/agent/start', () => {
    beforeEach(() => {
      (fs.promises.access as jest.Mock).mockResolvedValue(undefined);
    });

    it('should start autonomous loop', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/start`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(deps.agentManager.startAutonomousLoop).toHaveBeenCalledWith(sampleProject.id);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .post('/api/projects/non-existent/agent/start');

      expect(response.status).toBe(404);
    });

    it('should return 409 when agent already running', async () => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(true);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/start`);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already running');
    });

    it('should return 400 when roadmap not found', async () => {
      (fs.promises.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/start`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Roadmap not found');
    });
  });

  describe('POST /:id/agent/stop', () => {
    it('should stop agent', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/stop`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('stopped');
      expect(deps.agentManager.stopAgent).toHaveBeenCalledWith(sampleProject.id);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .post('/api/projects/non-existent/agent/stop');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:id/agent/status', () => {
    it('should return agent status', async () => {
      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/agent/status`);

      expect(response.status).toBe(200);
      expect(deps.agentManager.getFullStatus).toHaveBeenCalledWith(sampleProject.id);
    });

    it('should return 404 when project not found', async () => {
      const response = await request(app)
        .get('/api/projects/non-existent/agent/status');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:id/agent/context', () => {
    it('should return context usage from running agent', async () => {
      deps.agentManager.getContextUsage = jest.fn().mockReturnValue({
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/agent/context`);

      expect(response.status).toBe(200);
      expect(response.body.contextUsage).toBeDefined();
    });

    it('should return saved context usage when agent not running', async () => {
      deps.projectRepository.findById = jest.fn().mockResolvedValue({
        ...sampleProject,
        lastContextUsage: { inputTokens: 500, outputTokens: 200 },
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/agent/context`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /:id/agent/queue', () => {
    it('should return queued messages', async () => {
      deps.agentManager.getQueuedMessages = jest.fn().mockReturnValue(['msg1', 'msg2']);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/agent/queue`);

      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual(['msg1', 'msg2']);
    });
  });

  describe('GET /:id/agent/loop', () => {
    it('should return loop state', async () => {
      deps.agentManager.getLoopState = jest.fn().mockReturnValue({
        isLooping: true,
        currentMilestone: null,
        currentConversationId: null,
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/agent/loop`);

      expect(response.status).toBe(200);
      expect(response.body.isLooping).toBe(true);
    });

    it('should return false when not looping', async () => {
      deps.agentManager.getLoopState = jest.fn().mockReturnValue(null);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/agent/loop`);

      expect(response.status).toBe(200);
      expect(response.body.isLooping).toBe(false);
    });
  });

  describe('DELETE /:id/agent/queue', () => {
    it('should remove project from queue', async () => {
      deps.agentManager.isQueued = jest.fn().mockReturnValue(true);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/agent/queue`);

      expect(response.status).toBe(200);
      expect(deps.agentManager.removeFromQueue).toHaveBeenCalledWith(sampleProject.id);
    });

    it('should return 400 when not queued', async () => {
      deps.agentManager.isQueued = jest.fn().mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/agent/queue`);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /:id/agent/queue/:index', () => {
    it('should remove queued message by index', async () => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(true);
      deps.agentManager.removeQueuedMessage = jest.fn().mockReturnValue(true);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/agent/queue/0`);

      expect(response.status).toBe(200);
      expect(deps.agentManager.removeQueuedMessage).toHaveBeenCalledWith(sampleProject.id, 0);
    });

    it('should return 400 for invalid index', async () => {
      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/agent/queue/-1`);

      expect(response.status).toBe(400);
    });

    it('should return 400 when agent not running', async () => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/agent/queue/0`);

      expect(response.status).toBe(400);
    });

    it('should return 400 when removal fails', async () => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(true);
      deps.agentManager.removeQueuedMessage = jest.fn().mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/projects/${sampleProject.id}/agent/queue/5`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /:id/agent/interactive', () => {
    it('should start interactive agent', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/interactive`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.mode).toBe('interactive');
      expect(deps.agentManager.startInteractiveAgent).toHaveBeenCalled();
    });

    it('should return 409 when agent already running', async () => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(true);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/interactive`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(409);
    });

    it('should pass session options', async () => {
      await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/interactive`)
        .send({
          message: 'Hello',
          sessionId: 'test-session',
          permissionMode: 'plan',
        });

      expect(deps.agentManager.startInteractiveAgent).toHaveBeenCalledWith(
        sampleProject.id,
        expect.objectContaining({
          sessionId: 'test-session',
          permissionMode: 'plan',
        })
      );
    });
  });

  describe('POST /:id/agent/send', () => {
    beforeEach(() => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(true);
      deps.agentManager.getAgentMode = jest.fn().mockReturnValue('interactive');
    });

    it('should send message to agent', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/send`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(200);
      expect(deps.agentManager.sendInput).toHaveBeenCalledWith(
        sampleProject.id,
        'Hello',
        undefined
      );
    });

    it('should return 400 when message and images are empty', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/send`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 400 when agent not running', async () => {
      deps.agentManager.isRunning = jest.fn().mockReturnValue(false);

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/send`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(400);
    });

    it('should return 400 when not in interactive mode', async () => {
      deps.agentManager.getAgentMode = jest.fn().mockReturnValue('autonomous');

      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/send`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(400);
    });

    it('should allow images without message', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/agent/send`)
        .send({ images: [{ type: 'base64', data: 'abc123' }] });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /:id/conversation', () => {
    it('should return current conversation', async () => {
      const conversation = {
        id: 'conv-1',
        projectId: sampleProject.id,
        messages: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(conversation);
      deps.projectRepository.findById = jest.fn().mockResolvedValue({
        ...sampleProject,
        currentConversationId: 'conv-1',
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversation`);

      expect(response.status).toBe(200);
      expect(response.body.messages).toBeDefined();
      expect(response.body.stats).toBeDefined();
    });

    it('should use conversationId query param', async () => {
      await request(app)
        .get(`/api/projects/${sampleProject.id}/conversation?conversationId=specific-id`);

      expect(deps.conversationRepository.findById).toHaveBeenCalledWith(
        sampleProject.id,
        'specific-id'
      );
    });

    it('should fall back to most recent conversation', async () => {
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(null);
      deps.conversationRepository.getByProject = jest.fn().mockResolvedValue([
        { id: 'recent', messages: [] },
      ]);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversation`);

      expect(response.status).toBe(200);
    });

    it('should calculate stats with messages and timestamps', async () => {
      const conversation = {
        id: 'conv-1',
        projectId: sampleProject.id,
        messages: [
          { type: 'user', timestamp: '2024-01-01T10:00:00.000Z', content: 'hello' },
          { type: 'tool_use', timestamp: '2024-01-01T10:01:00.000Z', name: 'Read' },
          { type: 'assistant', timestamp: '2024-01-01T10:02:00.000Z', content: 'response' },
        ],
        createdAt: '2024-01-01T10:00:00.000Z',
      };
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(conversation);
      deps.projectRepository.findById = jest.fn().mockResolvedValue({
        ...sampleProject,
        currentConversationId: 'conv-1',
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversation`);

      expect(response.status).toBe(200);
      expect(response.body.stats.messageCount).toBe(3);
      expect(response.body.stats.toolCallCount).toBe(1);
      expect(response.body.stats.userMessageCount).toBe(1);
      expect(response.body.stats.durationMs).toBe(120000); // 2 minutes
    });

    it('should use first message timestamp when createdAt is null', async () => {
      const conversation = {
        id: 'conv-1',
        projectId: sampleProject.id,
        messages: [
          { type: 'user', timestamp: '2024-01-01T10:00:00.000Z', content: 'hello' },
          { type: 'assistant', timestamp: '2024-01-01T10:05:00.000Z', content: 'response' },
        ],
        createdAt: null,
      };
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(conversation);
      deps.projectRepository.findById = jest.fn().mockResolvedValue({
        ...sampleProject,
        currentConversationId: 'conv-1',
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversation`);

      expect(response.status).toBe(200);
      expect(response.body.stats.startedAt).toBe('2024-01-01T10:00:00.000Z');
      expect(response.body.stats.durationMs).toBe(300000); // 5 minutes
    });

    it('should handle missing timestamps gracefully', async () => {
      const conversation = {
        id: 'conv-1',
        projectId: sampleProject.id,
        messages: [
          { type: 'user', content: 'hello' },
          { type: 'assistant', content: 'response' },
        ],
        createdAt: null,
      };
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(conversation);
      deps.projectRepository.findById = jest.fn().mockResolvedValue({
        ...sampleProject,
        currentConversationId: 'conv-1',
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversation`);

      expect(response.status).toBe(200);
      expect(response.body.stats.durationMs).toBeNull();
    });
  });

  describe('GET /:id/conversations', () => {
    it('should return all conversations', async () => {
      deps.conversationRepository.getByProject = jest.fn().mockResolvedValue([
        { id: 'conv-1', messages: [] },
        { id: 'conv-2', messages: [] },
      ]);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversations`);

      expect(response.status).toBe(200);
      expect(response.body.conversations).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      await request(app)
        .get(`/api/projects/${sampleProject.id}/conversations?limit=5`);

      expect(deps.conversationRepository.getByProject).toHaveBeenCalledWith(
        sampleProject.id,
        5
      );
    });
  });

  describe('GET /:id/conversations/search', () => {
    it('should search conversations', async () => {
      deps.conversationRepository.searchMessages = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversations/search?q=test`);

      expect(response.status).toBe(200);
      expect(deps.conversationRepository.searchMessages).toHaveBeenCalledWith(
        sampleProject.id,
        'test'
      );
    });

    it('should return empty for short query', async () => {
      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/conversations/search?q=a`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
      expect(deps.conversationRepository.searchMessages).not.toHaveBeenCalled();
    });
  });

  describe('PUT /:id/conversations/:conversationId', () => {
    it('should rename conversation', async () => {
      deps.conversationRepository.findById = jest.fn().mockResolvedValue({
        id: 'conv-1',
        messages: [],
      });
      deps.conversationRepository.renameConversation = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/conversations/conv-1`)
        .send({ label: 'New Label' });

      expect(response.status).toBe(200);
      expect(deps.conversationRepository.renameConversation).toHaveBeenCalledWith(
        sampleProject.id,
        'conv-1',
        'New Label'
      );
    });

    it('should return 400 when label missing', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/conversations/conv-1`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 when conversation not found', async () => {
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/conversations/conv-1`)
        .send({ label: 'New Label' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:id/conversation/clear', () => {
    it('should clear current conversation', async () => {
      const response = await request(app)
        .post(`/api/projects/${sampleProject.id}/conversation/clear`);

      expect(response.status).toBe(200);
      expect(deps.projectRepository.setCurrentConversation).toHaveBeenCalledWith(
        sampleProject.id,
        null
      );
    });
  });

  describe('PUT /:id/conversation/current', () => {
    it('should set current conversation', async () => {
      deps.conversationRepository.findById = jest.fn().mockResolvedValue({
        id: 'conv-1',
        messages: [],
        metadata: { sessionId: 'session-123' },
      });

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/conversation/current`)
        .send({ conversationId: 'conv-1' });

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('session-123');
    });

    it('should return 400 when conversationId missing', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/conversation/current`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 when conversation not found', async () => {
      deps.conversationRepository.findById = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/conversation/current`)
        .send({ conversationId: 'non-existent' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:id/debug', () => {
    it('should return debug info', async () => {
      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/debug`);

      expect(response.status).toBe(200);
      expect(response.body.memoryUsage).toBeDefined();
      expect(response.body.lastCommand).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      await request(app)
        .get(`/api/projects/${sampleProject.id}/debug?limit=10`);

      // The limit is passed to getProjectLogs internally
    });
  });

  describe('GET /:id/claude-files', () => {
    it('should return claude files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('# CLAUDE.md content');
      (fs.statSync as jest.Mock).mockReturnValue({ size: 100 });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/claude-files`);

      expect(response.status).toBe(200);
      expect(response.body.files).toBeDefined();
    });
  });

  describe('PUT /:id/claude-files', () => {
    it('should save claude file within project', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/claude-files`)
        .send({
          filePath: `${sampleProject.path}/CLAUDE.md`,
          content: '# Updated',
        });

      expect(response.status).toBe(200);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return 400 when filePath missing', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/claude-files`)
        .send({ content: 'test' });

      expect(response.status).toBe(400);
    });

    it('should return 400 when file outside project', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/claude-files`)
        .send({
          filePath: '/other/path/file.md',
          content: 'test',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /:id/permissions', () => {
    it('should return permission overrides', async () => {
      deps.projectRepository.findById = jest.fn().mockResolvedValue({
        ...sampleProject,
        permissionOverrides: { enabled: true, allowRules: ['Read'] },
      });

      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/permissions`);

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(true);
    });

    it('should return disabled when no overrides', async () => {
      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/permissions`);

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(false);
    });
  });

  describe('PUT /:id/permissions', () => {
    it('should update permission overrides', async () => {
      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/permissions`)
        .send({
          enabled: true,
          allowRules: ['Read', 'Write'],
          denyRules: ['Bash(rm:*)'],
        });

      expect(response.status).toBe(200);
      expect(deps.projectRepository.updatePermissionOverrides).toHaveBeenCalled();
    });

    it('should clear overrides when disabled', async () => {
      deps.projectRepository.updatePermissionOverrides = jest.fn().mockResolvedValue({
        ...sampleProject,
        permissionOverrides: null,
      });

      const response = await request(app)
        .put(`/api/projects/${sampleProject.id}/permissions`)
        .send({ enabled: false });

      expect(response.status).toBe(200);
      expect(deps.projectRepository.updatePermissionOverrides).toHaveBeenCalledWith(
        sampleProject.id,
        null
      );
    });
  });

  describe('GET /:id/optimizations', () => {
    beforeEach(() => {
      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 1024 });
    });

    it('should return optimization checks', async () => {
      const response = await request(app)
        .get(`/api/projects/${sampleProject.id}/optimizations`);

      expect(response.status).toBe(200);
      expect(response.body.checks).toBeDefined();
      expect(Array.isArray(response.body.checks)).toBe(true);
    });
  });

  describe('Git Routes', () => {
    describe('GET /:id/git/status', () => {
      it('should return git status', async () => {
        const response = await request(app)
          .get(`/api/projects/${sampleProject.id}/git/status`);

        expect(response.status).toBe(200);
        expect(deps.gitService.getStatus).toHaveBeenCalledWith(sampleProject.path);
      });
    });

    describe('GET /:id/git/branches', () => {
      it('should return branches', async () => {
        const response = await request(app)
          .get(`/api/projects/${sampleProject.id}/git/branches`);

        expect(response.status).toBe(200);
        expect(deps.gitService.getBranches).toHaveBeenCalled();
      });
    });

    describe('GET /:id/git/diff', () => {
      it('should return diff', async () => {
        const response = await request(app)
          .get(`/api/projects/${sampleProject.id}/git/diff`);

        expect(response.status).toBe(200);
        expect(deps.gitService.getDiff).toHaveBeenCalledWith(sampleProject.path, false);
      });

      it('should return staged diff', async () => {
        await request(app)
          .get(`/api/projects/${sampleProject.id}/git/diff?staged=true`);

        expect(deps.gitService.getDiff).toHaveBeenCalledWith(sampleProject.path, true);
      });
    });

    describe('POST /:id/git/stage', () => {
      it('should stage files', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/stage`)
          .send({ paths: ['file1.ts', 'file2.ts'] });

        expect(response.status).toBe(200);
        expect(deps.gitService.stageFiles).toHaveBeenCalledWith(
          sampleProject.path,
          ['file1.ts', 'file2.ts']
        );
      });

      it('should return 400 when paths missing', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/stage`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('POST /:id/git/stage-all', () => {
      it('should stage all files', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/stage-all`);

        expect(response.status).toBe(200);
        expect(deps.gitService.stageAll).toHaveBeenCalledWith(sampleProject.path);
      });
    });

    describe('POST /:id/git/unstage', () => {
      it('should unstage files', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/unstage`)
          .send({ paths: ['file1.ts'] });

        expect(response.status).toBe(200);
        expect(deps.gitService.unstageFiles).toHaveBeenCalled();
      });
    });

    describe('POST /:id/git/unstage-all', () => {
      it('should unstage all files', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/unstage-all`);

        expect(response.status).toBe(200);
        expect(deps.gitService.unstageAll).toHaveBeenCalled();
      });
    });

    describe('POST /:id/git/commit', () => {
      it('should commit with message', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/commit`)
          .send({ message: 'Test commit' });

        expect(response.status).toBe(200);
        expect(deps.gitService.commit).toHaveBeenCalledWith(
          sampleProject.path,
          'Test commit'
        );
      });

      it('should return 400 when message missing', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/commit`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('POST /:id/git/branch', () => {
      it('should create branch', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/branch`)
          .send({ name: 'feature/test', checkout: true });

        expect(response.status).toBe(200);
        expect(deps.gitService.createBranch).toHaveBeenCalledWith(
          sampleProject.path,
          'feature/test',
          true
        );
      });

      it('should return 400 when name missing', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/branch`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('POST /:id/git/checkout', () => {
      it('should checkout branch', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/checkout`)
          .send({ branch: 'develop' });

        expect(response.status).toBe(200);
        expect(deps.gitService.checkout).toHaveBeenCalledWith(
          sampleProject.path,
          'develop'
        );
      });

      it('should return 400 when branch missing', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/checkout`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('POST /:id/git/push', () => {
      it('should push to remote', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/push`)
          .send({ remote: 'origin', branch: 'main', setUpstream: true });

        expect(response.status).toBe(200);
        expect(deps.gitService.push).toHaveBeenCalledWith(
          sampleProject.path,
          'origin',
          'main',
          true
        );
      });
    });

    describe('POST /:id/git/pull', () => {
      it('should pull from remote', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/pull`)
          .send({ remote: 'origin', branch: 'main' });

        expect(response.status).toBe(200);
        expect(deps.gitService.pull).toHaveBeenCalledWith(
          sampleProject.path,
          'origin',
          'main'
        );
      });
    });

    describe('GET /:id/git/file-diff', () => {
      it('should return file diff', async () => {
        const response = await request(app)
          .get(`/api/projects/${sampleProject.id}/git/file-diff?path=src/file.ts`);

        expect(response.status).toBe(200);
        expect(deps.gitService.getFileDiff).toHaveBeenCalledWith(
          sampleProject.path,
          'src/file.ts',
          false
        );
      });

      it('should return 400 when path missing', async () => {
        const response = await request(app)
          .get(`/api/projects/${sampleProject.id}/git/file-diff`);

        expect(response.status).toBe(400);
      });
    });

    describe('POST /:id/git/discard', () => {
      it('should discard changes', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/discard`)
          .send({ paths: ['file1.ts'] });

        expect(response.status).toBe(200);
        expect(deps.gitService.discardChanges).toHaveBeenCalledWith(
          sampleProject.path,
          ['file1.ts']
        );
      });

      it('should return 400 when paths missing', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/discard`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('GET /:id/git/tags', () => {
      it('should list tags', async () => {
        const response = await request(app)
          .get(`/api/projects/${sampleProject.id}/git/tags`);

        expect(response.status).toBe(200);
        expect(response.body.tags).toBeDefined();
        expect(deps.gitService.listTags).toHaveBeenCalled();
      });
    });

    describe('POST /:id/git/tags', () => {
      it('should create tag', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/tags`)
          .send({ name: 'v1.0.0', message: 'Release 1.0' });

        expect(response.status).toBe(200);
        expect(deps.gitService.createTag).toHaveBeenCalledWith(
          sampleProject.path,
          'v1.0.0',
          'Release 1.0'
        );
      });

      it('should return 400 when name missing', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/tags`)
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('POST /:id/git/tags/:name/push', () => {
      it('should push tag', async () => {
        const response = await request(app)
          .post(`/api/projects/${sampleProject.id}/git/tags/v1.0.0/push`)
          .send({ remote: 'origin' });

        expect(response.status).toBe(200);
        expect(deps.gitService.pushTag).toHaveBeenCalledWith(
          sampleProject.path,
          'v1.0.0',
          'origin'
        );
      });
    });
  });
});
