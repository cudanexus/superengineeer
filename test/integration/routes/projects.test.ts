import request from 'supertest';
import express, { Express } from 'express';
import { createProjectsRouter } from '../../../src/routes/projects';
import { createErrorHandler } from '../../../src/utils';

describe('Project Routes Integration Tests', () => {
  let app: Express;
  let mockDependencies: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock dependencies
    mockDependencies = {
      projectRepository: {
        findAll: jest.fn(),
        findById: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        updatePermissionOverrides: jest.fn(),
        updateModelOverride: jest.fn(),
        setCurrentConversation: jest.fn(),
      },
      projectService: {
        createProject: jest.fn(),
      },
      conversationRepository: {
        getByProject: jest.fn(),
        findById: jest.fn(),
        searchMessages: jest.fn(),
        renameConversation: jest.fn(),
      },
      agentManager: {
        getAgentStatus: jest.fn(() => 'stopped'),
        isRunning: jest.fn(() => false),
        isQueued: jest.fn(() => false),
        startAutonomousLoop: jest.fn(),
        startInteractiveAgent: jest.fn(),
        stopAgent: jest.fn(),
        getFullStatus: jest.fn(),
        getContextUsage: jest.fn(),
        getQueuedMessages: jest.fn(),
        getLoopState: jest.fn(),
        sendInput: jest.fn(),
        getSessionId: jest.fn(() => 'test-session-id'),
      },
      gitService: {
        getStatus: jest.fn(),
        getBranches: jest.fn(),
        getDiff: jest.fn(),
        stageFiles: jest.fn(),
        commit: jest.fn(),
      },
      roadmapParser: {
        parse: jest.fn(),
      },
      roadmapGenerator: {
        generate: jest.fn(),
      },
      roadmapEditor: {
        deleteTask: jest.fn(),
        deleteMilestone: jest.fn(),
        deletePhase: jest.fn(),
      },
      settingsRepository: {
        get: jest.fn(),
      },
      shellService: null,
      ralphLoopService: null,
      shellEnabled: false,
    };

    app.use('/api/projects', createProjectsRouter(mockDependencies));
    app.use(createErrorHandler());
  });

  const mockProject = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Project',
    path: '/test/path',
    status: 'stopped' as const,
    currentConversationId: null,
    nextItem: null,
    currentItem: null,
    lastContextUsage: null,
    permissionOverrides: null,
    modelOverride: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  describe('Validation Middleware', () => {
    describe('POST /api/projects', () => {
      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/projects')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/required|Invalid input/);
      });

      it('should accept valid project creation', async () => {
        mockDependencies.projectService.createProject.mockResolvedValue({
          success: true,
          project: mockProject,
        });

        const response = await request(app)
          .post('/api/projects')
          .send({
            name: 'New Project',
            path: '/test/new-project',
          });

        expect(response.status).toBe(201);
        expect(response.body).toEqual(mockProject);
      });
    });

    describe('PUT /api/projects/:id/permissions', () => {
      it('should return 404 for non-existent project', async () => {
        const response = await request(app)
          .put('/api/projects/invalid-id/permissions')
          .send({ enabled: true });

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('Project not found');
      });

      it('should validate permission mode enum', async () => {
        mockDependencies.projectRepository.findById.mockResolvedValue(mockProject);

        const response = await request(app)
          .put(`/api/projects/${mockProject.id}/permissions`)
          .send({
            enabled: true,
            defaultMode: 'invalid-mode',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid option: expected one of');
      });

      it('should accept valid permission update', async () => {
        mockDependencies.projectRepository.findById.mockResolvedValue(mockProject);
        const updatedPermissions = {
          enabled: true,
          allowRules: ['Read'],
          denyRules: [],
          defaultMode: 'plan',
        };
        mockDependencies.projectRepository.updatePermissionOverrides.mockResolvedValue(updatedPermissions);

        const response = await request(app)
          .put(`/api/projects/${mockProject.id}/permissions`)
          .send(updatedPermissions);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(updatedPermissions);
      });
    });

    describe('POST /api/projects/:id/agent/send', () => {
      it('should require either message or images', async () => {
        mockDependencies.projectRepository.findById.mockResolvedValue(mockProject);

        const response = await request(app)
          .post(`/api/projects/${mockProject.id}/agent/send`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Either message or images must be provided');
      });

      it('should validate project exists', async () => {
        mockDependencies.projectRepository.findById.mockResolvedValue(null);

        const response = await request(app)
          .post(`/api/projects/${mockProject.id}/agent/send`)
          .send({ message: 'Hello' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Project not found');
      });
    });

    describe('POST /api/projects/:id/git/commit', () => {
      it('should require commit message', async () => {
        mockDependencies.projectRepository.findById.mockResolvedValue(mockProject);

        const response = await request(app)
          .post(`/api/projects/${mockProject.id}/git/commit`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('message: Invalid input: expected string, received undefined');
      });

      it('should accept valid commit', async () => {
        mockDependencies.projectRepository.findById.mockResolvedValue(mockProject);
        mockDependencies.gitService.commit.mockResolvedValue({
          hash: 'abc123',
          message: 'Test commit',
        });

        const response = await request(app)
          .post(`/api/projects/${mockProject.id}/git/commit`)
          .send({ message: 'Test commit' });

        expect(response.status).toBe(200);
        expect(response.body.hash).toBe('abc123');
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit roadmap generation', async () => {
      mockDependencies.projectRepository.findById.mockResolvedValue(mockProject);
      mockDependencies.roadmapGenerator.generate.mockResolvedValue({
        success: true,
      });

      // Make multiple requests
      const promises = Array(5).fill(null).map(() =>
        request(app)
          .post(`/api/projects/${mockProject.id}/roadmap/generate`)
          .send({ prompt: 'Generate roadmap' })
      );

      const responses = await Promise.all(promises);

      // First 3 should succeed, rest should be rate limited
      expect(responses.slice(0, 3).every(r => r.status === 200)).toBe(true);
      expect(responses.slice(3).every(r => r.status === 429)).toBe(true);
      expect(responses[3]?.body?.error).toContain('Too many');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockDependencies.projectRepository.findById.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get(`/api/projects/${mockProject.id}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('An unexpected error occurred');
    });

    it('should handle validation errors with details', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: '', // Invalid empty name
          path: '/test/path',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Project name is required');
    });
  });
});