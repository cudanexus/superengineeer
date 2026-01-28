import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { AgentManager, AgentMessage, QueuedProject, AgentResourceStatus, ContextUsage, WaitingStatus, FullAgentStatus } from '../agents';
import { RoadmapGenerator, RoadmapMessage, AuthService, ShellService } from '../services';
import { getLogger, Logger } from '../utils/logger';
import { parseCookie, COOKIE_NAME } from '../middleware/auth-middleware';

export interface ShellOutputData {
  sessionId: string;
  data: string;
}

export interface ShellExitData {
  sessionId: string;
  code: number | null;
}

export interface ShellErrorData {
  sessionId: string;
  error: string;
}

export interface AgentMessageWithContext extends AgentMessage {
  contextUsage?: ContextUsage;
}

// WebSocketMessageData is a union of possible data types
export type WebSocketMessageData =
  | AgentMessage
  | AgentMessageWithContext
  | QueuedProject[]
  | AgentResourceStatus
  | RoadmapMessage
  | WaitingStatus
  | FullAgentStatus
  | ShellOutputData
  | ShellExitData
  | ShellErrorData
  | string; // Covers 'connected' messages

export interface SessionRecoveryData {
  oldConversationId: string;
  newConversationId: string;
  reason: string;
}

export interface WebSocketMessage {
  type: 'agent_message' | 'agent_status' | 'agent_waiting' | 'queue_change' | 'connected' | 'roadmap_message' | 'session_recovery' | 'shell_output' | 'shell_exit' | 'shell_error';
  projectId?: string;
  data?: WebSocketMessageData | SessionRecoveryData;
}

export interface ProjectWebSocketServer {
  initialize(httpServer: Server): void;
  broadcast(message: WebSocketMessage): void;
  broadcastToProject(projectId: string, message: WebSocketMessage): void;
  close(): void;
}

export interface WebSocketServerDependencies {
  agentManager: AgentManager;
  roadmapGenerator?: RoadmapGenerator;
  authService?: AuthService;
  shellService?: ShellService;
}

export class DefaultWebSocketServer implements ProjectWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly agentManager: AgentManager;
  private readonly roadmapGenerator?: RoadmapGenerator;
  private readonly authService?: AuthService;
  private readonly shellService?: ShellService;
  private readonly projectSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private readonly logger: Logger;

  constructor(deps: WebSocketServerDependencies) {
    this.agentManager = deps.agentManager;
    this.roadmapGenerator = deps.roadmapGenerator;
    this.authService = deps.authService;
    this.shellService = deps.shellService;
    this.logger = getLogger('websocket');
    this.setupAgentListeners();
    this.setupRoadmapListeners();
    this.setupShellListeners();
  }

  initialize(httpServer: Server): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      verifyClient: (info, callback): void => this.verifyClient(info, callback),
    });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  private verifyClient(
    info: { origin: string; secure: boolean; req: IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    // Skip auth validation if no auth service is configured
    if (!this.authService) {
      callback(true);
      return;
    }

    const sessionId = parseCookie(info.req.headers.cookie, COOKIE_NAME);

    if (!sessionId || !this.authService.validateSession(sessionId)) {
      this.logger.debug('WebSocket connection rejected: invalid session');
      callback(false, 401, 'Unauthorized');
      return;
    }

    callback(true);
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

  close(): void {
    if (!this.wss) {
      return;
    }

    this.logger.debug('Closing WebSocket server');

    // Close all client connections
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Server shutting down');
      }
    });

    // Close the WebSocket server
    this.wss.close();
    this.wss = null;
    this.projectSubscriptions.clear();
  }

  private handleConnection(ws: WebSocket): void {
    this.sendMessage(ws, { type: 'connected', data: 'Connected to Claudito WebSocket' });

    ws.on('message', (data) => this.handleMessage(ws, String(data)));
    ws.on('close', () => this.handleDisconnect(ws));
  }

  private handleMessage(ws: WebSocket, rawData: string): void {
    try {
      const message = JSON.parse(rawData) as ClientMessage;
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

    // Send current agent status immediately on subscribe
    const fullStatus = this.agentManager.getFullStatus(projectId);
    this.sendMessage(ws, {
      type: 'agent_status',
      projectId,
      data: fullStatus,
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

    this.agentManager.on('status', (projectId, _status) => {
      // Send full status instead of just the status string
      const fullStatus = this.agentManager.getFullStatus(projectId);
      this.broadcast({
        type: 'agent_status',
        projectId,
        data: fullStatus,
      });
    });

    this.agentManager.on('waitingForInput', (projectId, isWaiting, version) => {
      this.broadcast({
        type: 'agent_waiting',
        projectId,
        data: { isWaiting, version },
      });
    });

    this.agentManager.on('queueChange', (_queue) => {
      this.broadcast({
        type: 'queue_change',
        data: this.agentManager.getResourceStatus(),
      });
    });

    this.agentManager.on('sessionRecovery', (projectId, oldConversationId, newConversationId, reason) => {
      this.broadcastToProject(projectId, {
        type: 'session_recovery',
        projectId,
        data: {
          oldConversationId,
          newConversationId,
          reason,
        },
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

  private setupShellListeners(): void {
    if (!this.shellService) {
      this.logger.debug('No shell service provided, skipping listener setup');
      return;
    }

    this.logger.info('Setting up shell service listeners');

    this.shellService.on('data', (sessionId, data) => {
      // Extract projectId from sessionId (format: shell-{projectId}-{timestamp}-{counter})
      const parts = sessionId.split('-');

      if (parts.length >= 3) {
        const projectId = parts.slice(1, -2).join('-');
        this.broadcastToProject(projectId, {
          type: 'shell_output',
          projectId,
          data: { sessionId, data },
        });
      }
    });

    this.shellService.on('exit', (sessionId, code) => {
      const parts = sessionId.split('-');

      if (parts.length >= 3) {
        const projectId = parts.slice(1, -2).join('-');
        this.broadcastToProject(projectId, {
          type: 'shell_exit',
          projectId,
          data: { sessionId, code },
        });
      }
    });

    this.shellService.on('error', (sessionId, error) => {
      const parts = sessionId.split('-');

      if (parts.length >= 3) {
        const projectId = parts.slice(1, -2).join('-');
        this.broadcastToProject(projectId, {
          type: 'shell_error',
          projectId,
          data: { sessionId, error },
        });
      }
    });
  }
}

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  projectId: string;
}
