import express, { Express } from 'express';
import request from 'supertest';
import {
  createProjectsRouter,
  ProjectRouterDependencies,
} from '../../../../src/routes/projects';
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
} from '../../helpers/mock-factories';
import { ShellService, ShellSession } from '../../../../src/services/shell-service';
import { createErrorHandler } from '../../../../src/utils';

// Mock rate limit middleware
jest.mock('../../../../src/middleware/rate-limit', () => ({
  roadmapGenerationRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  agentOperationRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  moderateRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  strictRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../../src/routes', () => ({
  ...jest.requireActual('../../../../src/routes'),
  getWebSocketServer: jest.fn(() => null),
  getAgentManager: jest.fn(() => null),
  getProcessTracker: jest.fn(() => null),
  getRalphLoopService: jest.fn(() => null),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      access: jest.fn(),
      stat: jest.fn(),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    statSync: jest.fn(),
  };
});

function createMockShellService(): jest.Mocked<ShellService> {
  return {
    createSession: jest.fn(),
    getSession: jest.fn(),
    getSessionByProject: jest.fn(),
    write: jest.fn(),
    resize: jest.fn(),
    killSession: jest.fn(),
    killAllSessions: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
}

function createMockSession(projectId: string): ShellSession {
  return {
    id: `shell-${projectId}-123`,
    projectId,
    pty: {} as ShellSession['pty'],
    cwd: '/project/path',
    projectPath: '/project/path',
    createdAt: Date.now(),
  };
}

describe('Shell Routes', () => {
  let app: Express;
  let deps: ProjectRouterDependencies;
  let mockShellService: jest.Mocked<ShellService>;
  const projectId = sampleProject.id;

  function setupApp(shellEnabled?: boolean, shellService?: ShellService | null): void {
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
      shellService: shellService !== undefined ? shellService : mockShellService,
      shellEnabled: shellEnabled !== undefined ? shellEnabled : true,
    };

    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectsRouter(deps));
    app.use(createErrorHandler());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockShellService = createMockShellService();
    setupApp(true, mockShellService);
  });

  describe('GET /shell/enabled', () => {
    it('should return enabled true when shell is enabled', async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}/shell/enabled`);

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(true);
    });

    it('should return enabled false when shell is disabled', async () => {
      setupApp(false);

      const response = await request(app)
        .get(`/api/projects/${projectId}/shell/enabled`);

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(false);
    });
  });

  describe('POST /shell/start', () => {
    it('should return 403 when shell is disabled', async () => {
      setupApp(false);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/start`);

      expect(response.status).toBe(403);
      expect(response.body.shellDisabled).toBe(true);
    });

    it('should return 503 when shell service is not available', async () => {
      setupApp(true, null);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/start`);

      expect(response.status).toBe(503);
    });

    it('should return existing session if one exists', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(session);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/start`);

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.status).toBe('ready');
      expect(mockShellService.createSession).not.toHaveBeenCalled();
    });

    it('should create a new session', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(undefined);
      mockShellService.createSession.mockReturnValue(session);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/start`);

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe(session.id);
      expect(mockShellService.createSession).toHaveBeenCalled();
    });
  });

  describe('GET /shell/status', () => {
    it('should return 403 when shell is disabled', async () => {
      setupApp(false);

      const response = await request(app)
        .get(`/api/projects/${projectId}/shell/status`);

      expect(response.status).toBe(403);
    });

    it('should return 503 when shell service is not available', async () => {
      setupApp(true, null);

      const response = await request(app)
        .get(`/api/projects/${projectId}/shell/status`);

      expect(response.status).toBe(503);
    });

    it('should return no_session when no session exists', async () => {
      mockShellService.getSessionByProject.mockReturnValue(undefined);

      const response = await request(app)
        .get(`/api/projects/${projectId}/shell/status`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('no_session');
    });

    it('should return active session info', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(session);

      const response = await request(app)
        .get(`/api/projects/${projectId}/shell/status`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('active');
      expect(response.body.sessionId).toBe(session.id);
    });
  });

  describe('POST /shell/input', () => {
    it('should return 403 when shell is disabled', async () => {
      setupApp(false);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/input`)
        .send({ input: 'ls' });

      expect(response.status).toBe(403);
    });

    it('should return 503 when shell service is not available', async () => {
      setupApp(true, null);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/input`)
        .send({ input: 'ls' });

      expect(response.status).toBe(503);
    });

    it('should return 404 when no session exists', async () => {
      mockShellService.getSessionByProject.mockReturnValue(undefined);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/input`)
        .send({ input: 'ls' });

      expect(response.status).toBe(404);
    });

    it('should send input to shell', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(session);
      mockShellService.write.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/input`)
        .send({ input: 'ls -la' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockShellService.write).toHaveBeenCalledWith(session.id, 'ls -la');
    });

    it('should return 500 when write throws', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(session);
      mockShellService.write.mockImplementation(() => { throw new Error('Write failed'); });

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/input`)
        .send({ input: 'ls' });

      expect(response.status).toBe(500);
    });

    it('should validate input is required', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/input`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /shell/resize', () => {
    it('should return 403 when shell is disabled', async () => {
      setupApp(false);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/resize`)
        .send({ cols: 120, rows: 40 });

      expect(response.status).toBe(403);
    });

    it('should return 404 when no session exists', async () => {
      mockShellService.getSessionByProject.mockReturnValue(undefined);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/resize`)
        .send({ cols: 120, rows: 40 });

      expect(response.status).toBe(404);
    });

    it('should resize the terminal', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(session);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/resize`)
        .send({ cols: 120, rows: 40 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockShellService.resize).toHaveBeenCalledWith(session.id, 120, 40);
    });
  });

  describe('POST /shell/stop', () => {
    it('should return 403 when shell is disabled', async () => {
      setupApp(false);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/stop`);

      expect(response.status).toBe(403);
    });

    it('should return success when no session exists (idempotent)', async () => {
      mockShellService.getSessionByProject.mockReturnValue(undefined);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/stop`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should kill the session', async () => {
      const session = createMockSession(projectId);
      mockShellService.getSessionByProject.mockReturnValue(session);

      const response = await request(app)
        .post(`/api/projects/${projectId}/shell/stop`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockShellService.killSession).toHaveBeenCalledWith(session.id);
    });
  });
});
