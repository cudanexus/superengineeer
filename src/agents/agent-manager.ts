import fs from 'fs';
import path from 'path';
import {
  ClaudeAgent,
  DefaultClaudeAgent,
  AgentMessage,
  AgentStatus,
  AgentMode,
  ProcessInfo,
  ContextUsage,
  PermissionConfig,
  AgentLimits,
  AgentStreamingOptions,
} from './claude-agent';
import { DefaultPermissionGenerator, PermissionGenerator } from '../services/permission-generator';
import {
  ProjectRepository,
  MilestoneItemRef,
  ConversationRepository,
  SettingsRepository,
} from '../repositories';
import {
  InstructionGenerator,
  RoadmapParser,
  ParsedRoadmap,
  MilestoneWithContext,
} from '../services';
import { getLogger, Logger, getPidTracker, PidTracker, isValidUUID } from '../utils';

export interface AgentManagerEvents {
  message: (projectId: string, message: AgentMessage) => void;
  status: (projectId: string, status: AgentStatus) => void;
  waitingForInput: (projectId: string, isWaiting: boolean, version: number) => void;
  queueChange: (queue: QueuedProject[]) => void;
  milestoneStarted: (projectId: string, milestone: MilestoneRef) => void;
  milestoneCompleted: (projectId: string, milestone: MilestoneRef, reason: string) => void;
  milestoneFailed: (projectId: string, milestone: MilestoneRef | null, reason: string) => void;
  loopCompleted: (projectId: string) => void;
  sessionRecovery: (projectId: string, oldConversationId: string, newConversationId: string, reason: string) => void;
}

export interface QueuedProject {
  projectId: string;
  instructions: string;
  queuedAt: string;
}

export interface AgentResourceStatus {
  runningCount: number;
  maxConcurrent: number;
  queuedCount: number;
  queuedProjects: QueuedProject[];
}

export interface AgentLoopState {
  isLooping: boolean;
  currentMilestone: MilestoneRef | null;
  currentConversationId: string | null;
}

export interface MilestoneRef {
  phaseId: string;
  phaseTitle: string;
  milestoneId: string;
  milestoneTitle: string;
  pendingTasks: string[];
}

export interface AgentCompletionResponse {
  status: 'COMPLETE' | 'FAILED';
  reason: string;
}

export interface TrackedProcessInfo {
  pid: number;
  projectId: string;
  startedAt: string;
}

export interface OrphanCleanupResult {
  foundCount: number;
  killedCount: number;
  killedPids: number[];
  failedPids: number[];
  skippedPids: number[];
}

export interface ImageData {
  type: string; // MIME type, e.g., 'image/png'
  data: string; // Base64 encoded image data
}

export interface StartInteractiveAgentOptions {
  initialMessage?: string;
  images?: ImageData[];
  sessionId?: string;
  permissionMode?: 'acceptEdits' | 'plan';
  /** If true, use --session-id to create new session. If false/undefined, use --resume for existing sessions. */
  isNewSession?: boolean;
}

export interface FullAgentStatus {
  status: AgentStatus;
  mode: AgentMode | null;
  queued: boolean;
  queuedMessageCount: number;
  isWaitingForInput: boolean;
  waitingVersion: number;
  sessionId: string | null;
  permissionMode: 'acceptEdits' | 'plan' | null;
}

export interface AgentManager {
  startAgent(projectId: string, instructions: string): Promise<void>;
  startInteractiveAgent(projectId: string, options?: StartInteractiveAgentOptions): Promise<void>;
  sendInput(projectId: string, input: string, images?: ImageData[]): void;
  stopAgent(projectId: string): Promise<void>;
  stopAllAgents(): Promise<void>;
  getAgentStatus(projectId: string): AgentStatus;
  getAgentMode(projectId: string): AgentMode | null;
  isRunning(projectId: string): boolean;
  isQueued(projectId: string): boolean;
  isWaitingForInput(projectId: string): boolean;
  getWaitingVersion(projectId: string): number;
  getResourceStatus(): AgentResourceStatus;
  removeFromQueue(projectId: string): void;
  setMaxConcurrentAgents(max: number): void;
  startAutonomousLoop(projectId: string): Promise<void>;
  stopAutonomousLoop(projectId: string): void;
  getLoopState(projectId: string): AgentLoopState | null;
  getLastCommand(projectId: string): string | null;
  getProcessInfo(projectId: string): ProcessInfo | null;
  getContextUsage(projectId: string): ContextUsage | null;
  getQueuedMessageCount(projectId: string): number;
  getQueuedMessages(projectId: string): string[];
  removeQueuedMessage(projectId: string, index: number): boolean;
  getSessionId(projectId: string): string | null;
  getFullStatus(projectId: string): FullAgentStatus;
  getTrackedProcesses(): TrackedProcessInfo[];
  cleanupOrphanProcesses(): Promise<OrphanCleanupResult>;
  restartAllRunningAgents(): Promise<void>;
  getRunningProjectIds(): string[];
  on<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void;
  off<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void;
}

export interface AgentFactoryOptions {
  projectId: string;
  projectPath: string;
  mode: AgentMode;
  permissions?: PermissionConfig;
  limits?: AgentLimits;
  streaming?: AgentStreamingOptions;
  sessionId?: string;
  isNewSession?: boolean;
}

export interface AgentFactory {
  create(options: AgentFactoryOptions): ClaudeAgent;
}

const defaultAgentFactory: AgentFactory = {
  create: (options) => new DefaultClaudeAgent(options),
};

export interface AgentManagerDependencies {
  projectRepository: ProjectRepository;
  conversationRepository: ConversationRepository;
  settingsRepository: SettingsRepository;
  instructionGenerator: InstructionGenerator;
  roadmapParser: RoadmapParser;
  agentFactory?: AgentFactory;
  permissionGenerator?: PermissionGenerator;
  maxConcurrentAgents?: number;
}

type EventListeners = {
  [K in keyof AgentManagerEvents]: Set<AgentManagerEvents[K]>;
};

interface LoopStateInternal {
  isLooping: boolean;
  shouldContinue: boolean;
  currentMilestone: MilestoneRef | null;
  currentConversationId: string | null;
}

export class DefaultAgentManager implements AgentManager {
  private readonly agents: Map<string, ClaudeAgent> = new Map();
  private readonly queue: QueuedProject[] = [];
  private readonly loopStates: Map<string, LoopStateInternal> = new Map();
  private readonly projectRepository: ProjectRepository;
  private readonly conversationRepository: ConversationRepository;
  private readonly settingsRepository: SettingsRepository;
  private readonly instructionGenerator: InstructionGenerator;
  private readonly roadmapParser: RoadmapParser;
  private readonly agentFactory: AgentFactory;
  private readonly permissionGenerator: PermissionGenerator;
  private _maxConcurrentAgents: number;
  private readonly logger: Logger;
  private readonly pidTracker: PidTracker;
  private readonly pendingMessageSaves: Set<Promise<unknown>> = new Set();
  private readonly listeners: EventListeners = {
    message: new Set(),
    status: new Set(),
    waitingForInput: new Set(),
    queueChange: new Set(),
    milestoneStarted: new Set(),
    milestoneCompleted: new Set(),
    milestoneFailed: new Set(),
    loopCompleted: new Set(),
    sessionRecovery: new Set(),
  };

  constructor(deps: AgentManagerDependencies) {
    this.projectRepository = deps.projectRepository;
    this.conversationRepository = deps.conversationRepository;
    this.settingsRepository = deps.settingsRepository;
    this.instructionGenerator = deps.instructionGenerator;
    this.roadmapParser = deps.roadmapParser;
    this.agentFactory = deps.agentFactory || defaultAgentFactory;
    this.permissionGenerator = deps.permissionGenerator || new DefaultPermissionGenerator();
    this._maxConcurrentAgents = deps.maxConcurrentAgents ?? 3;
    this.logger = getLogger('agent-manager');
    this.pidTracker = getPidTracker();
  }

  setMaxConcurrentAgents(max: number): void {
    this._maxConcurrentAgents = Math.max(1, max);
    void this.processQueue();
  }

  private get maxConcurrentAgents(): number {
    return this._maxConcurrentAgents;
  }

  async startAgent(projectId: string, instructions: string): Promise<void> {
    if (this.agents.has(projectId)) {
      throw new Error('Agent is already running for this project');
    }

    if (this.isQueued(projectId)) {
      throw new Error('Agent is already queued for this project');
    }

    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    if (this.agents.size >= this.maxConcurrentAgents) {
      await this.addToQueue(projectId, instructions);
      return;
    }

    await this.startAgentImmediately(projectId, project.path, instructions);
  }

  async startInteractiveAgent(projectId: string, options?: StartInteractiveAgentOptions): Promise<void> {
    if (this.agents.has(projectId)) {
      throw new Error('Agent is already running for this project');
    }

    if (this.isQueued(projectId)) {
      throw new Error('Agent is already queued for this project');
    }

    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    const { initialMessage, images, sessionId, permissionMode, isNewSession: forceNewSession } = options || {};

    this.logger.withProject(projectId).info('Starting interactive agent', {
      hasMessage: !!initialMessage,
      imageCount: images?.length || 0,
      resumingSession: !!sessionId && !forceNewSession,
      permissionMode,
      forceNewSession,
    });

    // Determine the session ID to use and whether it's a new session
    let effectiveSessionId = sessionId;
    let isNewSession = forceNewSession ?? false;
    let oldConversationId: string | null = null;

    // Create a new conversation if none exists (for storing messages and sessionId)
    if (!project.currentConversationId) {
      const conversation = await this.conversationRepository.create(projectId, null);
      await this.projectRepository.setCurrentConversation(projectId, conversation.id);
      // Use the new conversation's UUID as the session ID for Claude
      effectiveSessionId = conversation.id;
      isNewSession = true; // New conversation = new session

      this.logger.withProject(projectId).debug('Created new conversation for interactive session', {
        conversationId: conversation.id,
        sessionId: effectiveSessionId,
        isNewSession,
      });
    } else if (!sessionId) {
      // If we have an existing conversation but no session ID provided, use the conversation ID to resume
      const candidateSessionId = project.currentConversationId;

      // Validate that the session ID is a valid UUID (old conversations may have non-UUID IDs)
      if (!isValidUUID(candidateSessionId)) {
        this.logger.withProject(projectId).warn('Existing conversation has invalid session ID, creating new conversation', {
          invalidSessionId: candidateSessionId,
        });

        // Store old conversation ID for the recovery event
        oldConversationId = candidateSessionId;

        // Delete the old conversation with invalid session ID
        await this.conversationRepository.deleteConversation(projectId, candidateSessionId);

        // Create a new conversation with a valid UUID
        const conversation = await this.conversationRepository.create(projectId, null);
        await this.projectRepository.setCurrentConversation(projectId, conversation.id);
        effectiveSessionId = conversation.id;
        isNewSession = true;

        // Emit session recovery event to notify frontend
        const reason = 'This conversation is from an older application version and cannot be resumed. Started a new conversation.';
        this.emit('sessionRecovery', projectId, oldConversationId, conversation.id, reason);
      } else {
        effectiveSessionId = candidateSessionId;
        isNewSession = false; // Existing conversation = resume session

        this.logger.withProject(projectId).debug('Using existing conversation ID as session ID', {
          conversationId: project.currentConversationId,
          isNewSession,
        });
      }
    } else {
      // Session ID was provided - validate it before attempting to resume
      if (!isValidUUID(sessionId)) {
        this.logger.withProject(projectId).warn('Provided session ID is not a valid UUID, creating new conversation', {
          invalidSessionId: sessionId,
        });

        // Store old session ID for the recovery event
        oldConversationId = sessionId;

        // Delete the old conversation if it exists
        await this.conversationRepository.deleteConversation(projectId, sessionId);

        // Create a new conversation with a valid UUID
        const conversation = await this.conversationRepository.create(projectId, null);
        await this.projectRepository.setCurrentConversation(projectId, conversation.id);
        effectiveSessionId = conversation.id;
        isNewSession = true;

        // Emit session recovery event to notify frontend
        const reason = 'This conversation is from an older application version and cannot be resumed. Started a new conversation.';
        this.emit('sessionRecovery', projectId, oldConversationId, conversation.id, reason);
      } else if (!forceNewSession) {
        // Valid UUID and not forcing new session - it's a resume operation
        isNewSession = false;
      }
      // If forceNewSession is true, keep isNewSession as true (set earlier)
    }

    // Build multimodal instructions if images are provided
    const instructions = this.buildMultimodalContent(initialMessage || '', images);
    await this.startAgentImmediately(projectId, project.path, instructions, 'interactive', effectiveSessionId, permissionMode, isNewSession);
  }

  sendInput(projectId: string, input: string, images?: ImageData[]): void {
    const agent = this.agents.get(projectId);

    if (!agent) {
      throw new Error('No agent running for this project');
    }

    if (agent.mode !== 'interactive') {
      throw new Error('Agent is not in interactive mode');
    }

    // Store user message in conversation (type 'user' for proper display)
    const message: AgentMessage = {
      type: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    // Save to conversation history (but don't emit - frontend already shows it)
    const savePromise = this.projectRepository.findById(projectId).then((project) => {
      if (project?.currentConversationId) {
        return this.conversationRepository
          .addMessage(projectId, project.currentConversationId, message)
          .catch((err) => {
            this.logger.error('Failed to save user message to conversation', {
              projectId,
              conversationId: project.currentConversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      } else {
        this.logger.warn('No currentConversationId for project, user message not saved', {
          projectId,
        });
      }
      return Promise.resolve();
    });
    void this.trackMessageSave(savePromise);

    // Build multimodal content if images are provided
    const content = this.buildMultimodalContent(input, images);
    agent.sendInput(content);
  }

  private buildMultimodalContent(text: string, images?: ImageData[]): string {
    // If no images, return plain text
    if (!images || images.length === 0) {
      return text;
    }

    // Build multimodal content array for Claude
    // Claude Code CLI accepts messages with content as an array of content blocks
    const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

    // Add images first
    for (const img of images) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.type,
          data: img.data,
        },
      });
    }

    // Add text if present
    if (text) {
      contentBlocks.push({
        type: 'text',
        text: text,
      });
    }

    // Return as JSON string that will be parsed by the agent
    // The agent's stdin expects a specific format - we need to encode this specially
    return JSON.stringify(contentBlocks);
  }

  getAgentMode(projectId: string): AgentMode | null {
    const agent = this.agents.get(projectId);
    return agent?.mode || null;
  }

  async startAutonomousLoop(projectId: string): Promise<void> {
    const projectLogger = this.logger.withProject(projectId);

    if (this.loopStates.has(projectId)) {
      throw new Error('Autonomous loop is already running for this project');
    }

    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    const roadmap = await this.loadRoadmap(project.path);

    if (!roadmap) {
      throw new Error('Roadmap not found. A ROADMAP.md file is required to start the autonomous loop.');
    }

    projectLogger.info('Starting autonomous loop');

    this.loopStates.set(projectId, {
      isLooping: true,
      shouldContinue: true,
      currentMilestone: null,
      currentConversationId: null,
    });

    await this.runNextMilestone(projectId);
  }

  stopAutonomousLoop(projectId: string): void {
    const loopState = this.loopStates.get(projectId);

    if (loopState) {
      loopState.shouldContinue = false;
      this.logger.withProject(projectId).info('Stopping autonomous loop');
    }
  }

  getLoopState(projectId: string): AgentLoopState | null {
    const state = this.loopStates.get(projectId);

    if (!state) {
      return null;
    }

    return {
      isLooping: state.isLooping,
      currentMilestone: state.currentMilestone,
      currentConversationId: state.currentConversationId,
    };
  }

  getLastCommand(projectId: string): string | null {
    const agent = this.agents.get(projectId);
    return agent?.lastCommand || null;
  }

  getProcessInfo(projectId: string): ProcessInfo | null {
    const agent = this.agents.get(projectId);
    return agent?.processInfo || null;
  }

  getContextUsage(projectId: string): ContextUsage | null {
    const agent = this.agents.get(projectId);
    return agent?.contextUsage || null;
  }

  getQueuedMessageCount(projectId: string): number {
    const agent = this.agents.get(projectId);
    return agent?.queuedMessageCount || 0;
  }

  getQueuedMessages(projectId: string): string[] {
    const agent = this.agents.get(projectId);
    return agent?.queuedMessages || [];
  }

  removeQueuedMessage(projectId: string, index: number): boolean {
    const agent = this.agents.get(projectId);

    if (!agent) {
      return false;
    }

    return agent.removeQueuedMessage(index);
  }

  getSessionId(projectId: string): string | null {
    const agent = this.agents.get(projectId);
    return agent?.sessionId || null;
  }

  getFullStatus(projectId: string): FullAgentStatus {
    const agent = this.agents.get(projectId);

    return {
      status: agent?.status || 'stopped',
      mode: agent?.mode || null,
      queued: this.isQueued(projectId),
      queuedMessageCount: agent?.queuedMessageCount || 0,
      isWaitingForInput: agent?.isWaitingForInput || false,
      waitingVersion: agent?.waitingVersion || 0,
      sessionId: agent?.sessionId || null,
      permissionMode: agent?.permissionMode || null,
    };
  }

  private async runNextMilestone(projectId: string): Promise<void> {
    const loopState = this.loopStates.get(projectId);
    const projectLogger = this.logger.withProject(projectId);

    if (!loopState || !loopState.shouldContinue) {
      this.cleanupLoop(projectId);
      return;
    }

    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      this.cleanupLoop(projectId);
      return;
    }

    const roadmap = await this.loadRoadmap(project.path);

    if (!roadmap) {
      projectLogger.error('Roadmap not found during loop');
      this.emit('milestoneFailed', projectId, null, 'Roadmap not found');
      this.cleanupLoop(projectId);
      return;
    }

    // Find the next milestone with pending tasks
    const milestoneContext = this.instructionGenerator.findFirstIncompleteMilestone(roadmap);

    if (!milestoneContext) {
      projectLogger.info('All milestones complete, loop finished');
      this.emit('loopCompleted', projectId);
      this.cleanupLoop(projectId);
      return;
    }

    const milestoneRef = this.createMilestoneRef(milestoneContext);
    loopState.currentMilestone = milestoneRef;

    // Clear nextItem since we're working on milestone now
    await this.projectRepository.updateNextItem(projectId, null);

    // Create a new conversation for this milestone
    const milestoneItemRef: MilestoneItemRef = {
      phaseId: milestoneContext.phase.id,
      milestoneId: milestoneContext.milestone.id,
      itemIndex: 0,
      taskTitle: `Milestone: ${milestoneContext.milestone.title}`,
    };

    const conversation = await this.conversationRepository.create(projectId, milestoneItemRef);
    loopState.currentConversationId = conversation.id;
    await this.projectRepository.setCurrentConversation(projectId, conversation.id);

    projectLogger.info('Starting milestone', {
      phase: milestoneContext.phase.title,
      milestone: milestoneContext.milestone.title,
      pendingTasks: milestoneContext.pendingTasks.length,
    });

    this.emit('milestoneStarted', projectId, milestoneRef);

    // Generate instructions for all pending tasks in the milestone
    const settings = await this.settingsRepository.get();
    const instructions = this.instructionGenerator.generateForMilestone(settings.agentPromptTemplate, {
      projectName: project.name,
      phaseTitle: milestoneContext.phase.title,
      milestoneTitle: milestoneContext.milestone.title,
      pendingTasks: milestoneContext.pendingTasks.map((t) => t.title),
    });

    // Start the agent
    try {
      if (this.agents.size >= this.maxConcurrentAgents) {
        await this.addToQueue(projectId, instructions);
      } else {
        await this.startAgentImmediately(projectId, project.path, instructions);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      projectLogger.error('Failed to start agent', { error: errorMessage });
      this.emit('milestoneFailed', projectId, milestoneRef, errorMessage);
      this.cleanupLoop(projectId);
    }
  }

  private createMilestoneRef(context: MilestoneWithContext): MilestoneRef {
    return {
      phaseId: context.phase.id,
      phaseTitle: context.phase.title,
      milestoneId: context.milestone.id,
      milestoneTitle: context.milestone.title,
      pendingTasks: context.pendingTasks.map((t) => t.title),
    };
  }

  private cleanupLoop(projectId: string): void {
    const loopState = this.loopStates.get(projectId);

    if (loopState) {
      loopState.isLooping = false;
    }

    this.loopStates.delete(projectId);
  }

  private async loadRoadmap(projectPath: string): Promise<ParsedRoadmap | null> {
    const roadmapPath = path.join(projectPath, 'doc', 'ROADMAP.md');

    try {
      const content = await fs.promises.readFile(roadmapPath, 'utf-8');
      return this.roadmapParser.parse(content);
    } catch {
      return null;
    }
  }

  private parseAgentResponse(output: string): AgentCompletionResponse | null {
    // Find the last JSON object in the output
    const jsonPattern = /\{[\s\S]*?"status"\s*:\s*"(?:COMPLETE|FAILED)"[\s\S]*?"reason"\s*:\s*"[^"]*"[\s\S]*?\}/g;
    const matches = output.match(jsonPattern);

    if (!matches || matches.length === 0) {
      return null;
    }

    // Take the last match
    const lastMatch = matches[matches.length - 1]!;

    try {
      const parsed: unknown = JSON.parse(lastMatch);

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'status' in parsed &&
        'reason' in parsed &&
        ((parsed as { status: string }).status === 'COMPLETE' || (parsed as { status: string }).status === 'FAILED')
      ) {
        const typedParsed = parsed as { status: 'COMPLETE' | 'FAILED'; reason?: string };
        return {
          status: typedParsed.status,
          reason: typedParsed.reason || 'No reason provided',
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  private async startAgentImmediately(
    projectId: string,
    projectPath: string,
    instructions: string,
    mode: AgentMode = 'autonomous',
    sessionId?: string,
    permissionModeOverride?: 'acceptEdits' | 'plan',
    isNewSession: boolean = true
  ): Promise<void> {
    const settings = await this.settingsRepository.get();
    const project = await this.projectRepository.findById(projectId);
    const projectOverrides = project?.permissionOverrides ?? null;
    const permArgs = this.permissionGenerator.generateArgs(settings.claudePermissions, projectOverrides);

    const permissions: PermissionConfig = {
      skipPermissions: permArgs.skipPermissions,
      allowedTools: permArgs.allowedTools,
      disallowedTools: permArgs.disallowedTools,
      // Use override if provided, otherwise use settings
      permissionMode: permissionModeOverride || permArgs.permissionMode,
      appendSystemPrompt: settings.appendSystemPrompt,
    };

    // Convert settings limits/streaming to agent config
    const limits: AgentLimits = {
      maxTurns: settings.agentLimits.maxTurns > 0 ? settings.agentLimits.maxTurns : undefined,
    };

    const streaming: AgentStreamingOptions = {
      includePartialMessages: settings.agentStreaming.includePartialMessages,
      noSessionPersistence: settings.agentStreaming.noSessionPersistence,
    };

    const agent = this.agentFactory.create({
      projectId,
      projectPath,
      mode,
      permissions,
      limits,
      streaming,
      sessionId,
      isNewSession,
    });
    this.setupAgentListeners(agent);
    this.agents.set(projectId, agent);

    await this.projectRepository.updateStatus(projectId, 'running');
    agent.start(instructions);

    // Track the PID for orphan cleanup on restart
    if (agent.processInfo?.pid) {
      this.pidTracker.addProcess(agent.processInfo.pid, projectId);
    }

    // Wait briefly for potential session errors
    await this.delay(150);

    // Check if session ID was rejected (session not found or already in use)
    if (agent.sessionError && sessionId) {
      const oldConversationId = sessionId;
      this.logger.warn('Session error detected, creating fresh conversation', {
        projectId,
        oldConversationId,
        error: agent.sessionError,
      });

      // Stop the failed agent
      if (agent.processInfo?.pid) {
        this.pidTracker.removeProcess(agent.processInfo.pid);
      }
      await agent.stop();
      this.agents.delete(projectId);

      // Delete the old conversation that had the invalid session
      await this.conversationRepository.deleteConversation(projectId, oldConversationId);

      // Create a new conversation with a fresh UUID
      const newConversation = await this.conversationRepository.create(projectId, null);
      await this.projectRepository.setCurrentConversation(projectId, newConversation.id);

      this.logger.info('Created fresh conversation after session error', {
        projectId,
        oldConversationId,
        newConversationId: newConversation.id,
      });

      // Emit session recovery event to notify frontend
      const reason = agent.sessionError.includes('already in use')
        ? 'Session was already in use. Started a new conversation.'
        : 'Could not resume the previous conversation. It may have been deleted by Claude or this is from an old version. Started a new conversation.';
      this.emit('sessionRecovery', projectId, oldConversationId, newConversation.id, reason);

      // Restart with the new conversation's UUID as the session ID (new session)
      const freshAgent = this.agentFactory.create({
        projectId,
        projectPath,
        mode,
        permissions,
        limits,
        streaming,
        sessionId: newConversation.id,
        isNewSession: true,
      });
      this.setupAgentListeners(freshAgent);
      this.agents.set(projectId, freshAgent);
      freshAgent.start(instructions);

      if (freshAgent.processInfo?.pid) {
        this.pidTracker.addProcess(freshAgent.processInfo.pid, projectId);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async addToQueue(projectId: string, instructions: string): Promise<void> {
    this.queue.push({
      projectId,
      instructions,
      queuedAt: new Date().toISOString(),
    });

    await this.projectRepository.updateStatus(projectId, 'queued');
    this.emitQueueChange();
  }

  private emitQueueChange(): void {
    this.emit('queueChange', [...this.queue]);
  }

  async stopAgent(projectId: string): Promise<void> {
    const agent = this.agents.get(projectId);

    if (!agent) {
      return;
    }

    // Remove PID from tracking before stopping
    if (agent.processInfo?.pid) {
      this.pidTracker.removeProcess(agent.processInfo.pid);
    }

    // Also stop the autonomous loop if running
    this.stopAutonomousLoop(projectId);

    await agent.stop();
    this.agents.delete(projectId);
    await this.projectRepository.updateStatus(projectId, 'stopped');
  }

  async stopAllAgents(): Promise<void> {
    const projectIds = Array.from(this.agents.keys());
    this.logger.info('Stopping all agents', { count: projectIds.length });

    const stopPromises = projectIds.map((projectId) => this.stopAgent(projectId));
    await Promise.all(stopPromises);

    // Clear the queue as well
    this.queue.length = 0;
    this.emit('queueChange', []);

    // Ensure all pending message saves complete (including findById lookups)
    this.logger.info('Flushing pending message saves...');
    await this.flushPendingMessageSaves();

    // Ensure all pending conversation writes complete before returning
    this.logger.info('Flushing pending conversation writes...');
    await this.conversationRepository.flush();

    this.logger.info('All agents stopped');
  }

  getAgentStatus(projectId: string): AgentStatus {
    const agent = this.agents.get(projectId);
    return agent ? agent.status : 'stopped';
  }

  isRunning(projectId: string): boolean {
    return this.agents.has(projectId) && this.agents.get(projectId)!.status === 'running';
  }

  isQueued(projectId: string): boolean {
    return this.queue.some((q) => q.projectId === projectId);
  }

  isWaitingForInput(projectId: string): boolean {
    const agent = this.agents.get(projectId);
    return agent?.isWaitingForInput ?? false;
  }

  getWaitingVersion(projectId: string): number {
    const agent = this.agents.get(projectId);
    return agent?.waitingVersion ?? 0;
  }

  getResourceStatus(): AgentResourceStatus {
    return {
      runningCount: this.agents.size,
      maxConcurrent: this.maxConcurrentAgents,
      queuedCount: this.queue.length,
      queuedProjects: [...this.queue],
    };
  }

  removeFromQueue(projectId: string): void {
    const index = this.queue.findIndex((q) => q.projectId === projectId);

    if (index !== -1) {
      this.queue.splice(index, 1);
      this.projectRepository.updateStatus(projectId, 'stopped').catch(() => {});
      this.emitQueueChange();
    }
  }

  getTrackedProcesses(): TrackedProcessInfo[] {
    return this.pidTracker.getTrackedProcesses();
  }

  async cleanupOrphanProcesses(): Promise<OrphanCleanupResult> {
    return this.pidTracker.cleanupOrphanProcesses();
  }

  getRunningProjectIds(): string[] {
    return Array.from(this.agents.keys());
  }

  async restartAllRunningAgents(): Promise<void> {
    const runningProjectIds = this.getRunningProjectIds();

    if (runningProjectIds.length === 0) {
      return;
    }

    this.logger.info('Restarting all running agents due to settings change', {
      count: runningProjectIds.length,
      projectIds: runningProjectIds,
    });

    // Stop and restart each agent, preserving its session
    for (const projectId of runningProjectIds) {
      const agent = this.agents.get(projectId);

      if (!agent) {
        continue;
      }

      const sessionId = agent.sessionId;
      const mode = agent.mode;

      // Stop the agent
      await this.stopAgent(projectId);

      // Restart with the same session ID
      try {
        if (mode === 'interactive') {
          await this.startInteractiveAgent(projectId, { sessionId: sessionId || undefined });
        }
        // Autonomous agents don't need to be restarted as they run from roadmap
      } catch (error) {
        this.logger.error('Failed to restart agent', {
          projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  on<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void {
    this.listeners[event].add(listener);
  }

  off<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void {
    this.listeners[event].delete(listener);
  }

  private trackMessageSave<T>(promise: Promise<T>): Promise<T> {
    this.pendingMessageSaves.add(promise);
    void promise.finally(() => this.pendingMessageSaves.delete(promise));
    return promise;
  }

  private async flushPendingMessageSaves(): Promise<void> {
    while (this.pendingMessageSaves.size > 0) {
      await Promise.all(Array.from(this.pendingMessageSaves));
    }
  }

  private setupAgentListeners(agent: ClaudeAgent): void {
    const messageListener = (message: AgentMessage): void => {
      this.emit('message', agent.projectId, message);

      // Store message in conversation
      const loopState = this.loopStates.get(agent.projectId);

      if (loopState?.currentConversationId) {
        // Autonomous mode - use loop state conversation
        const savePromise = this.conversationRepository
          .addMessage(agent.projectId, loopState.currentConversationId, message)
          .catch(() => {});
        void this.trackMessageSave(savePromise);

        // Save context usage if available
        this.saveContextUsageIfNeeded(agent, loopState.currentConversationId);
      } else if (agent.mode === 'interactive') {
        // Interactive mode - use project's current conversation
        const savePromise = this.projectRepository.findById(agent.projectId).then((project) => {
          if (project?.currentConversationId) {
            const conversationId = project.currentConversationId;
            return this.conversationRepository
              .addMessage(agent.projectId, conversationId, message)
              .then(() => {
                // Save context usage if available
                this.saveContextUsageIfNeeded(agent, conversationId);
              })
              .catch((err) => {
                this.logger.error('Failed to save message to conversation', {
                  projectId: agent.projectId,
                  conversationId,
                  messageType: message.type,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
          } else {
            this.logger.warn('No currentConversationId for project, message not saved', {
              projectId: agent.projectId,
              messageType: message.type,
            });
          }
          return Promise.resolve();
        });
        void this.trackMessageSave(savePromise);
      }
    };

    const statusListener = (status: AgentStatus): void => {
      this.emit('status', agent.projectId, status);
      void this.handleStatusChange(agent.projectId, status);
    };

    const waitingListener = ({ isWaiting, version }: { isWaiting: boolean; version: number }): void => {
      this.emit('waitingForInput', agent.projectId, isWaiting, version);
    };

    const exitListener = (code: number | null): void => {
      void this.handleAgentExit(agent, code);
    };

    const sessionNotFoundListener = (missingSessionId: string): void => {
      void this.handleSessionNotFound(agent, missingSessionId);
    };

    agent.on('message', messageListener);
    agent.on('status', statusListener);
    agent.on('waitingForInput', waitingListener);
    agent.on('exit', exitListener);
    agent.on('sessionNotFound', sessionNotFoundListener);
  }

  private async handleAgentExit(agent: ClaudeAgent, _code: number | null): Promise<void> {
    const projectId = agent.projectId;
    const projectLogger = this.logger.withProject(projectId);
    const loopState = this.loopStates.get(projectId);

    // Check if this agent is still the current one (a new agent may have been started during session recovery)
    const currentAgent = this.agents.get(projectId);
    const isCurrentAgent = currentAgent === agent;

    // Save final context usage before cleaning up
    const finalContextUsage = agent.contextUsage;

    if (finalContextUsage && isCurrentAgent) {
      projectLogger.debug('Saving final context usage on exit', {
        totalTokens: finalContextUsage.totalTokens,
        inputTokens: finalContextUsage.inputTokens,
        outputTokens: finalContextUsage.outputTokens,
      });

      // Save to project status for persistence
      await this.projectRepository.updateContextUsage(projectId, finalContextUsage);

      // Save to conversation if available
      const project = await this.projectRepository.findById(projectId);

      if (project?.currentConversationId) {
        await this.conversationRepository
          .updateMetadata(projectId, project.currentConversationId, { contextUsage: finalContextUsage })
          .catch(() => {});
      }
    }

    // Only delete from agents map if this is still the current agent
    // (a new agent may have been started during session recovery)
    if (isCurrentAgent) {
      this.agents.delete(projectId);
    } else {
      projectLogger.debug('Skipping agent cleanup - a new agent was already started', {
        exitingAgent: agent.sessionId,
        currentAgent: currentAgent?.sessionId,
      });
    }

    // Skip further processing if this agent was replaced (session recovery)
    if (!isCurrentAgent) {
      return;
    }

    // If we're in an autonomous loop, handle the completion
    if (loopState && loopState.isLooping) {
      const output = agent.collectedOutput;
      const response = this.parseAgentResponse(output);
      const currentMilestone = loopState.currentMilestone;

      if (response) {
        if (response.status === 'COMPLETE') {
          projectLogger.info('Milestone completed', { reason: response.reason });

          if (currentMilestone) {
            this.emit('milestoneCompleted', projectId, currentMilestone, response.reason);
          }

          // Continue to next milestone if loop should continue
          if (loopState.shouldContinue) {
            loopState.currentMilestone = null;
            loopState.currentConversationId = null;
            await this.runNextMilestone(projectId);
          } else {
            this.cleanupLoop(projectId);
          }
        } else {
          projectLogger.warn('Milestone failed', { reason: response.reason });
          this.emit('milestoneFailed', projectId, currentMilestone, response.reason);
          this.cleanupLoop(projectId);
        }
      } else {
        projectLogger.warn('No valid completion response found in agent output');
        this.emit('milestoneFailed', projectId, currentMilestone, 'Agent did not return a valid completion response');
        this.cleanupLoop(projectId);
      }
    }

    await this.processQueue();
  }

  private async handleStatusChange(projectId: string, status: AgentStatus): Promise<void> {
    const projectStatus = status === 'running' ? 'running' : status === 'error' ? 'error' : 'stopped';
    await this.projectRepository.updateStatus(projectId, projectStatus);

    // Save session ID to conversation when agent starts running
    if (status === 'running') {
      const agent = this.agents.get(projectId);

      if (agent?.sessionId) {
        const project = await this.projectRepository.findById(projectId);

        if (project?.currentConversationId) {
          await this.conversationRepository
            .updateMetadata(projectId, project.currentConversationId, { sessionId: agent.sessionId })
            .catch(() => {});
        }
      }
    }
  }

  private async handleSessionNotFound(agent: ClaudeAgent, missingSessionId: string): Promise<void> {
    const projectId = agent.projectId;
    const projectLogger = this.logger.withProject(projectId);

    projectLogger.info('Handling session not found error', {
      missingSessionId,
      agentMode: agent.mode,
    });

    // Get project info
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      projectLogger.error('Project not found during session recovery');
      return;
    }

    const oldConversationId = project.currentConversationId;

    // Stop the current agent
    if (agent.processInfo?.pid) {
      this.pidTracker.removeProcess(agent.processInfo.pid);
    }
    await agent.stop();
    this.agents.delete(projectId);

    // Clear the current conversation (same as "Clear" button)
    // This will cause the next agent start to create a fresh conversation
    await this.projectRepository.setCurrentConversation(projectId, null);

    projectLogger.info('Cleared conversation due to session not found', {
      oldConversationId,
      missingSessionId,
    });

    // Emit session recovery event to notify the UI
    const reason = 'Session not found in Claude. The previous conversation may have been deleted. Please start a new conversation.';
    this.emit('sessionRecovery', projectId, oldConversationId || missingSessionId, '', reason);
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0 || this.agents.size >= this.maxConcurrentAgents) {
      return;
    }

    const next = this.queue.shift();

    if (!next) {
      return;
    }

    this.emitQueueChange();

    const project = await this.projectRepository.findById(next.projectId);

    if (!project) {
      await this.processQueue();
      return;
    }

    await this.startAgentImmediately(next.projectId, project.path, next.instructions);
  }

  private saveContextUsageIfNeeded(agent: ClaudeAgent, conversationId: string): void {
    const contextUsage = agent.contextUsage;

    if (!contextUsage) {
      return;
    }

    // Save to conversation metadata
    const savePromise = this.conversationRepository
      .updateMetadata(agent.projectId, conversationId, { contextUsage })
      .catch(() => {});
    void this.trackMessageSave(savePromise);

    // Also save to project status for persistence when agent is stopped
    // (this is synchronous internally, no need to track)
    this.projectRepository
      .updateContextUsage(agent.projectId, contextUsage)
      .catch(() => {});
  }

  private emit<K extends keyof AgentManagerEvents>(
    event: K,
    ...args: Parameters<AgentManagerEvents[K]>
  ): void {
    for (const listener of this.listeners[event]) {
      (listener as (...args: Parameters<AgentManagerEvents[K]>) => void)(...args);
    }
  }
}
