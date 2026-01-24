import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { AgentManager, AgentMessage, AgentStatus, QueuedProject, AgentResourceStatus, ContextUsage } from '../agents';
import { RoadmapGenerator, RoadmapMessage } from '../services';
import { getLogger, Logger } from '../utils/logger';

export interface AgentMessageWithContext extends AgentMessage {
  contextUsage?: ContextUsage;
}

export interface WebSocketMessage {
  type: 'agent_message' | 'agent_status' | 'queue_change' | 'connected' | 'roadmap_message';
  projectId?: string;
  data?: AgentMessage | AgentMessageWithContext | AgentStatus | QueuedProject[] | AgentResourceStatus | string | RoadmapMessage;
}

export interface ProjectWebSocketServer {
  initialize(httpServer: Server): void;
  broadcast(message: WebSocketMessage): void;
  broadcastToProject(projectId: string, message: WebSocketMessage): void;
}

export interface WebSocketServerDependencies {
  agentManager: AgentManager;
  roadmapGenerator?: RoadmapGenerator;
}

export class DefaultWebSocketServer implements ProjectWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly agentManager: AgentManager;
  private readonly roadmapGenerator?: RoadmapGenerator;
  private readonly projectSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private readonly logger: Logger;

  constructor(deps: WebSocketServerDependencies) {
    this.agentManager = deps.agentManager;
    this.roadmapGenerator = deps.roadmapGenerator;
    this.logger = getLogger('websocket');
    this.setupAgentListeners();
    this.setupRoadmapListeners();
  }

  initialize(httpServer: Server): void {
    this.wss = new WebSocketServer({ server: httpServer });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  broadcast(message: WebSocketMessage): void {
    if (!this.wss) {
      return;
    }

    const data = JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  broadcastToProject(projectId: string, message: WebSocketMessage): void {
    const subscribers = this.projectSubscriptions.get(projectId);

    if (!subscribers) {
      return;
    }

    const data = JSON.stringify(message);

    subscribers.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.sendMessage(ws, { type: 'connected', data: 'Connected to Claudito WebSocket' });

    ws.on('message', (data) => this.handleMessage(ws, data.toString()));
    ws.on('close', () => this.handleDisconnect(ws));
  }

  private handleMessage(ws: WebSocket, rawData: string): void {
    try {
      const message = JSON.parse(rawData);
      this.processClientMessage(ws, message);
    } catch {
      // Invalid JSON, ignore
    }
  }

  private processClientMessage(ws: WebSocket, message: ClientMessage): void {
    switch (message.type) {
      case 'subscribe':
        this.subscribeToProject(ws, message.projectId);
        break;
      case 'unsubscribe':
        this.unsubscribeFromProject(ws, message.projectId);
        break;
    }
  }

  private subscribeToProject(ws: WebSocket, projectId: string): void {
    if (!this.projectSubscriptions.has(projectId)) {
      this.projectSubscriptions.set(projectId, new Set());
    }
    this.projectSubscriptions.get(projectId)!.add(ws);
    this.logger.withProject(projectId).debug('Client subscribed', {
      subscribers: this.projectSubscriptions.get(projectId)!.size,
    });
  }

  private unsubscribeFromProject(ws: WebSocket, projectId: string): void {
    const subscribers = this.projectSubscriptions.get(projectId);

    if (subscribers) {
      subscribers.delete(ws);
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    this.projectSubscriptions.forEach((subscribers) => {
      subscribers.delete(ws);
    });
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private setupAgentListeners(): void {
    this.agentManager.on('message', (projectId, message) => {
      // Include context usage in the message for real-time tracking
      const contextUsage = this.agentManager.getContextUsage(projectId);
      const messageWithContext: AgentMessageWithContext = {
        ...message,
        contextUsage: contextUsage || undefined,
      };

      this.broadcastToProject(projectId, {
        type: 'agent_message',
        projectId,
        data: messageWithContext,
      });
    });

    this.agentManager.on('status', (projectId, status) => {
      this.broadcast({
        type: 'agent_status',
        projectId,
        data: status,
      });
    });

    this.agentManager.on('queueChange', (queue) => {
      this.broadcast({
        type: 'queue_change',
        data: this.agentManager.getResourceStatus(),
      });
    });
  }

  private setupRoadmapListeners(): void {
    if (!this.roadmapGenerator) {
      this.logger.debug('No roadmap generator provided, skipping listener setup');
      return;
    }

    this.logger.info('Setting up roadmap generator listeners');

    this.roadmapGenerator.on('message', (projectId, message) => {
      this.logger.withProject(projectId).debug('Broadcasting roadmap_message', { type: message.type });
      this.broadcastToProject(projectId, {
        type: 'roadmap_message',
        projectId,
        data: message,
      });
    });
  }
}

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  projectId: string;
}
