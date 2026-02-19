/**
 * API Client Type Definitions
 * @module api-client
 */

declare module 'api-client' {
  // Base configuration
  export function setBaseUrl(url: string): void;
  export function getBaseUrl(): string;

  // Health & System
  export function getHealth(): JQuery.Promise<Superengineer-v5.API.HealthResponse >;
  export function getDevStatus(): JQuery.Promise<{ devMode: boolean }>;
  export function shutdownServer(): JQuery.Promise<void>;
  export function getAgentResourceStatus(): JQuery.Promise<Superengineer-v5.API.ResourceStatus >;
  export function getGlobalLogs(limit?: number): JQuery.Promise<Array<{
    timestamp: string;
    level: string;
    message: string;
    context?: any;
  }>>;

  // Projects
  export function getProjects(): JQuery.Promise<Array<Superengineer-v5.API.Project >>;
  export function addProject(data: { name: string; path: string }): JQuery.Promise<Superengineer-v5.API.Project >;
  export function deleteProject(id: string): JQuery.Promise<void>;
  export function getDebugInfo(id: string): JQuery.Promise<{
    agent: any;
    logs: Array<any>;
    processes: Array<any>;
    ralphLoop: any;
  }>;

  // Roadmap
  export function getProjectRoadmap(id: string): JQuery.Promise<{
    content: string;
    parsed: Superengineer-v5.API.Roadmap;
}>;
export function generateRoadmap(id: string, prompt: string): JQuery.Promise<void>;
export function modifyRoadmap(id: string, prompt: string): JQuery.Promise<void>;
export function sendRoadmapResponse(id: string, response: string): JQuery.Promise<void>;
export function deleteRoadmapTask(
  id: string,
  phaseId: string,
  milestoneId: string,
  taskIndex: number
): JQuery.Promise<void>;
export function deleteRoadmapMilestone(
  id: string,
  phaseId: string,
  milestoneId: string
): JQuery.Promise<void>;
export function deleteRoadmapPhase(id: string, phaseId: string): JQuery.Promise<void>;

// Agent
export function startAgent(id: string): JQuery.Promise<void>;
export function stopAgent(id: string): JQuery.Promise<void>;
export function getAgentStatus(id: string): JQuery.Promise<Superengineer-v5.API.AgentStatus >;
export function getLoopStatus(id: string): JQuery.Promise<{
  active: boolean;
  currentMilestone?: string;
}>;
export function startInteractiveAgent(
  id: string,
  message?: string,
  images?: Array<{ dataUrl: string; mimeType: string }>,
  sessionId?: string,
  permissionMode?: 'acceptEdits' | 'plan'
): JQuery.Promise<{ sessionId: string }>;
export function sendAgentMessage(
  id: string,
  message: string,
  images?: Array<{ dataUrl: string; mimeType: string }>
): JQuery.Promise<void>;

// Queue
export function getQueuedMessages(id: string): JQuery.Promise<Array<string>>;
export function removeFromQueue(id: string): JQuery.Promise<void>;
export function removeQueuedMessage(id: string, index: number): JQuery.Promise<void>;

// Conversations
export function getConversations(id: string): JQuery.Promise<Array<{
  id: string;
  label?: string;
  messageCount: number;
  lastMessageAt: string;
}>>;
export function getConversation(
  projectId: string,
  conversationId: string
): JQuery.Promise<Superengineer-v5.API.Conversation >;
export function searchConversationHistory(
  projectId: string,
  query: string
): JQuery.Promise<Array<{
  conversationId: string;
  messageId: string;
  content: string;
  timestamp: string;
}>>;
export function renameConversation(
  projectId: string,
  conversationId: string,
  label: string
): JQuery.Promise<void>;
export function setCurrentConversation(
  projectId: string,
  conversationId: string
): JQuery.Promise<void>;

// Claude Files
export function getClaudeFiles(projectId: string): JQuery.Promise<Array<{
  filePath: string;
  content: string;
  exists: boolean;
}>>;
export function saveClaudeFile(
  projectId: string,
  filePath: string,
  content: string
): JQuery.Promise<void>;
export function getOptimizations(projectId: string): JQuery.Promise<{
  suggestions: Array<{
    file: string;
    issue: string;
    recommendation: string;
  }>;
}>;

// Settings
export function getSettings(): JQuery.Promise<Superengineer-v5.API.Settings >;
export function updateSettings(settings: Partial<Superengineer-v5.API.Settings >): JQuery.Promise < Superengineer - v5.API.Settings >;
export function getAvailableModels(): JQuery.Promise<{
  models: Array<{ id: string; displayName: string }>;
}>;

// Project Model
export function getProjectModel(projectId: string): JQuery.Promise<{
  projectModel: string | null;
  effectiveModel: string;
  globalDefault: string;
}>;
export function setProjectModel(projectId: string, model: string | null): JQuery.Promise<void>;

// Filesystem
export function getDrives(): JQuery.Promise<Array<{ name: string; path: string }>>;
export function browseFolder(path: string): JQuery.Promise<Array<{
  name: string;
  path: string;
  isDirectory: true;
}>>;
export function browseWithFiles(path: string): JQuery.Promise<Array<{
  name: string;
  path: string;
  isDirectory: boolean;
  isEditable?: boolean;
}>>;
export function readFile(path: string): JQuery.Promise<string>;
export function writeFile(path: string, content: string): JQuery.Promise<void>;
export function createFolder(path: string): JQuery.Promise<void>;
export function deleteFileOrFolder(targetPath: string, isDirectory: boolean): JQuery.Promise<void>;

// Git
export function getGitStatus(projectId: string): JQuery.Promise<Superengineer-v5.API.GitStatus >;
export function getGitBranches(projectId: string): JQuery.Promise<{
  current: string;
  local: Array<string>;
  remote: Array<string>;
}>;
export function getGitUserName(projectId: string): JQuery.Promise<{ name: string | null }>;
export function getGitDiff(projectId: string, staged: boolean): JQuery.Promise<string>;
export function getGitFileDiff(
  projectId: string,
  filePath: string,
  staged: boolean
): JQuery.Promise<string>;
export function getGitTags(projectId: string): JQuery.Promise<Array<{
  name: string;
  commit: string;
  date: string;
}>>;
export function gitStage(projectId: string, paths: Array<string>): JQuery.Promise<void>;
export function gitStageAll(projectId: string): JQuery.Promise<void>;
export function gitUnstage(projectId: string, paths: Array<string>): JQuery.Promise<void>;
export function gitUnstageAll(projectId: string): JQuery.Promise<void>;
export function gitCommit(projectId: string, message: string): JQuery.Promise<{ hash: string }>;
export function gitCreateBranch(
  projectId: string,
  name: string,
  checkout: boolean
): JQuery.Promise<void>;
export function gitCheckout(projectId: string, branch: string): JQuery.Promise<void>;
export function gitPush(
  projectId: string,
  remote: string,
  branch: string,
  setUpstream?: boolean
): JQuery.Promise<void>;
export function gitPull(
  projectId: string,
  remote: string,
  branch: string
): JQuery.Promise<void>;
export function gitDiscard(projectId: string, paths: Array<string>): JQuery.Promise<void>;
export function gitCreateTag(
  projectId: string,
  name: string,
  message?: string
): JQuery.Promise<void>;
export function gitPushTag(
  projectId: string,
  name: string,
  remote: string
): JQuery.Promise<void>;

// Shell
export function isShellEnabled(projectId: string): JQuery.Promise<{ enabled: boolean }>;
export function startShell(projectId: string): JQuery.Promise<{ pid: number }>;
export function getShellStatus(projectId: string): JQuery.Promise<{
  running: boolean;
  pid?: number;
}>;
export function sendShellInput(projectId: string, input: string): JQuery.Promise<void>;
export function resizeShell(projectId: string, cols: number, rows: number): JQuery.Promise<void>;
export function stopShell(projectId: string): JQuery.Promise<void>;

// Ralph Loop
export function startRalphLoop(projectId: string, config: {
  taskDescription: string;
  maxTurns?: number;
  workerModel?: string;
  reviewerModel?: string;
}): JQuery.Promise<Superengineer-v5.API.RalphLoopState >;
export function stopRalphLoop(projectId: string, taskId: string): JQuery.Promise<void>;
export function pauseRalphLoop(projectId: string, taskId: string): JQuery.Promise<void>;
export function resumeRalphLoop(projectId: string, taskId: string): JQuery.Promise<void>;
export function getRalphLoops(projectId: string): JQuery.Promise<Array<Superengineer-v5.API.RalphLoopState >>;
export function getRalphLoopState(
  projectId: string,
  taskId: string
): JQuery.Promise<Superengineer-v5.API.RalphLoopState >;
export function deleteRalphLoop(projectId: string, taskId: string): JQuery.Promise<void>;

// Error Logging
export function logFrontendError(
  message: string,
  source: string,
  line: number,
  column: number,
  errorObj: Error,
  projectId?: string
): JQuery.Promise<void>;

// Authentication
export function init(): void;
export function getAuthStatus(): JQuery.Promise<{ authenticated: boolean }>;
export function logout(): JQuery.Promise<void>;
}