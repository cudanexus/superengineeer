# API Types Reference

Complete reference for all API response types in the Claudito frontend type system.

## Table of Contents

- [System & Health Types](#system--health-types)
- [Project Types](#project-types)
- [Agent Types](#agent-types)
- [Conversation Types](#conversation-types)
- [Roadmap Types](#roadmap-types)
- [Ralph Loop Types](#ralph-loop-types)
- [Git Types](#git-types)
- [Settings Types](#settings-types)
- [File System Types](#file-system-types)
- [Shell Types](#shell-types)

## System & Health Types

### HealthResponse
```typescript
interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
}
```

### ResourceStatus
```typescript
interface ResourceStatus {
  runningCount: number;
  maxConcurrent: number;
  queuedCount: number;
  queuedProjects: string[];
}
```

### LogEntry
```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: any;
  projectId?: string;
}
```

## Project Types

### Project
```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}
```

### ProjectStatus
```typescript
interface ProjectStatus extends Project {
  permissionOverrides?: {
    enabled: boolean;
    allowRules: string[];
    denyRules: string[];
    defaultMode?: 'acceptEdits' | 'plan';
  };
  modelOverride?: string;
}
```

### ProjectDebugInfo
```typescript
interface ProjectDebugInfo {
  agent: any;
  logs: LogEntry[];
  processes: ProcessInfo[];
  ralphLoop: any;
}
```

## Agent Types

### AgentStatus
```typescript
interface AgentStatus {
  running: boolean;
  pid?: number;
  mode?: 'interactive' | 'roadmap' | 'ralphLoop';
  sessionId?: string;
  waitingForResponse?: boolean;
  queuePosition?: number;
}
```

### ContextUsage
```typescript
interface ContextUsage {
  used: number;
  total: number;
  percentage: number;
  breakdown?: {
    system: number;
    conversation: number;
    tools: number;
  };
}
```

### LoopStatus
```typescript
interface LoopStatus {
  active: boolean;
  currentMilestone?: string;
}
```

## Conversation Types

### Message
```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolUse?: ToolUse[];
}
```

### ToolUse
```typescript
interface ToolUse {
  type: string;
  name: string;
  parameters?: any;
  result?: any;
  error?: string;
}
```

### Conversation
```typescript
interface Conversation {
  id: string;
  projectId: string;
  messages: Message[];
  stats: ConversationStats;
  metadata: ConversationMetadata;
}
```

### ConversationStats
```typescript
interface ConversationStats {
  messageCount: number;
  toolCallCount: number;
  userMessageCount: number;
  durationMs: number;
  startedAt: string;
  lastMessageAt: string;
  totalTokens?: number;
}
```

### ConversationMetadata
```typescript
interface ConversationMetadata {
  contextUsage?: ContextUsage;
}
```

### ConversationSummary
```typescript
interface ConversationSummary {
  id: string;
  label?: string;
  messageCount: number;
  lastMessageAt: string;
}
```

### SearchResult
```typescript
interface SearchResult {
  conversationId: string;
  messageId: string;
  content: string;
  timestamp: string;
}
```

## Roadmap Types

### Roadmap
```typescript
interface Roadmap {
  phases: Phase[];
  raw: string;
}
```

### Phase
```typescript
interface Phase {
  id: string;
  title: string;
  description: string;
  milestones: Milestone[];
  status: 'pending' | 'in_progress' | 'completed';
}
```

### Milestone
```typescript
interface Milestone {
  id: string;
  title: string;
  tasks: Task[];
  status: 'pending' | 'in_progress' | 'completed';
}
```

### Task
```typescript
interface Task {
  description: string;
  completed: boolean;
}
```

### RoadmapContent
```typescript
interface RoadmapContent {
  content: string;
  parsed: Roadmap;
}
```

## Ralph Loop Types

### RalphLoopState
```typescript
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
}
```

### RalphLoopConfig
```typescript
interface RalphLoopConfig {
  taskDescription: string;
  maxTurns?: number;
  workerModel?: string;
  reviewerModel?: string;
}
```

## Git Types

### GitStatus
```typescript
interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}
```

### FileChange
```typescript
interface FileChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U';
}
```

### GitBranches
```typescript
interface GitBranches {
  current: string;
  local: string[];
  remote: string[];
}
```

### GitTag
```typescript
interface GitTag {
  name: string;
  commit: string;
  date: string;
}
```

### GitCommitResult
```typescript
interface GitCommitResult {
  hash: string;
}
```

## Settings Types

### Settings
```typescript
interface Settings {
  maxConcurrentAgents: number;
  agentPromptTemplate: string;
  appendSystemPrompt?: string;
  sendWithCtrlEnter: boolean;
  historyLimit: number;
  defaultModel: string;
  promptTemplates?: PromptTemplate[];
  claudePermissions?: ClaudePermissions;
}
```

### PromptTemplate
```typescript
interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description?: string;
  variables?: TemplateVariable[];
}
```

### TemplateVariable
```typescript
interface TemplateVariable {
  type: 'text' | 'textarea' | 'select' | 'checkbox';
  name: string;
  label: string;
  options?: string[];
  defaultValue?: string | boolean;
}
```

### ClaudePermissions
```typescript
interface ClaudePermissions {
  dangerouslySkipPermissions?: boolean;
  defaultMode: 'acceptEdits' | 'plan';
  allowRules: string[];
  denyRules: string[];
}
```

### ModelInfo
```typescript
interface ModelInfo {
  id: string;
  displayName: string;
}
```

### ModelsResponse
```typescript
interface ModelsResponse {
  models: ModelInfo[];
}
```

## File System Types

### Drive
```typescript
interface Drive {
  name: string;
  path: string;
}
```

### DirectoryEntry
```typescript
interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isEditable?: boolean;
}
```

### ClaudeFile
```typescript
interface ClaudeFile {
  filePath: string;
  content: string;
  exists: boolean;
}
```

### Optimization
```typescript
interface Optimization {
  file: string;
  issue: string;
  recommendation: string;
}
```

### OptimizationResult
```typescript
interface OptimizationResult {
  suggestions: Optimization[];
}
```

## Shell Types

### ShellStatus
```typescript
interface ShellStatus {
  enabled: boolean;
}
```

### ShellStartResult
```typescript
interface ShellStartResult {
  pid: number;
}
```

### ShellRunningStatus
```typescript
interface ShellRunningStatus {
  running: boolean;
  pid?: number;
}
```

## Model Configuration Types

### ProjectModelConfig
```typescript
interface ProjectModelConfig {
  projectModel: string | null;
  effectiveModel: string;
  globalDefault: string;
}
```

## Error Response Types

### ApiError
```typescript
interface ApiError {
  error: string;
  message?: string;
  details?: any;
}
```

## Usage Examples

### Working with Projects

```javascript
// Get all projects
ApiClient.getProjects()
  .done(function(/** @type {Claudito.API.Project[]} */ projects) {
    projects.forEach(project => {
      console.log(`${project.name} at ${project.path}`);
    });
  });

// Get project with status
ApiClient.getProjectDetails(projectId)
  .done(function(/** @type {Claudito.API.ProjectStatus} */ project) {
    if (project.permissionOverrides?.enabled) {
      console.log('Custom permissions:', project.permissionOverrides.allowRules);
    }
  });
```

### Working with Agent Status

```javascript
// Check agent status
ApiClient.getAgentStatus(projectId)
  .done(function(/** @type {Claudito.API.AgentStatus} */ status) {
    if (status.running) {
      console.log(`Agent running in ${status.mode} mode`);
      if (status.waitingForResponse) {
        console.log('Agent is waiting for user input');
      }
    }
  });

// Monitor context usage
ApiClient.getContextUsage(projectId)
  .done(function(/** @type {Claudito.API.ContextUsage} */ usage) {
    console.log(`Using ${usage.percentage}% of context window`);
    console.log(`${usage.used} / ${usage.total} tokens`);
  });
```

### Working with Git

```javascript
// Get repository status
ApiClient.getGitStatus(projectId)
  .done(function(/** @type {Claudito.API.GitStatus} */ status) {
    console.log(`Branch: ${status.branch}`);
    console.log(`${status.staged.length} staged files`);
    console.log(`${status.unstaged.length} unstaged changes`);

    status.staged.forEach(file => {
      console.log(`${file.status} ${file.path}`);
    });
  });
```

### Working with Ralph Loop

```javascript
// Start Ralph Loop
const config = {
  taskDescription: 'Implement user authentication',
  maxTurns: 10,
  workerModel: 'claude-opus-4-6'
};

ApiClient.startRalphLoop(projectId, config)
  .done(function(/** @type {Claudito.API.RalphLoopState} */ state) {
    console.log(`Started loop ${state.taskId}`);
    console.log(`Status: ${state.status}`);
  });
```

## Type Safety Tips

1. **Always use type annotations** in JSDoc for better IDE support
2. **Check optional properties** with optional chaining (`?.`)
3. **Use type guards** for union types (e.g., `status === 'ok'`)
4. **Validate API responses** at runtime for critical operations
5. **Keep types synchronized** with backend API changes