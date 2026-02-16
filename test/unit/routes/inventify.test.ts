import request from 'supertest';
import express from 'express';
import { createInventifyRouter } from '../../../src/routes/projects/inventify';
import {
  createMockSettingsRepository,
  createMockProjectRepository,
  createMockProjectService,
  createMockRoadmapParser,
  createMockRoadmapGenerator,
  createMockRoadmapEditor,
  createMockAgentManager,
  createMockInstructionGenerator,
  createMockConversationRepository,
  createMockGitService,
  createMockInventifyService,
} from '../helpers/mock-factories';
import { ProjectRouterDependencies } from '../../../src/routes/projects/types';

function createTestApp(deps: Partial<ProjectRouterDependencies> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps: ProjectRouterDependencies = {
    projectRepository: createMockProjectRepository(),
    projectService: createMockProjectService(),
    roadmapParser: createMockRoadmapParser(),
    roadmapGenerator: createMockRoadmapGenerator(),
    roadmapEditor: createMockRoadmapEditor(),
    agentManager: createMockAgentManager(),
    instructionGenerator: createMockInstructionGenerator(),
    conversationRepository: createMockConversationRepository(),
    settingsRepository: createMockSettingsRepository({
      inventifyFolder: '/test/inventify',
    }),
    gitService: createMockGitService(),
    inventifyService: createMockInventifyService(),
    ...deps,
  };

  app.use('/', createInventifyRouter(defaultDeps));

  return { app, deps: defaultDeps };
}

describe('Inventify Router', () => {
  describe('POST /start', () => {
    it('should return 201 with oneOffId and projectId', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/start')
        .send({
          projectTypes: ['web'],
          themes: ['games'],
        })
        .expect(201);

      expect(res.body.oneOffId).toBe('inventify-oneoff-id');
      expect(res.body.placeholderProjectId).toBe('inventify-project-id');
    });

    it('should return 400 if inventifyFolder is not configured', async () => {
      const { app } = createTestApp({
        settingsRepository: createMockSettingsRepository({
          inventifyFolder: '',
        }),
      });

      const res = await request(app)
        .post('/start')
        .send({
          projectTypes: ['web'],
          themes: ['games'],
        })
        .expect(400);

      expect(res.body.error).toContain('Inventify folder not configured');
    });

    it('should return 400 if projectTypes is empty', async () => {
      const { app } = createTestApp();

      await request(app)
        .post('/start')
        .send({
          projectTypes: [],
          themes: ['games'],
        })
        .expect(400);
    });

    it('should return 400 if themes is empty', async () => {
      const { app } = createTestApp();

      await request(app)
        .post('/start')
        .send({
          projectTypes: ['web'],
          themes: [],
        })
        .expect(400);
    });

    it('should return 400 if body is missing fields', async () => {
      const { app } = createTestApp();

      await request(app)
        .post('/start')
        .send({})
        .expect(400);
    });

    it('should return 503 if inventify service is not available', async () => {
      const { app } = createTestApp({
        inventifyService: undefined,
      });

      await request(app)
        .post('/start')
        .send({
          projectTypes: ['web'],
          themes: ['games'],
        })
        .expect(503);
    });

    it('should return 500 if service throws', async () => {
      const mockInventifyService = createMockInventifyService();
      mockInventifyService.start.mockRejectedValue(
        new Error('Already running'),
      );

      const { app } = createTestApp({
        inventifyService: mockInventifyService,
      });

      const res = await request(app)
        .post('/start')
        .send({
          projectTypes: ['web'],
          themes: ['games'],
        })
        .expect(500);

      expect(res.body.error).toBe('Already running');
    });
  });

  describe('GET /ideas', () => {
    it('should return ideas when available', async () => {
      const mockInventifyService = createMockInventifyService();
      mockInventifyService.getIdeas.mockReturnValue([
        { name: 'idea-1', tagline: 'Tagline 1', description: 'Desc 1' },
        { name: 'idea-2', tagline: 'Tagline 2', description: 'Desc 2' },
      ]);

      const { app } = createTestApp({
        inventifyService: mockInventifyService,
      });

      const res = await request(app)
        .get('/ideas')
        .expect(200);

      expect(res.body.ideas).toHaveLength(2);
      expect(res.body.ideas[0].name).toBe('idea-1');
    });

    it('should return 404 when no ideas available', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .get('/ideas')
        .expect(404);

      expect(res.body.error).toContain('No ideas available');
    });

    it('should return 503 if service not available', async () => {
      const { app } = createTestApp({
        inventifyService: undefined,
      });

      await request(app)
        .get('/ideas')
        .expect(503);
    });
  });

  describe('POST /select', () => {
    it('should return 201 with new oneOffId', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/select')
        .send({ selectedIndex: 2 })
        .expect(201);

      expect(res.body.oneOffId).toBe('inventify-build-oneoff-id');
      expect(res.body.placeholderProjectId).toBe('inventify-project-id');
    });

    it('should return 400 for invalid index', async () => {
      const { app } = createTestApp();

      await request(app)
        .post('/select')
        .send({ selectedIndex: 10 })
        .expect(400);
    });

    it('should return 400 for negative index', async () => {
      const { app } = createTestApp();

      await request(app)
        .post('/select')
        .send({ selectedIndex: -1 })
        .expect(400);
    });

    it('should return 400 for missing body', async () => {
      const { app } = createTestApp();

      await request(app)
        .post('/select')
        .send({})
        .expect(400);
    });

    it('should return 500 if service throws', async () => {
      const mockInventifyService = createMockInventifyService();
      mockInventifyService.selectIdea.mockRejectedValue(
        new Error('No pending ideas'),
      );

      const { app } = createTestApp({
        inventifyService: mockInventifyService,
      });

      const res = await request(app)
        .post('/select')
        .send({ selectedIndex: 0 })
        .expect(500);

      expect(res.body.error).toBe('No pending ideas');
    });

    it('should return 503 if service not available', async () => {
      const { app } = createTestApp({
        inventifyService: undefined,
      });

      await request(app)
        .post('/select')
        .send({ selectedIndex: 0 })
        .expect(503);
    });
  });
});
