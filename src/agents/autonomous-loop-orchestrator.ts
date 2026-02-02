import path from 'path';
import fs from 'fs';
import { getLogger, Logger } from '../utils';
import {
  ProjectRepository,
  ConversationRepository,
  MilestoneItemRef,
} from '../repositories';
import {
  InstructionGenerator,
  RoadmapParser,
  ParsedRoadmap,
} from '../services';

export interface MilestoneRef {
  phaseId: string;
  phaseTitle: string;
  milestoneId: string;
  milestoneTitle: string;
  pendingTasks: string[];
}

export interface LoopConfig {
  projectId: string;
  projectPath: string;
  model?: string;
}

export interface LoopState {
  isLooping: boolean;
  currentMilestone: MilestoneRef | null;
  currentConversationId: string | null;
}

// Alias for backwards compatibility
export type AgentLoopState = LoopState;

export interface AgentCompletionResponse {
  status: 'COMPLETE' | 'FAILED';
  reason: string;
}

export interface AutonomousLoopEvents {
  milestoneStarted: (projectId: string, milestone: MilestoneRef) => void;
  milestoneCompleted: (projectId: string, milestone: MilestoneRef, reason: string) => void;
  milestoneFailed: (projectId: string, milestone: MilestoneRef | null, reason: string) => void;
  loopCompleted: (projectId: string) => void;
}

interface LoopStateInternal {
  isLooping: boolean;
  shouldContinue: boolean;
  currentMilestone: MilestoneRef | null;
  currentConversationId: string | null;
}

/**
 * Orchestrates autonomous agent loops that work through roadmap milestones.
 * Manages milestone selection, completion tracking, and loop lifecycle.
 */
export class AutonomousLoopOrchestrator {
  private readonly loopStates: Map<string, LoopStateInternal> = new Map();
  private readonly logger: Logger;
  private readonly listeners: Map<keyof AutonomousLoopEvents, Set<Function>> = new Map();

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly instructionGenerator: InstructionGenerator,
    private readonly roadmapParser: RoadmapParser
  ) {
    this.logger = getLogger('loop-orchestrator');
  }

  /**
   * Start an autonomous loop for a project.
   */
  async startLoop(config: LoopConfig): Promise<MilestoneRef | null> {
    const { projectId, projectPath } = config;

    if (this.isLooping(projectId)) {
      throw new Error('Autonomous loop is already running for this project');
    }

    this.logger.info('Starting autonomous loop', { projectId });

    // Initialize loop state
    this.loopStates.set(projectId, {
      isLooping: true,
      shouldContinue: true,
      currentMilestone: null,
      currentConversationId: null,
    });

    // Get next milestone to work on
    const milestone = await this.getNextMilestone(projectId, projectPath);

    if (!milestone) {
      this.logger.info('No pending milestones found', { projectId });
      this.cleanupLoop(projectId);
      return null;
    }

    return milestone;
  }

  /**
   * Stop the autonomous loop for a project.
   */
  stopLoop(projectId: string): void {
    const state = this.loopStates.get(projectId);

    if (state) {
      this.logger.info('Stopping autonomous loop', {
        projectId,
        currentMilestone: state.currentMilestone?.milestoneId,
      });

      state.shouldContinue = false;
      this.cleanupLoop(projectId);
    }
  }

  /**
   * Check if a project has an active loop.
   */
  isLooping(projectId: string): boolean {
    return this.loopStates.get(projectId)?.isLooping === true;
  }

  /**
   * Check if the loop should continue for a project.
   */
  shouldContinueLoop(projectId: string): boolean {
    return this.loopStates.get(projectId)?.shouldContinue === true;
  }

  /**
   * Get the current loop state for a project.
   */
  getLoopState(projectId: string): LoopState | null {
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

  /**
   * Set the current milestone for a loop.
   */
  setCurrentMilestone(
    projectId: string,
    milestone: MilestoneRef,
    conversationId: string
  ): void {
    const state = this.loopStates.get(projectId);

    if (state) {
      state.currentMilestone = milestone;
      state.currentConversationId = conversationId;

      this.emit('milestoneStarted', projectId, milestone);
    }
  }

  /**
   * Handle milestone completion and determine next action.
   *
   * @returns The next milestone to work on, or null if loop should end
   */
  async handleMilestoneComplete(
    projectId: string,
    projectPath: string,
    milestone: MilestoneRef,
    reason: string
  ): Promise<MilestoneRef | null> {
    this.logger.info('Milestone completed', {
      projectId,
      milestone: milestone.milestoneId,
      reason,
    });

    this.emit('milestoneCompleted', projectId, milestone, reason);

    // Check if we should continue
    if (!this.shouldContinueLoop(projectId)) {
      this.logger.info('Loop stopped by user', { projectId });
      this.cleanupLoop(projectId);
      return null;
    }

    // Get next milestone
    const nextMilestone = await this.getNextMilestone(projectId, projectPath);

    if (!nextMilestone) {
      this.logger.info('No more milestones to process', { projectId });
      this.emit('loopCompleted', projectId);
      this.cleanupLoop(projectId);
      return null;
    }

    return nextMilestone;
  }

  /**
   * Handle milestone failure.
   */
  handleMilestoneFailed(
    projectId: string,
    milestone: MilestoneRef | null,
    reason: string
  ): void {
    this.logger.error('Milestone failed', {
      projectId,
      milestone: milestone?.milestoneId,
      reason,
    });

    this.emit('milestoneFailed', projectId, milestone, reason);
    this.cleanupLoop(projectId);
  }

  /**
   * Generate instructions for a milestone.
   */
  async generateMilestoneInstructions(
    projectId: string,
    projectName: string,
    milestone: MilestoneRef
  ): Promise<string> {
    // For now, we'll skip setting the next item as the interface doesn't match
    // This would need to be refactored to use the actual MilestoneItemRef structure
    // which includes itemIndex and taskTitle

    // Generate instructions using the template approach
    const settings = { agentPromptTemplate: '' }; // This needs to be injected
    const instructions = this.instructionGenerator.generateForMilestone(
      settings.agentPromptTemplate,
      {
        projectName,
        phaseTitle: milestone.phaseTitle,
        milestoneTitle: milestone.milestoneTitle,
        pendingTasks: milestone.pendingTasks
      }
    );

    return instructions;
  }

  /**
   * Parse agent output to determine completion status.
   */
  parseAgentResponse(output: string): AgentCompletionResponse | null {
    // Look for specific completion markers in the output
    const completionPatterns = [
      /MILESTONE\s+COMPLETE[:\s]+(.+)/i,
      /✓\s*Milestone\s+completed[:\s]+(.+)/i,
      /STATUS:\s*COMPLETE[:\s]+(.+)/i,
      /All\s+tasks?\s+(?:completed|done|finished).*?[.!]/i,
    ];

    const failurePatterns = [
      /MILESTONE\s+FAILED[:\s]+(.+)/i,
      /STATUS:\s*FAILED[:\s]+(.+)/i,
      /Unable\s+to\s+complete\s+milestone[:\s]+(.+)/i,
      /Critical\s+error[:\s]+(.+)/i,
    ];

    // Check for completion
    for (const pattern of completionPatterns) {
      const match = output.match(pattern);
      if (match) {
        return {
          status: 'COMPLETE',
          reason: match[1] || 'All tasks completed successfully',
        };
      }
    }

    // Check for failure
    for (const pattern of failurePatterns) {
      const match = output.match(pattern);
      if (match) {
        return {
          status: 'FAILED',
          reason: match[1] || 'Failed to complete milestone',
        };
      }
    }

    // Check last few lines for a clear status
    const lines = output.split('\n').filter((line) => line.trim());
    const lastLines = lines.slice(-5);

    for (const line of lastLines) {
      const trimmed = line.trim();
      if (trimmed.includes('complete') && !trimmed.includes('incomplete')) {
        return {
          status: 'COMPLETE',
          reason: 'Tasks completed',
        };
      }
      if (trimmed.includes('failed') || trimmed.includes('error')) {
        return {
          status: 'FAILED',
          reason: trimmed,
        };
      }
    }

    return null;
  }

  /**
   * Get all project IDs with running loops.
   */
  getRunningProjectIds(): string[] {
    return Array.from(this.loopStates.keys()).filter(
      (projectId) => this.loopStates.get(projectId)?.isLooping === true
    );
  }

  /**
   * Subscribe to loop events.
   */
  on<K extends keyof AutonomousLoopEvents>(
    event: K,
    listener: AutonomousLoopEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Unsubscribe from loop events.
   */
  off<K extends keyof AutonomousLoopEvents>(
    event: K,
    listener: AutonomousLoopEvents[K]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  /**
   * Get the next milestone to work on based on roadmap.
   */
  private async getNextMilestone(
    projectId: string,
    projectPath: string
  ): Promise<MilestoneRef | null> {
    const roadmap = await this.loadRoadmap(projectPath);

    if (!roadmap) {
      return null;
    }

    // Parse the roadmap to find the next incomplete milestone
    // This is a simplified implementation - the original may have more logic
    for (const phase of roadmap.phases) {
      for (const milestone of phase.milestones) {
        const incompleteTasks = milestone.tasks.filter(t => !t.completed);
        if (incompleteTasks.length > 0) {
          return {
            phaseId: phase.id,
            phaseTitle: phase.title,
            milestoneId: milestone.id,
            milestoneTitle: milestone.title,
            pendingTasks: incompleteTasks.map(t => t.title),
          };
        }
      }
    }

    return null;
  }

  /**
   * Load and parse the project roadmap.
   */
  private async loadRoadmap(projectPath: string): Promise<ParsedRoadmap | null> {
    try {
      const roadmapPath = path.join(projectPath, 'doc', 'ROADMAP.md');
      // Read file and parse content
      const content = await fs.promises.readFile(roadmapPath, 'utf-8');
      return this.roadmapParser.parse(content);
    } catch (error) {
      this.logger.error('Failed to load roadmap', {
        projectPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }


  /**
   * Clean up loop state for a project.
   */
  private cleanupLoop(projectId: string): void {
    this.loopStates.delete(projectId);
    this.logger.debug('Loop state cleaned up', { projectId });
  }

  private emit<K extends keyof AutonomousLoopEvents>(
    event: K,
    ...args: Parameters<AutonomousLoopEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as Function)(...args);
        } catch (error) {
          this.logger.error(`Error in ${event} listener`, { error });
        }
      });
    }
  }
}