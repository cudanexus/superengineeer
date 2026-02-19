/**
 * API Response Type Definitions for Claudito Frontend
 *
 * This file contains all the response types returned by the backend API endpoints.
 * These types should match the actual data structures returned by the server.
 */

declare namespace Claudito.API {
  // ============================================================
  // System & Health Endpoints
  // ============================================================

  interface HealthResponse {
    status: 'ok' | 'degraded';
    version: string;
    timestamp: string;
  }

  interface DevStatusResponse {
    devMode: boolean;
  }

  interface ResourceStatus {
    runningCount: number;
    maxConcurrent: number;
    queuedCount: number;
    queuedProjects: string[];
  }

  interface LogEntry {
    level: 'error' | 'warn' | 'info' | 'debug';
    timestamp: string;
    message: string;
    source?: string;
    projectId?: string;
    metadata?: Record<string, any>;
    isFrontend?: boolean;
  }

  // ============================================================
  // Authentication
  // ============================================================

  interface LoginResponse {
    success: boolean;
    message?: string;
  }

  interface AuthStatusResponse {
    authenticated: boolean;
  }

  // ============================================================
  // Project Types
  // ============================================================

  interface Project {
    id: string;
    name: string;
    path: string;
    createdAt: string;
    updatedAt: string;
  }

  interface ProjectStatus extends Project {
    status?: any; // Extended project status data
    permissionOverrides?: {
      enabled: boolean;
      allowRules: string[];
      denyRules: string[];
      defaultMode?: 'acceptEdits' | 'plan';
    };
    modelOverride?: string;
  }

  interface CreateProjectRequest {
    name: string;
    path: string;
  }

  interface ConnectedClientData {
    clientId: string;
    projectId?: string;
    userAgent?: string;
    connectedAt: string;
    lastResourceUpdate?: string;
    resourceStats?: {
      total: number;
      loaded: number;
      failed: number;
      pending: number;
      runtime: number;
    };
  }

  interface ProjectDebugInfo {
    projectPath: string;
    agentProcess?: {
      pid: number;
      startTime: string;
      uptime: string;
      workingDirectory: string;
    };
    ralphLoops: any[];
    lastCommand?: string;
    connectedClients?: ConnectedClientData[];
  }

  interface OptimizationCheck {
    type: 'claude_md' | 'roadmap';
    exists: boolean;
    size?: number;
    lastModified?: string;
    path?: string;
    isGlobal?: boolean;
    suggestions?: string[];
  }

  // ============================================================
  // Settings Types
  // ============================================================

  interface Settings {
    maxConcurrentAgents: number;
    agentPromptTemplate?: string;
    appendSystemPrompt?: string;
    sendWithCtrlEnter?: boolean;
    historyLimit?: number;
    promptTemplates?: PromptTemplate[];
    defaultModel?: string;
    claudePermissions?: {
      dangerouslySkipPermissions?: boolean;
      defaultMode?: 'acceptEdits' | 'plan';
      allowRules?: string[];
      denyRules?: string[];
    };
  }

  interface Model {
    id: string;
    name: string;
    description?: string;
  }

  interface PromptTemplate {
    id: string;
    name: string;
    template: string;
    description?: string;
    variables?: TemplateVariable[];
  }

  interface TemplateVariable {
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    name: string;
    options?: string;
  }

  // ============================================================
  // Agent Types
  // ============================================================

  interface AgentStatus {
    running: boolean;
    pid?: number;
    mode?: 'interactive' | 'roadmap' | 'ralphLoop';
    sessionId?: string;
    waitingForResponse?: boolean;
    waitingVersion?: number;
    queuePosition?: number;
  }

  interface AgentStartRequest {
    message?: string;
    images?: Array<{
      dataUrl: string;
      mimeType: string;
    }>;
    sessionId?: string;
    permissionMode?: 'acceptEdits' | 'plan';
  }

  interface AgentMessageRequest {
    message: string;
    images?: Array<{
      dataUrl: string;
      mimeType: string;
    }>;
  }

  interface ContextUsage {
    used: number;
    total: number;
    percentage: number;
    percentageDisplay: string;
    breakdown?: {
      system: number;
      conversation: number;
      tools: number;
    };
  }

  interface LoopStatus {
    isRunning: boolean;
    iteration?: number;
    maxIterations?: number;
    startTime?: string;
  }

  // ============================================================
  // Conversation Types
  // ============================================================

  interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    toolUse?: ToolUse[];
    metadata?: {
      contextUsage?: ContextUsage;
    };
  }

  interface ToolUse {
    type: string;
    name: string;
    parameters?: any;
    result?: any;
    error?: string;
  }

  interface Conversation {
    id: string;
    projectId: string;
    messages: Message[];
    stats?: ConversationStats;
    metadata?: {
      contextUsage?: ContextUsage;
    };
  }

  interface ConversationListItem {
    id: string;
    label?: string;
    messageCount: number;
    lastMessageAt: string;
  }

  interface ConversationSearchRequest {
    query: string;
    filters?: {
      user?: boolean;
      assistant?: boolean;
      tool?: boolean;
      system?: boolean;
    };
    regex?: boolean;
    caseSensitive?: boolean;
    conversationId?: string;
  }

  // ============================================================
  // Roadmap Types
  // ============================================================

  interface Roadmap {
    phases: Phase[];
    raw: string;
  }

  interface Phase {
    id: string;
    title: string;
    description: string;
    milestones: Milestone[];
    status: 'pending' | 'in_progress' | 'completed';
  }

  interface Milestone {
    id: string;
    title: string;
    description?: string;
    tasks: Task[];
    status: 'pending' | 'in_progress' | 'completed';
  }

  interface Task {
    description: string;
    completed: boolean;
  }

  interface RoadmapGenerateRequest {
    prompt: string;
  }

  interface RoadmapModifyRequest {
    prompt: string;
  }

  interface RoadmapResponseRequest {
    response: string;
  }

  interface DeleteTaskRequest {
    phaseId: string;
    milestoneId: string;
    taskIndex: number;
  }

  interface DeleteMilestoneRequest {
    phaseId: string;
    milestoneId: string;
  }

  interface DeletePhaseRequest {
    phaseId: string;
  }

  interface SetNextItemRequest {
    phaseId: string;
    milestoneId: string;
    taskIndex?: number;
  }

  // ============================================================
  // Ralph Loop Types
  // ============================================================

  interface RalphLoopState {
    taskId: string;
    taskDescription: string;
    status: 'idle' | 'worker_running' | 'reviewer_running' | 'completed' | 'failed' | 'paused';
    currentIteration: number;
    maxTurns: number;
    workerModel: string;
    reviewerModel: string;
    startTime: string;
    endTime?: string;
    finalResult?: 'approved' | 'max_turns_reached' | 'critical_failure';
    iterations?: RalphLoopIteration[];
  }

  interface RalphLoopIteration {
    number: number;
    workerOutput?: string;
    reviewerFeedback?: string;
    decision?: 'approve' | 'reject' | 'critical_failure';
    timestamp: string;
  }

  interface StartRalphLoopRequest {
    taskDescription: string;
    maxTurns?: number;
    workerModel?: string;
    reviewerModel?: string;
  }

  // ============================================================
  // File System Types
  // ============================================================

  interface FileSystemEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isEditable?: boolean;
    size?: number;
    lastModified?: string;
  }

  interface FileContent {
    content: string;
    path: string;
    size: number;
    lastModified: string;
  }

  interface WriteFileRequest {
    path: string;
    content: string;
  }

  interface DeleteFileRequest {
    path: string;
    isDirectory: boolean;
  }

  interface CreateFolderRequest {
    path: string;
  }

  interface DriveInfo {
    letter: string;
    label?: string;
    type?: string;
  }

  // ============================================================
  // Git Types
  // ============================================================

  interface GitStatus {
    branch: string;
    ahead: number;
    behind: number;
    staged: FileChange[];
    unstaged: FileChange[];
    untracked: string[];
    conflicted: string[];
    renamed: Array<{ from: string; to: string }>;
    stashes?: GitStash[];
  }

  interface FileChange {
    path: string;
    status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '??';
    index?: string;
    working?: string;
  }

  interface GitBranch {
    name: string;
    current: boolean;
    remote?: string;
    lastCommit?: {
      hash: string;
      message: string;
      date: string;
    };
  }

  interface GitCommit {
    hash: string;
    message: string;
    author: string;
    date: string;
    parent?: string;
    body?: string;
  }

  interface GitDiff {
    path: string;
    additions: number;
    deletions: number;
    hunks: DiffHunk[];
  }

  interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
  }

  interface DiffLine {
    type: 'add' | 'del' | 'normal' | 'header';
    content: string;
    oldLine?: number;
    newLine?: number;
  }

  interface GitStash {
    index: number;
    message: string;
    branch: string;
    date: string;
  }

  interface GitOperation {
    type: 'stage' | 'unstage' | 'stash' | 'stashPop' | 'commit' | 'push' | 'pull';
    files?: string[];
    message?: string;
    options?: any;
  }

  // ============================================================
  // Shell Types
  // ============================================================

  interface ShellStatus {
    running: boolean;
    pid?: number;
    cwd?: string;
    command?: string;
  }

  interface ShellStartRequest {
    cwd?: string;
    env?: Record<string, string>;
  }

  interface ShellInputRequest {
    input: string;
  }

  interface ShellResizeRequest {
    cols: number;
    rows: number;
  }

  interface ShellOutput {
    type: 'stdout' | 'stderr';
    data: string;
  }

  // ============================================================
  // Error Response
  // ============================================================

  interface ErrorResponse {
    error: string;
    code?: string;
    details?: any;
  }
}