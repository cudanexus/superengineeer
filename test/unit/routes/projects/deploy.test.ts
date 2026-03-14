import express, { Express } from 'express';
import request from 'supertest';
import {
  createProjectsRouter,
  ProjectRouterDependencies,
} from '../../../../src/routes/projects';
import { FlyDeployService, FlyDeploymentRecord } from '../../../../src/services/fly-deploy-service';
import { createErrorHandler } from '../../../../src/utils';

jest.mock('../../../../src/middleware/rate-limit', () => ({
  roadmapGenerationRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  agentOperationRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  moderateRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  strictRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const sampleProject = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Project',
  path: '/path/to/project',
  status: 'stopped',
  currentConversationId: null,
  nextItem: null,
  currentItem: null,
  lastContextUsage: null,
  permissionOverrides: null,
  modelOverride: null,
  mcpOverrides: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function createMockFlyDeployService(): jest.Mocked<FlyDeployService> {
  return {
    deploy: jest.fn(),
    getDeploymentByProject: jest.fn(),
    stopAllDeployments: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
}

function createMockDeps(flyDeployService: FlyDeployService | null): ProjectRouterDependencies {
  return {
    projectRepository: {
      findById: jest.fn().mockResolvedValue(sampleProject),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsByPath: jest.fn(),
    } as unknown as ProjectRouterDependencies['projectRepository'],
    projectService: {} as ProjectRouterDependencies['projectService'],
    roadmapParser: {} as ProjectRouterDependencies['roadmapParser'],
    roadmapGenerator: {} as ProjectRouterDependencies['roadmapGenerator'],
    roadmapEditor: {} as ProjectRouterDependencies['roadmapEditor'],
    agentManager: {} as ProjectRouterDependencies['agentManager'],
    instructionGenerator: {} as ProjectRouterDependencies['instructionGenerator'],
    conversationRepository: {} as ProjectRouterDependencies['conversationRepository'],
    settingsRepository: {} as ProjectRouterDependencies['settingsRepository'],
    gitService: {} as ProjectRouterDependencies['gitService'],
    flyDeployService,
  };
}

function createDeploymentRecord(status: FlyDeploymentRecord['status']): FlyDeploymentRecord {
  return {
    deploymentId: 'deploy-123',
    projectId: sampleProject.id,
    projectPath: sampleProject.path,
    appName: 'test-app-1234',
    status,
    stage: status === 'completed' ? null : 'deploying',
    startedAt: '2026-03-15T10:00:00.000Z',
    completedAt: status === 'completed' ? '2026-03-15T10:01:00.000Z' : undefined,
    message: status === 'completed' ? 'Deployment finished' : 'Deploying',
  };
}

describe('Deploy Routes', () => {
  let app: Express;
  let mockFlyDeployService: jest.Mocked<FlyDeployService>;

  function setupApp(flyDeployService?: FlyDeployService | null): void {
    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectsRouter(createMockDeps(
      flyDeployService !== undefined ? flyDeployService : mockFlyDeployService
    )));
    app.use(createErrorHandler());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlyDeployService = createMockFlyDeployService();
    setupApp(mockFlyDeployService);
  });

  it('returns idle status when no deployment exists', async () => {
    mockFlyDeployService.getDeploymentByProject.mockReturnValue(undefined);

    const response = await request(app)
      .get(`/api/projects/${sampleProject.id}/deploy/status`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('idle');
    expect(response.body.isActive).toBe(false);
  });

  it('starts a deployment and returns metadata', async () => {
    const record = createDeploymentRecord('deploying');
    mockFlyDeployService.deploy.mockResolvedValue(record);

    const response = await request(app)
      .post(`/api/projects/${sampleProject.id}/deploy/start`);

    expect(response.status).toBe(200);
    expect(response.body.appName).toBe(record.appName);
    expect(response.body.status).toBe('deploying');
    expect(mockFlyDeployService.deploy).toHaveBeenCalledWith(sampleProject.id, sampleProject.path, sampleProject.name);
  });

  it('returns 409 when a deployment is already running', async () => {
    mockFlyDeployService.deploy.mockRejectedValue(new Error(`Deployment already running for project ${sampleProject.id}`));

    const response = await request(app)
      .post(`/api/projects/${sampleProject.id}/deploy/start`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already running/);
  });
});
