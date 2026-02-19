import request from 'supertest';
import express, { Application } from 'express';
import { createApiRouter, setWebSocketServer } from '../../../src/routes';
import { ProjectWebSocketServer, ConnectedClient } from '../../../src/websocket/websocket-server';

describe('GET /api/debug/clients', () => {
  let app: Application;
  let mockWebSocketServer: jest.Mocked<ProjectWebSocketServer>;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create mock WebSocket server
    mockWebSocketServer = {
      initialize: jest.fn(),
      broadcast: jest.fn(),
      broadcastToProject: jest.fn(),
      close: jest.fn(),
      getConnectedClients: jest.fn(),
      getAllConnectedClients: jest.fn(),
    };

    // Set the mock WebSocket server
    setWebSocketServer(mockWebSocketServer);

    // Create router with test dependencies
    const router = createApiRouter({
      agentManager: undefined,
      maxConcurrentAgents: 3,
      devMode: false,
    });

    app.use('/api', router);
  });

  afterEach(() => {
    // Clean up
    setWebSocketServer(null as any);
  });

  it('should return all connected clients', async () => {
    const mockClients: ConnectedClient[] = [
      {
        clientId: 'client-1',
        projectId: 'project-a',
        userAgent: 'Mozilla/5.0 Test',
        connectedAt: new Date().toISOString(),
        lastResourceUpdate: new Date().toISOString(),
        resourceStats: {
          total: 10,
          loaded: 8,
          failed: 2,
          pending: 0,
          resources: [],
          runtime: 5000,
          clientInfo: {} as any,
        },
      },
      {
        clientId: 'client-2',
        projectId: 'project-b',
        userAgent: 'Chrome/120.0',
        connectedAt: new Date().toISOString(),
      },
    ];

    mockWebSocketServer.getConnectedClients.mockReturnValue(mockClients);

    const response = await request(app)
      .get('/api/debug/clients')
      .expect(200);

    expect(response.body).toEqual(mockClients);
    expect(mockWebSocketServer.getConnectedClients).toHaveBeenCalledWith();
  });

  it('should filter by projectId query parameter', async () => {
    const mockClients: ConnectedClient[] = [
      {
        clientId: 'client-1',
        projectId: 'project-a',
        userAgent: 'Mozilla/5.0 Test',
        connectedAt: new Date().toISOString(),
      },
    ];

    mockWebSocketServer.getConnectedClients.mockReturnValue(mockClients);

    const response = await request(app)
      .get('/api/debug/clients?projectId=project-a')
      .expect(200);

    expect(response.body).toEqual(mockClients);
    expect(mockWebSocketServer.getConnectedClients).toHaveBeenCalledWith('project-a');
  });

  it('should return empty array when no websocket server', async () => {
    // Remove the WebSocket server
    setWebSocketServer(null as any);

    const response = await request(app)
      .get('/api/debug/clients')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should return empty array when no clients connected', async () => {
    mockWebSocketServer.getConnectedClients.mockReturnValue([]);

    const response = await request(app)
      .get('/api/debug/clients')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should validate client data structure', async () => {
    const mockClients: ConnectedClient[] = [
      {
        clientId: 'test-client',
        projectId: 'test-project',
        userAgent: 'Test Browser/1.0',
        connectedAt: '2024-01-01T00:00:00.000Z',
        lastResourceUpdate: '2024-01-01T00:01:00.000Z',
        resourceStats: {
          total: 5,
          loaded: 4,
          failed: 1,
          pending: 0,
          resources: [],
          runtime: 3000,
          clientInfo: {
            userAgent: 'Test Browser/1.0',
            platform: 'Test',
            language: 'en',
            screenResolution: '1920x1080',
            viewport: '1920x1080',
            cookiesEnabled: true,
            online: true,
            clientId: 'test-client',
          },
        },
      },
    ];

    mockWebSocketServer.getConnectedClients.mockReturnValue(mockClients);

    const response = await request(app)
      .get('/api/debug/clients')
      .expect(200);

    // Verify the structure
    expect(response.body).toHaveLength(1);
    const client = response.body[0];

    expect(client).toHaveProperty('clientId', 'test-client');
    expect(client).toHaveProperty('projectId', 'test-project');
    expect(client).toHaveProperty('userAgent', 'Test Browser/1.0');
    expect(client).toHaveProperty('connectedAt');
    expect(client).toHaveProperty('lastResourceUpdate');
    expect(client).toHaveProperty('resourceStats');

    expect(client.resourceStats).toHaveProperty('total', 5);
    expect(client.resourceStats).toHaveProperty('loaded', 4);
    expect(client.resourceStats).toHaveProperty('failed', 1);
    expect(client.resourceStats).toHaveProperty('pending', 0);
  });
});