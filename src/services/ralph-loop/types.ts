/**
 * Ralph Loop Types
 *
 * The Ralph Loop is based on Geoffrey Huntley's "Ralph Wiggum technique" -
 * an iterative development pattern that starts each iteration with fresh
 * context and uses worker/reviewer model separation.
 */

/**
 * Configuration for a Ralph Loop execution
 */
export interface RalphLoopConfig {
  /** Maximum number of worker/reviewer iterations before stopping */
  maxTurns: number;
  /** Model to use for the worker agent */
  workerModel: string;
  /** Model to use for the reviewer agent */
  reviewerModel: string;
  /** The task description for the worker to complete */
  taskDescription: string;
  /** Optional: Custom worker prompt template */
  workerPromptTemplate?: string;
  /** Optional: Custom reviewer prompt template */
  reviewerPromptTemplate?: string;
  /** Optional: Additional system prompt appended to worker agent */
  workerSystemPrompt?: string;
  /** Optional: Additional system prompt appended to reviewer agent */
  reviewerSystemPrompt?: string;
}

/**
 * Summary of a worker iteration
 */
export interface IterationSummary {
  iterationNumber: number;
  timestamp: string;
  workerOutput: string;
  filesModified: string[];
  tokensUsed: number;
  durationMs: number;
}

/**
 * Feedback from a reviewer iteration
 */
export interface ReviewerFeedback {
  iterationNumber: number;
  timestamp: string;
  decision: 'approve' | 'reject' | 'needs_changes';
  feedback: string;
  specificIssues: string[];
  suggestedImprovements: string[];
}

/**
 * Status of a Ralph Loop
 */
export type RalphLoopStatus =
  | 'idle'
  | 'worker_running'
  | 'reviewer_running'
  | 'completed'
  | 'failed'
  | 'paused';

/**
 * Final status when loop completes
 */
export type RalphLoopFinalStatus =
  | 'approved'
  | 'max_turns_reached'
  | 'critical_failure';

/**
 * Complete state of a Ralph Loop
 */
export interface RalphLoopState {
  taskId: string;
  projectId: string;
  config: RalphLoopConfig;
  currentIteration: number;
  status: RalphLoopStatus;
  summaries: IterationSummary[];
  feedback: ReviewerFeedback[];
  finalStatus?: RalphLoopFinalStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Events emitted by the Ralph Loop service
 */
export interface RalphLoopEvents {
  iteration_start: (projectId: string, taskId: string, iteration: number) => void;
  worker_complete: (projectId: string, taskId: string, summary: IterationSummary) => void;
  reviewer_complete: (projectId: string, taskId: string, feedback: ReviewerFeedback) => void;
  loop_complete: (projectId: string, taskId: string, finalStatus: RalphLoopFinalStatus) => void;
  loop_error: (projectId: string, taskId: string, error: string) => void;
  status_change: (projectId: string, taskId: string, status: RalphLoopStatus, currentIteration?: number, maxTurns?: number) => void;
  output: (projectId: string, taskId: string, source: 'worker' | 'reviewer', content: string) => void;
  tool_use: (
    projectId: string,
    taskId: string,
    source: 'worker' | 'reviewer',
    toolInfo: { tool_name: string; tool_id: string; parameters: Record<string, unknown>; timestamp: string }
  ) => void;
  loop_deleted: (projectId: string, taskId: string) => void;
}

/**
 * Service interface for managing Ralph Loops
 */
export interface RalphLoopService {
  /** Start a new Ralph Loop for a task */
  start(projectId: string, config: RalphLoopConfig): Promise<RalphLoopState>;

  /** Stop a running Ralph Loop */
  stop(projectId: string, taskId: string): Promise<void>;

  /** Pause a running Ralph Loop (can be resumed) */
  pause(projectId: string, taskId: string): Promise<void>;

  /** Resume a paused Ralph Loop */
  resume(projectId: string, taskId: string): Promise<void>;

  /** Get the current state of a Ralph Loop */
  getState(projectId: string, taskId: string): Promise<RalphLoopState | null>;

  /** List all Ralph Loops for a project */
  listByProject(projectId: string): Promise<RalphLoopState[]>;

  /** Delete a Ralph Loop and its associated data */
  delete(projectId: string, taskId: string): Promise<boolean>;

  /** Event subscription */
  on<K extends keyof RalphLoopEvents>(event: K, listener: RalphLoopEvents[K]): void;

  /** Event unsubscription */
  off<K extends keyof RalphLoopEvents>(event: K, listener: RalphLoopEvents[K]): void;
}

/**
 * Repository interface for persisting Ralph Loop state
 */
export interface RalphLoopRepository {
  /** Create a new Ralph Loop state */
  create(state: Omit<RalphLoopState, 'createdAt' | 'updatedAt'>): Promise<RalphLoopState>;

  /** Find a Ralph Loop by task ID */
  findById(projectId: string, taskId: string): Promise<RalphLoopState | null>;

  /** List all Ralph Loops for a project */
  findByProject(projectId: string): Promise<RalphLoopState[]>;

  /** Update Ralph Loop state */
  update(projectId: string, taskId: string, updates: Partial<RalphLoopState>): Promise<RalphLoopState | null>;

  /** Add an iteration summary */
  addSummary(projectId: string, taskId: string, summary: IterationSummary): Promise<void>;

  /** Add reviewer feedback */
  addFeedback(projectId: string, taskId: string, feedback: ReviewerFeedback): Promise<void>;

  /** Delete a Ralph Loop and all its data */
  delete(projectId: string, taskId: string): Promise<boolean>;

  /** Flush pending writes */
  flush(): Promise<void>;
}

/**
 * Interface for building context for worker and reviewer agents
 */
export interface ContextInitializer {
  /** Build context for a worker iteration */
  buildWorkerContext(state: RalphLoopState): string;

  /** Build context for a reviewer iteration */
  buildReviewerContext(state: RalphLoopState, workerOutput: string): string;
}

/**
 * Settings for Ralph Loop defaults
 */
export interface RalphLoopSettings {
  defaultMaxTurns: number;
  defaultWorkerModel: string;
  defaultReviewerModel: string;
  workerPromptTemplate: string;
  reviewerPromptTemplate: string;
}

/**
 * Default worker prompt template
 */
export const DEFAULT_WORKER_PROMPT_TEMPLATE = `You are a worker agent implementing a task iteratively. Your goal is to make progress on the task while building upon previous work.

## Task Description
\${taskDescription}

## Previous Iterations Summary
\${previousSummaries}

## Previous Reviewer Feedback
\${previousFeedback}

## Your Instructions
1. Review the previous work and feedback carefully
2. Address any specific issues raised by the reviewer
3. Make incremental progress on the task
4. When done, provide a summary of:
   - What changes you made
   - Files you modified
   - Any blockers or questions

Focus on quality over speed. It's better to make solid progress on one aspect than to rush through multiple areas poorly.`;

/**
 * Default reviewer prompt template
 */
export const DEFAULT_REVIEWER_PROMPT_TEMPLATE = `You are a code reviewer evaluating work done by a worker agent. Your job is to provide constructive feedback and decide whether the work meets quality standards.

## Original Task
\${taskDescription}

## Worker Output This Iteration
\${workerOutput}

## Previous Feedback History
\${previousFeedback}

## Review Criteria
1. Does the implementation match the requirements?
2. Is the code correct and well-tested?
3. Are there any bugs or edge cases missed?
4. Is the code maintainable and following best practices?

## Your Response
Provide your decision as JSON:
{
  "decision": "approve" | "reject" | "needs_changes",
  "feedback": "Overall assessment...",
  "specificIssues": ["Issue 1", "Issue 2"],
  "suggestedImprovements": ["Improvement 1", "Improvement 2"]
}

Be specific and actionable in your feedback. If approving, explain why the work is sufficient.`;

/**
 * Default Ralph Loop settings
 */
export const DEFAULT_RALPH_LOOP_SETTINGS: RalphLoopSettings = {
  defaultMaxTurns: 5,
  defaultWorkerModel: 'claude-opus-4-6',
  defaultReviewerModel: 'claude-sonnet-4-5-20250929',
  workerPromptTemplate: DEFAULT_WORKER_PROMPT_TEMPLATE,
  reviewerPromptTemplate: DEFAULT_REVIEWER_PROMPT_TEMPLATE,
};
