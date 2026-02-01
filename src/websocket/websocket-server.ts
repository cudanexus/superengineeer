import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { AgentManager, AgentMessage, QueuedProject, AgentResourceStatus, ContextUsage, WaitingStatus, FullAgentStatus } from '../agents';
import { RoadmapGenerator, RoadmapMessage, AuthService, ShellService } from '../services';
import { RalphLoopService, RalphLoopStatus, IterationSummary, ReviewerFeedback, RalphLoopFinalStatus } from '../services/ralph-loop/types';
import { ConversationRepository, ProjectRepository } from '../repositories';
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

export interface RalphLoopStatusData {
  taskId: string;
  status: RalphLoopStatus;
  currentIteration?: number;
  maxTurns?: number;
}

export interface RalphLoopIterationData {
  taskId: string;
  iteration: number;
}

export interface RalphLoopOutputData {
  taskId: string;
  phase: 'worker' | 'reviewer';
  content: string;
  timestamp: string;
}

export interface RalphLoopToolUseData {
  taskId: string;
  phase: 'worker' | 'reviewer';
  tool_name: string;
  tool_id: string;
  parameters: Record<string, unknown>;
  timestamp: string;
}

export interface RalphLoopCompleteData {
  taskId: string;
  finalStatus: RalphLoopFinalStatus;
}

export interface RalphLoopWorkerCompleteData {
  taskId: string;
  summary: IterationSummary;
}

export interface RalphLoopReviewerCompleteData {
  taskId: string;
  feedback: ReviewerFeedback;
}

export interface RalphLoopErrorData {
  taskId: string;
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
  | RalphLoopStatusData
  | RalphLoopIterationData
  | RalphLoopOutputData
  | RalphLoopToolUseData
  | RalphLoopCompleteData
  | RalphLoopWorkerCompleteData
  | RalphLoopReviewerCompleteData
  | RalphLoopErrorData
  | string; // Covers 'connected' messages and simple loop events

export interface SessionRecoveryData {
  oldConversationId: string;
  newConversationId: string;
  reason: string;
}

export interface WebSocketMessage {
  type:
    | 'agent_message'
    | 'agent_status'
    | 'agent_waiting'
    | 'queue_change'
    | 'connected'
    | 'roadmap_message'
    | 'session_recovery'
    | 'shell_output'
    | 'shell_exit'
    | 'shell_error'
    | 'ralph_loop_status'
    | 'ralph_loop_iteration'
    | 'ralph_loop_output'
    | 'ralph_loop_worker_complete'
    | 'ralph_loop_reviewer_complete'
    | 'ralph_loop_complete'
    | 'ralph_loop_error'
    | 'ralph_loop_tool_use'
;
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
  ralphLoopService?: RalphLoopService;
  conversationRepository?: ConversationRepository;
  projectRepository?: ProjectRepository;
}

export class DefaultWebSocketServer implements ProjectWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly agentManager: AgentManager;
  private readonly roadmapGenerator?: RoadmapGenerator;
  private readonly authService?: AuthService;
  private readonly shellService?: ShellService;
  private readonly ralphLoopService?: RalphLoopService;
  private readonly conversationRepository?: ConversationRepository;
  private readonly projectRepository?: ProjectRepository;
  private readonly projectSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private readonly logger: Logger;

  constructor(deps: WebSocketServerDependencies) {
    this.agentManager = deps.agentManager;
    this.roadmapGenerator = deps.roadmapGenerator;
    this.authService = deps.authService;
    this.shellService = deps.shellService;
    this.ralphLoopService = deps.ralphLoopService;
    this.conversationRepository = deps.conversationRepository;
    this.projectRepository = deps.projectRepository;
    this.logger = getLogger('websocket');
    this.setupAgentListeners();
    this.setupRoadmapListeners();
    this.setupShellListeners();
    this.setupRalphLoopListeners();
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

  private setupRalphLoopListeners(): void {
    if (!this.ralphLoopService) {
      this.logger.debug('No Ralph Loop service provided, skipping listener setup');
      return;
    }

    this.logger.info('Setting up Ralph Loop service listeners');

    this.ralphLoopService.on('status_change', (projectId, taskId, status, currentIteration, maxTurns) => {
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_status',
        projectId,
        data: { taskId, status, currentIteration, maxTurns },
      });
    });

    this.ralphLoopService.on('iteration_start', (projectId, taskId, iteration) => {
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_iteration',
        projectId,
        data: { taskId, iteration },
      });

      // Save iteration start message
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_iteration', {
        taskId,
        iteration,
      });
    });

    this.ralphLoopService.on('worker_complete', (projectId, taskId, summary) => {
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_worker_complete',
        projectId,
        data: { taskId, summary },
      });

      // Save worker complete message
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_worker_complete', {
        taskId,
        summary,
      });
    });

    this.ralphLoopService.on('reviewer_complete', (projectId, taskId, feedback) => {
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_reviewer_complete',
        projectId,
        data: { taskId, feedback },
      });

      // Save reviewer complete message
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_reviewer_complete', {
        taskId,
        feedback,
      });
    });

    this.ralphLoopService.on('loop_complete', (projectId, taskId, finalStatus) => {
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_complete',
        projectId,
        data: { taskId, finalStatus },
      });

      // Save completion message
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_complete', {
        taskId,
        finalStatus,
      });
    });

    this.ralphLoopService.on('loop_error', (projectId, taskId, error) => {
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_error',
        projectId,
        data: { taskId, error },
      });

      // Save error message
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_error', {
        taskId,
        error,
      });
    });

    this.ralphLoopService.on('output', (projectId, taskId, source, content) => {
      const timestamp = new Date().toISOString();
      this.broadcastToProject(projectId, {
        type: 'ralph_loop_output',
        projectId,
        data: { taskId, phase: source, content, timestamp },
      });

      // Save Ralph Loop output to conversation
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_output', {
        taskId,
        phase: source,
        content,
        timestamp,
      });
    });

    this.ralphLoopService.on('tool_use', (projectId, taskId, source, toolInfo) => {
      this.logger.info('WebSocket broadcasting ralph_loop_tool_use', {
        projectId,
        taskId,
        phase: source,
        toolName: toolInfo.tool_name,
      });

      const data = {
        taskId,
        phase: source,
        tool_name: toolInfo.tool_name,
        tool_id: toolInfo.tool_id,
        parameters: toolInfo.parameters,
        timestamp: toolInfo.timestamp,
      };

      this.broadcastToProject(projectId, {
        type: 'ralph_loop_tool_use',
        projectId,
        data,
      });

      // Save tool use message to conversation
      void this.saveRalphLoopMessage(projectId, 'ralph_loop_tool_use', data);
    });
  }

  private async saveRalphLoopMessage(
    projectId: string,
    type: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.conversationRepository || !this.projectRepository) {
      return;
    }

    try {
      // Get the current conversation for the project
      const project = await this.projectRepository.findById(projectId);
      if (!project?.currentConversationId) {
        this.logger.debug('No current conversation for Ralph Loop message', { projectId, type });
        return;
      }

      // Convert Ralph Loop message to agent message format
      let content = '';
      let messageType: AgentMessage['type'] = 'system';

      switch (type) {
        case 'ralph_loop_output': {
          // Changed from 'stdout' to 'stdout' to match frontend expectation
          // Frontend converts this to 'assistant' type when displaying
          messageType = 'stdout';
          const outputData = data as unknown as RalphLoopOutputData;
          content = outputData.content;
          // Phase will be added to the message object below
          break;
        }

        case 'ralph_loop_iteration': {
          const iterationData = data as { iteration: number };
          content = `--- Ralph Loop Iteration ${iterationData.iteration} started ---`;
          break;
        }

        case 'ralph_loop_worker_complete': {
          const workerData = data as unknown as RalphLoopWorkerCompleteData;
          content = `Worker completed iteration ${workerData.summary.iterationNumber}`;
          if (workerData.summary.filesModified?.length) {
            content += `\nFiles modified: ${workerData.summary.filesModified.join(', ')}`;
          }
          break;
        }

        case 'ralph_loop_reviewer_complete': {
          const reviewerData = data as unknown as RalphLoopReviewerCompleteData;
          content = `Reviewer decision: ${reviewerData.feedback.decision}`;
          if (reviewerData.feedback.feedback) {
            content += `\nFeedback: ${reviewerData.feedback.feedback}`;
          }
          break;
        }

        case 'ralph_loop_complete': {
          const completeData = data as unknown as RalphLoopCompleteData;
          content = `Ralph Loop completed: ${completeData.finalStatus}`;
          break;
        }

        case 'ralph_loop_error': {
          const errorData = data as { error: string };
          content = `Ralph Loop error: ${errorData.error}`;
          break;
        }

        case 'ralph_loop_tool_use': {
          // Tool use messages are handled differently - they have tool info
          const toolData = data as unknown as RalphLoopToolUseData;
          const toolMessage: AgentMessage = {
            type: 'tool_use',
            content: `${toolData.tool_name}`,
            timestamp: toolData.timestamp || new Date().toISOString(),
            toolInfo: {
              name: toolData.tool_name,
              id: toolData.tool_id,
              input: toolData.parameters,
            },
            ralphLoopPhase: toolData.phase,
          };
          await this.conversationRepository.addMessage(
            projectId,
            project.currentConversationId,
            toolMessage
          );
          return;
        }

        default:
          return;
      }

      const message: AgentMessage = {
        type: messageType,
        content,
        timestamp: (data.timestamp as string) || new Date().toISOString(),
      };

      // Add ralphLoopPhase for ralph_loop_output messages
      if (type === 'ralph_loop_output') {
        const outputData = data as unknown as RalphLoopOutputData;
        message.ralphLoopPhase = outputData.phase;
      }

      await this.conversationRepository.addMessage(
        projectId,
        project.currentConversationId,
        message
      );
    } catch (error) {
      this.logger.error('Failed to save Ralph Loop message', {
        projectId,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  projectId: string;
}
