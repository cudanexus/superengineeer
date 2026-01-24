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
} from './claude-agent';
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
import { getLogger, Logger, getPidTracker, PidTracker } from '../utils';

export interface AgentManagerEvents {
  message: (projectId: string, message: AgentMessage) => void;
  status: (projectId: string, status: AgentStatus) => void;
  queueChange: (queue: QueuedProject[]) => void;
  milestoneStarted: (projectId: string, milestone: MilestoneRef) => void;
  milestoneCompleted: (projectId: string, milestone: MilestoneRef, reason: string) => void;
  milestoneFailed: (projectId: string, milestone: MilestoneRef | null, reason: string) => void;
  loopCompleted: (projectId: string) => void;
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

export interface AgentManager {
  startAgent(projectId: string, instructions: string): Promise<void>;
  startInteractiveAgent(projectId: string, initialMessage?: string, images?: ImageData[]): Promise<void>;
  sendInput(projectId: string, input: string, images?: ImageData[]): void;
  stopAgent(projectId: string): Promise<void>;
  stopAllAgents(): Promise<void>;
  getAgentStatus(projectId: string): AgentStatus;
  getAgentMode(projectId: string): AgentMode | null;
  isRunning(projectId: string): boolean;
  isQueued(projectId: string): boolean;
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
  getTrackedProcesses(): TrackedProcessInfo[];
  cleanupOrphanProcesses(): Promise<OrphanCleanupResult>;
  on<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void;
  off<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void;
}

export interface AgentFactory {
  create(projectId: string, projectPath: string, mode: AgentMode): ClaudeAgent;
}

const defaultAgentFactory: AgentFactory = {
  create: (projectId, projectPath, mode) => new DefaultClaudeAgent({ projectId, projectPath, mode }),
};

export interface AgentManagerDependencies {
  projectRepository: ProjectRepository;
  conversationRepository: ConversationRepository;
  settingsRepository: SettingsRepository;
  instructionGenerator: InstructionGenerator;
  roadmapParser: RoadmapParser;
  agentFactory?: AgentFactory;
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
  private _maxConcurrentAgents: number;
  private readonly logger: Logger;
  private readonly pidTracker: PidTracker;
  private readonly listeners: EventListeners = {
    message: new Set(),
    status: new Set(),
    queueChange: new Set(),
    milestoneStarted: new Set(),
    milestoneCompleted: new Set(),
    milestoneFailed: new Set(),
    loopCompleted: new Set(),
  };

  constructor(deps: AgentManagerDependencies) {
    this.projectRepository = deps.projectRepository;
    this.conversationRepository = deps.conversationRepository;
    this.settingsRepository = deps.settingsRepository;
    this.instructionGenerator = deps.instructionGenerator;
    this.roadmapParser = deps.roadmapParser;
    this.agentFactory = deps.agentFactory || defaultAgentFactory;
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

  async startInteractiveAgent(projectId: string, initialMessage?: string, images?: ImageData[]): Promise<void> {
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

    this.logger.withProject(projectId).info('Starting interactive agent', {
      hasMessage: !!initialMessage,
      imageCount: images?.length || 0,
    });

    // Create a new conversation for this interactive session
    const conversation = await this.conversationRepository.create(projectId, null);
    await this.projectRepository.setCurrentConversation(projectId, conversation.id);

    // Build multimodal instructions if images are provided
    const instructions = this.buildMultimodalContent(initialMessage || '', images);
    await this.startAgentImmediately(projectId, project.path, instructions, 'interactive');
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
    void this.projectRepository.findById(projectId).then((project) => {
      if (project?.currentConversationId) {
        this.conversationRepository
          .addMessage(projectId, project.currentConversationId, message)
          .catch(() => {});
      }
    });

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
    mode: AgentMode = 'autonomous'
  ): Promise<void> {
    const agent = this.agentFactory.create(projectId, projectPath, mode);
    this.setupAgentListeners(agent);
    this.agents.set(projectId, agent);

    await this.projectRepository.updateStatus(projectId, 'running');
    agent.start(instructions);

    // Track the PID for orphan cleanup on restart
    if (agent.processInfo?.pid) {
      this.pidTracker.addProcess(agent.processInfo.pid, projectId);
    }
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

  on<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void {
    this.listeners[event].add(listener);
  }

  off<K extends keyof AgentManagerEvents>(event: K, listener: AgentManagerEvents[K]): void {
    this.listeners[event].delete(listener);
  }

  private setupAgentListeners(agent: ClaudeAgent): void {
    const messageListener = (message: AgentMessage): void => {
      this.emit('message', agent.projectId, message);

      // Store message in conversation
      const loopState = this.loopStates.get(agent.projectId);

      if (loopState?.currentConversationId) {
        // Autonomous mode - use loop state conversation
        this.conversationRepository
          .addMessage(agent.projectId, loopState.currentConversationId, message)
          .catch(() => {});

        // Save context usage if available
        this.saveContextUsageIfNeeded(agent, loopState.currentConversationId);
      } else if (agent.mode === 'interactive') {
        // Interactive mode - use project's current conversation
        void this.projectRepository.findById(agent.projectId).then((project) => {
          if (project?.currentConversationId) {
            this.conversationRepository
              .addMessage(agent.projectId, project.currentConversationId, message)
              .catch(() => {});

            // Save context usage if available
            this.saveContextUsageIfNeeded(agent, project.currentConversationId);
          }
        });
      }
    };

    const statusListener = (status: AgentStatus): void => {
      this.emit('status', agent.projectId, status);
      void this.handleStatusChange(agent.projectId, status);
    };

    const exitListener = (code: number | null): void => {
      void this.handleAgentExit(agent, code);
    };

    agent.on('message', messageListener);
    agent.on('status', statusListener);
    agent.on('exit', exitListener);
  }

  private async handleAgentExit(agent: ClaudeAgent, _code: number | null): Promise<void> {
    const projectId = agent.projectId;
    const projectLogger = this.logger.withProject(projectId);
    const loopState = this.loopStates.get(projectId);

    // Save final context usage before cleaning up
    const finalContextUsage = agent.contextUsage;

    if (finalContextUsage) {
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

    this.agents.delete(projectId);

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
    this.conversationRepository
      .updateMetadata(agent.projectId, conversationId, { contextUsage })
      .catch(() => {});

    // Also save to project status for persistence when agent is stopped
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
