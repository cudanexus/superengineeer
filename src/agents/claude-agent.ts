import { ChildProcess, spawn, exec } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';

import { getLogger, Logger } from '../utils/logger';
import { McpServerConfig } from '../repositories/settings';

export type AgentStatus = 'stopped' | 'running' | 'error';
export type AgentMode = 'autonomous' | 'interactive';
const isWindows = process.platform === 'win32';

export interface ToolUseInfo {
  id?: string;
  name: string;
  input?: Record<string, unknown>;
  status?: 'running' | 'completed' | 'failed';
  claudeToolUseId?: string;
  resultContent?: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionInfo {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

export interface PermissionRequest {
  tool: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface PlanModeInfo {
  action: 'enter' | 'exit';
  planContent?: string;
}

export interface ResultInfo {
  isError: boolean;
}

export interface StatusChangeInfo {
  status: string;
}

export interface AgentMessage {
  type: 'stdout' | 'stderr' | 'system' | 'tool_use' | 'tool_result' | 'user' | 'question' | 'permission' | 'plan_mode' | 'compaction' | 'result' | 'status_change';
  content: string;
  timestamp: string;
  toolInfo?: ToolUseInfo;
  questionInfo?: QuestionInfo;
  permissionInfo?: PermissionRequest;
  planModeInfo?: PlanModeInfo;
  resultInfo?: ResultInfo;
  statusChangeInfo?: StatusChangeInfo;
  ralphLoopPhase?: 'worker' | 'reviewer';
}

export interface WaitingStatus {
  isWaiting: boolean;
  version: number;
}

export interface AgentEvents {
  message: (message: AgentMessage) => void;
  status: (status: AgentStatus) => void;
  exit: (code: number | null) => void;
  waitingForInput: (status: WaitingStatus) => void;
  sessionNotFound: (sessionId: string) => void;
}

export interface ProcessInfo {
  pid: number;
  cwd: string;
  startedAt: string;
}

export interface ContextUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  maxContextTokens: number;
  percentUsed: number;
}

export interface ClaudeAgent {
  readonly projectId: string;
  readonly status: AgentStatus;
  readonly mode: AgentMode;
  readonly lastCommand: string | null;
  readonly processInfo: ProcessInfo | null;
  readonly collectedOutput: string;
  readonly contextUsage: ContextUsage | null;
  readonly queuedMessageCount: number;
  readonly queuedMessages: string[];
  readonly isWaitingForInput: boolean;
  readonly waitingVersion: number;
  readonly sessionId: string | null;
  readonly sessionError: string | null;
  readonly permissionMode: 'acceptEdits' | 'plan' | null;
  start(instructions: string): void;
  stop(): Promise<void>;
  sendInput(input: string): void;
  removeQueuedMessage(index: number): boolean;
  on<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): void;
  off<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): void;
}

export interface ProcessSpawner {
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;
}

export interface SpawnOptions {
  cwd: string;
  shell: boolean;
  detached?: boolean;
}

function escapeArgForShell(arg: string): string {
  if (isWindows) {
    // Windows cmd.exe: wrap in double quotes if contains special chars
    // Internal double quotes are escaped by doubling them
    // Newlines must be removed/replaced as cmd.exe treats them as command separators
    const needsQuoting = /[\s"&|<>^()\n\r]/.test(arg);

    if (needsQuoting) {
      // Replace newlines with space - cmd.exe cannot handle literal newlines in args
      const sanitized = arg.replace(/\r?\n/g, ' ').replace(/"/g, '""');
      return `"${sanitized}"`;
    }
    return arg;
  } else {
    // Unix: wrap in single quotes (safest), escape internal single quotes
    if (/[\s"'&|<>()$`\\!*?[\]{}\n]/.test(arg)) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  }
}

function buildShellCommand(command: string, args: string[]): string {
  const escapedArgs = args.map(escapeArgForShell);
  return `${command} ${escapedArgs.join(' ')}`;
}

const defaultSpawner: ProcessSpawner = {
  spawn: (command, args, options) => {
    if (options.shell) {
      // Build properly escaped command string for shell execution
      const fullCommand = buildShellCommand(command, args);
      return spawn(fullCommand, [], options);
    }
    return spawn(command, args, options);
  },
};

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  content?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

interface StreamEventUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface StreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  tool_use_id?: string;
  is_error?: boolean;
  errors?: string[];
  result?: string;
  message?: {
    role?: string;
    content: ContentBlock[];
    usage?: StreamEventUsage;
  };
  delta?: {
    text?: string;
    partial_json?: string;
  };
  content_block?: ContentBlock;
  content?: string | Array<{ type: string; text?: string }>;
  usage?: StreamEventUsage;
}

export interface PermissionConfig {
  skipPermissions: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: 'acceptEdits' | 'plan';
  appendSystemPrompt?: string;
}

export interface AgentLimits {
  /** Maximum number of agentic turns before stopping (print mode only) */
  maxTurns?: number;
}

export interface AgentStreamingOptions {
  /** Include partial streaming events in output (requires stream-json output) */
  includePartialMessages?: boolean;
  /** Disable session persistence - sessions won't be saved to disk */
  noSessionPersistence?: boolean;
}

export interface ClaudeAgentConfig {
  projectId: string;
  projectPath: string;
  mode?: AgentMode;
  /** @deprecated Use permissions instead */
  skipPermissions?: boolean;
  permissions?: PermissionConfig;
  /** Agent limits (max turns, max budget) */
  limits?: AgentLimits;
  /** Streaming options (partial messages, session persistence) */
  streaming?: AgentStreamingOptions;
  processSpawner?: ProcessSpawner;
  /** Session ID to resume or create with a specific ID */
  sessionId?: string;
  /** If true, use --session-id to create new session. If false, use --resume to resume existing session. */
  isNewSession?: boolean;
  /** Claude model to use (e.g., 'claude-sonnet-4-20250514') */
  model?: string;
  /** MCP (Model Context Protocol) servers to connect */
  mcpServers?: McpServerConfig[];
}

export class DefaultClaudeAgent implements ClaudeAgent {
  readonly projectId: string;
  private readonly projectPath: string;
  private readonly _mode: AgentMode;
  private readonly _permissions: PermissionConfig;
  private readonly _limits: AgentLimits;
  private readonly _streaming: AgentStreamingOptions;
  private readonly processSpawner: ProcessSpawner;
  private readonly emitter: EventEmitter;
  private readonly logger: Logger;
  private process: ChildProcess | null = null;
  private _status: AgentStatus = 'stopped';
  private isStopping = false;
  private _lastCommand: string | null = null;
  private _processInfo: ProcessInfo | null = null;
  private _collectedOutput: string = '';
  private lineBuffer: string = '';
  private isProcessing = false;
  private inputQueue: string[] = [];
  private _contextUsage: ContextUsage | null = null;
  private _waitingVersion = 0;
  private _sessionId: string | null = null;
  private readonly _configuredSessionId: string | null = null;
  private readonly _isNewSession: boolean = true;
  private readonly _model: string | undefined;
  private readonly _mcpServers: McpServerConfig[];
  private _sessionError: string | null = null;
  private awaitingCompactionSummary = false;
  private lastInputWasCommand = false;

  // Claude Code uses 200k token context by default
  private static readonly DEFAULT_MAX_CONTEXT_TOKENS = 200000;

  constructor(config: ClaudeAgentConfig) {
    this.projectId = config.projectId;
    this.projectPath = config.projectPath;
    this._mode = config.mode || 'interactive';
    this._permissions = config.permissions ?? {
      skipPermissions: config.skipPermissions ?? true,
    };
    this._limits = config.limits ?? {};
    this._streaming = config.streaming ?? {};
    this.processSpawner = config.processSpawner || defaultSpawner;
    this.emitter = new EventEmitter();
    this.logger = getLogger('ClaudeAgent').withProject(config.projectId);
    this._configuredSessionId = config.sessionId || null;
    this._isNewSession = config.isNewSession ?? true;
    this._model = config.model;
    this._mcpServers = config.mcpServers || [];
  }

  get status(): AgentStatus {
    return this._status;
  }

  get mode(): AgentMode {
    return this._mode;
  }

  get lastCommand(): string | null {
    return this._lastCommand;
  }

  get processInfo(): ProcessInfo | null {
    return this._processInfo;
  }

  get collectedOutput(): string {
    return this._collectedOutput;
  }

  get contextUsage(): ContextUsage | null {
    return this._contextUsage;
  }

  get queuedMessageCount(): number {
    return this.inputQueue.length;
  }

  get queuedMessages(): string[] {
    return [...this.inputQueue];
  }

  get isWaitingForInput(): boolean {
    // In interactive mode, waiting when running but not processing
    // In autonomous mode, never waiting (unless there's a question)
    return this._mode === 'interactive' && this._status === 'running' && !this.isProcessing;
  }

  get waitingVersion(): number {
    return this._waitingVersion;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get sessionError(): string | null {
    return this._sessionError;
  }

  get permissionMode(): 'acceptEdits' | 'plan' | null {
    return this._permissions.permissionMode || null;
  }

  start(instructions: string): void {
    if (this.process) {
      return;
    }

    this.isStopping = false;
    this._collectedOutput = '';
    this.lineBuffer = '';
    this.setStatus('running');

    const args = this.buildArgs();
    const permMode = this._permissions.permissionMode || 'acceptEdits';
    this.emitMessage('system', `Starting Claude agent (permission mode: ${permMode})...`);
    this._lastCommand = `claude ${args.map((a) => this.escapeArg(a)).join(' ')} (prompt via stdin)`;

    this.logger.info('Starting Claude process', {
      command: this._lastCommand,
      mode: this._mode,
      cwd: this.projectPath,
    });

    this.process = this.processSpawner.spawn('claude', args, {
      cwd: this.projectPath,
      shell: true,
      detached: !isWindows, // Enable process group on Unix for proper cleanup
    });

    if (this.process.pid) {
      this._processInfo = {
        pid: this.process.pid,
        cwd: this.projectPath,
        startedAt: new Date().toISOString(),
      };
      this.logger.info('Claude process started', {
        pid: this.process.pid,
        hasStdin: !!this.process.stdin,
        hasStdout: !!this.process.stdout,
        hasStderr: !!this.process.stderr,
      });
    } else {
      this.logger.error('Claude process started but no PID assigned', {
        hasStdin: !!this.process.stdin,
        hasStdout: !!this.process.stdout,
        hasStderr: !!this.process.stderr,
      });
    }

    // Verify stdio streams are available
    if (!this.process.stdout) {
      this.logger.error('CRITICAL: stdout stream not available');
      this.emitMessage('stderr', 'ERROR: stdout stream not available');
    }

    if (!this.process.stdin) {
      this.logger.error('CRITICAL: stdin stream not available');
      this.emitMessage('stderr', 'ERROR: stdin stream not available');
    }

    this.setupProcessHandlers();

    // Write instructions to stdin using stream-json format
    if (this.process.stdin) {
      if (instructions && instructions.trim()) {
        // Mark as processing since we're sending initial instructions
        this.setProcessing(true);

        // Check if instructions is a JSON array (multimodal content)
        let content: string | unknown[] = instructions;
        let isMultimodal = false;

        try {
          const parsed: unknown = JSON.parse(instructions);

          if (Array.isArray(parsed)) {
            content = parsed as unknown[];
            isMultimodal = true;
          }
        } catch {
          // Not JSON, treat as plain text
        }

        // Format: {"type":"user","message":{"role":"user","content":"..."}}
        const message = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: content,
          },
        });

        this.logger.info('STDIN >>> Sending initial instructions', {
          direction: 'input',
          messageType: 'user',
          isMultimodal,
          contentLength: instructions.length,
          contentPreview: isMultimodal ? '[multimodal content]' : this.truncateForLog(instructions, 500),
        });

        const writeSuccess = this.process.stdin.write(message + '\n');
        this.logger.info('STDIN >>> Write result', {
          success: writeSuccess,
          bufferFull: !writeSuccess,
          messageLength: message.length,
        });

        if (!writeSuccess) {
          this.logger.warn('STDIN buffer full, waiting for drain');
        }
      }

      // In autonomous mode, close stdin after writing instructions
      // In interactive mode, keep stdin open for user input
      if (this._mode === 'autonomous') {
        this.process.stdin.end();
      }
    }
  }

  private truncateForLog(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;

    return str.substring(0, maxLen) + `... [truncated, total ${str.length} chars]`;
  }

  private escapeArg(arg: string): string {
    if (arg.includes(' ') || arg.includes('"') || arg.includes('\n')) {
      return `"${arg.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }

    return arg;
  }

  async stop(): Promise<void> {
    if (!this.process || this.isStopping) {
      return;
    }

    this.isStopping = true;
    this.awaitingCompactionSummary = false;
    this.lastInputWasCommand = false;
    this.emitMessage('system', 'Stopping Claude agent...');

    // Remove stdout/stderr listeners to prevent buffered output from being emitted
    this.process.stdout?.removeAllListeners('data');
    this.process.stderr?.removeAllListeners('data');

    const pid = this.process.pid;

    if (!pid) {
      this.process = null;
      return;
    }

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const forceKillTimeout = setTimeout(() => {
        this.forceKillProcess(pid);
      }, 5000);

      this.process.once('exit', () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });

      this.killProcessTree(pid);
    });
  }

  private killProcessTree(pid: number): void {
    if (isWindows) {
      // Windows: taskkill with /T kills the process tree
      exec(`taskkill /PID ${pid} /T`, () => {});
    } else {
      // Unix: Send SIGTERM to process group
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        // If process group kill fails, try direct kill
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Process may already be dead
        }
      }
    }
  }

  private forceKillProcess(pid: number): void {
    if (isWindows) {
      // Windows: Force kill with /F flag
      exec(`taskkill /PID ${pid} /T /F`, () => {});
    } else {
      // Unix: SIGKILL
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process may already be dead
        }
      }
    }
  }

  sendInput(input: string): void {
    if (this._status !== 'running') {
      this.logger.debug('sendInput ignored - agent not running', { status: this._status });
      return;
    }

    if (!this.process?.stdin || this.process.stdin.destroyed) {
      this.logger.warn('sendInput failed - stdin not available');
      this.emitMessage('stderr', 'Cannot send input: stdin is not available');
      return;
    }

    // If already processing, queue the message
    if (this.isProcessing) {
      this.inputQueue.push(input);
      this.logger.info('Message queued', {
        queueLength: this.inputQueue.length,
        contentPreview: this.truncateForLog(input, 200),
      });
      const preview = this.getMessagePreview(input);
      this.emitMessage('system', `⏳ Queued (#${this.inputQueue.length}): ${preview}`);
      return;
    }

    this.writeInputToStdin(input);
  }

  removeQueuedMessage(index: number): boolean {
    if (index < 0 || index >= this.inputQueue.length) {
      this.logger.warn('removeQueuedMessage failed - invalid index', {
        index,
        queueLength: this.inputQueue.length,
      });
      return false;
    }

    const removed = this.inputQueue.splice(index, 1);
    this.logger.info('Message removed from queue', {
      index,
      queueLength: this.inputQueue.length,
      removedPreview: removed[0] ? this.truncateForLog(removed[0], 100) : '(empty)',
    });
    const preview = removed[0] ? this.getMessagePreview(removed[0]) : '(empty)';
    this.emitMessage('system', `🗑️ Removed from queue: ${preview}`);
    return true;
  }

  private writeInputToStdin(input: string): void {
    if (!this.process?.stdin) {
      this.logger.error('STDIN >>> Cannot send message - stdin not available', {
        hasProcess: !!this.process,
        hasStdin: !!this.process?.stdin,
      });
      this.emitMessage('stderr', 'Cannot send message - stdin not available');
      return;
    }

    if (this.process.stdin.destroyed) {
      this.logger.error('STDIN >>> Cannot send message - stdin destroyed', {
        destroyed: true,
      });
      this.emitMessage('stderr', 'Cannot send message - stdin destroyed');
      return;
    }

    // Reset duplicate tracking when user sends input
    this.lastQuestionContent = null;
    this.lastPlanModeAction = null;

    // Track if input is a command (starts with /)
    this.lastInputWasCommand = input.trim().startsWith('/');

    this.setProcessing(true);

    // Check if input is a JSON array (multimodal content)
    let content: string | unknown[] = input;
    let isMultimodal = false;

    try {
      const parsed: unknown = JSON.parse(input);

      if (Array.isArray(parsed)) {
        content = parsed as unknown[];
        isMultimodal = true;
      }
    } catch {
      // Not JSON, treat as plain text
    }

    // Format input as stream-json message
    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: content,
      },
    });

    this.logger.info('STDIN >>> Sending user message', {
      direction: 'input',
      messageType: 'user',
      isMultimodal,
      contentLength: input.length,
      contentPreview: isMultimodal ? '[multimodal content]' : this.truncateForLog(input, 500),
    });

    const writeSuccess = this.process.stdin.write(message + '\n');
    this.logger.info('STDIN >>> Write result', {
      success: writeSuccess,
      bufferFull: !writeSuccess,
      messageLength: message.length,
    });

    if (!writeSuccess) {
      this.logger.warn('STDIN buffer full, waiting for drain');
    }
  }

  private processNextQueuedInput(): void {
    if (this.inputQueue.length === 0) {
      return;
    }

    const nextInput = this.inputQueue.shift()!;
    const preview = this.getMessagePreview(nextInput);
    const remaining = this.inputQueue.length > 0 ? ` (${this.inputQueue.length} remaining)` : '';
    this.emitMessage('system', `▶️ Processing queued: ${preview}${remaining}`);
    this.writeInputToStdin(nextInput);
  }

  private setProcessing(processing: boolean): void {
    const wasWaiting = this.isWaitingForInput;
    this.isProcessing = processing;
    const isWaiting = this.isWaitingForInput;

    if (wasWaiting !== isWaiting) {
      this._waitingVersion++;
      this.emitter.emit('waitingForInput', { isWaiting, version: this._waitingVersion });
    }
  }

  on<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): void {
    this.emitter.off(event, listener);
  }

  private buildArgs(): string[] {
    const args: string[] = [];

    // Use --print mode for non-interactive piped I/O
    args.push('--print');

    // Add model selection
    if (this._model) {
      args.push('--model', this._model);
    }

    // Add permission-related arguments
    this.addPermissionArgs(args);

    // Add agent limits
    this.addLimitArgs(args);

    // Add streaming options
    this.addStreamingArgs(args);

    // Add MCP server configurations
    this.addMcpServerArgs(args);

    // Add plugin directory
    const pluginPath = path.join(this.projectPath, 'claudito-plugin');
    args.push('--plugin-dir', pluginPath);

    // Handle session ID: use --session-id for new sessions, --resume for existing
    if (this._configuredSessionId) {
      if (this._isNewSession) {
        // Create a new session with a specific ID
        args.push('--session-id', this._configuredSessionId);
      } else {
        // Resume an existing session
        args.push('--resume', this._configuredSessionId);
      }
    }

    // stream-json for both input and output (only works with --print)
    args.push('--input-format', 'stream-json');
    args.push('--output-format', 'stream-json');
    args.push('--verbose');

    return args;
  }

  private addPermissionArgs(args: string[]): void {
    if (this._permissions.skipPermissions) {
      args.push('--dangerously-skip-permissions');
      return;
    }

    if (this._permissions.permissionMode) {
      args.push('--permission-mode', this._permissions.permissionMode);
    }

    if (this._permissions.allowedTools && this._permissions.allowedTools.length > 0) {
      // Claude CLI expects tools as a single space-separated string
      // Node.js spawn handles quoting automatically when using args array
      const toolsArg = this._permissions.allowedTools.join(' ');
      args.push('--allowedTools', toolsArg);
    }

    if (this._permissions.disallowedTools && this._permissions.disallowedTools.length > 0) {
      // Claude CLI expects tools as a single space-separated string
      const toolsArg = this._permissions.disallowedTools.join(' ');
      args.push('--disallowedTools', toolsArg);
    }

    if (this._permissions.appendSystemPrompt && this._permissions.appendSystemPrompt.trim().length > 0) {
      args.push('--append-system-prompt', this._permissions.appendSystemPrompt.trim());
    }
  }

  private addLimitArgs(args: string[]): void {
    if (this._limits.maxTurns !== undefined && this._limits.maxTurns > 0) {
      args.push('--max-turns', String(this._limits.maxTurns));
    }
  }

  private addStreamingArgs(args: string[]): void {
    if (this._streaming.includePartialMessages) {
      args.push('--include-partial-messages');
    }

    if (this._streaming.noSessionPersistence) {
      args.push('--no-session-persistence');
    }
  }

  private addMcpServerArgs(args: string[]): void {
    if (!this._mcpServers || this._mcpServers.length === 0) {
      return;
    }

    for (const server of this._mcpServers) {
      if (!server.enabled) continue;

      if (server.type === 'stdio') {
        // Format: --mcp-server name=stdio://command args...
        const serverSpec = `${server.name}=stdio://${server.command}`;
        if (server.args && server.args.length > 0) {
          args.push('--mcp-server', `${serverSpec} ${server.args.join(' ')}`);
        } else {
          args.push('--mcp-server', serverSpec);
        }

        // Add environment variables
        if (server.env) {
          for (const [key, value] of Object.entries(server.env)) {
            args.push('--mcp-server-env', `${server.name}:${key}=${value}`);
          }
        }
      } else if (server.type === 'http') {
        // Format: --mcp-server name=http://url
        args.push('--mcp-server', `${server.name}=http://${server.url}`);

        // Add headers
        if (server.headers) {
          for (const [key, value] of Object.entries(server.headers)) {
            args.push('--mcp-server-header', `${server.name}:${key}=${value}`);
          }
        }
      }
    }
  }

  private setupProcessHandlers(): void {
    if (!this.process) {
      return;
    }

    this.lineBuffer = '';

    // Set up stdin error handling
    if (this.process.stdin) {
      this.process.stdin.on('error', (err) => {
        this.logger.error('STDIN error', {
          error: err.message,
          code: (err as NodeJS.ErrnoException).code,
        });
        this.emitMessage('stderr', `stdin error: ${err.message}`);
      });

      this.process.stdin.on('close', () => {
        this.logger.info('STDIN closed');
      });
    }

    this.process.stdout?.on('data', (data: Buffer) => {
      const content = data.toString();

      // Log raw stdout data - use larger limit for errors
      const isError = content.includes('error') || content.includes('Error');
      this.logger.debug('STDOUT <<< Raw data received', {
        direction: 'output',
        bytes: data.length,
        preview: this.truncateForLog(content, isError ? 2000 : 500),
      });

      this.lineBuffer += content;
      const lines = this.lineBuffer.split('\n');
      this.lineBuffer = lines.pop() || '';

      this.logger.debug('STDOUT <<< Parsed lines', {
        completeLines: lines.length,
        bufferRemainder: this.lineBuffer.length,
      });

      for (const line of lines) {
        if (!line.trim()) continue;
        this.processStreamLine(line);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const content = data.toString();
      this.logger.warn('STDERR <<< Error output', {
        direction: 'output',
        stream: 'stderr',
        content: this.truncateForLog(content, 500),
      });

      // Detect session ID already in use error
      if (content.includes('Session ID') && content.includes('already in use')) {
        this._sessionError = content.trim();
        this.logger.warn('Session ID conflict detected', { error: this._sessionError });
      }

      this.emitMessage('stderr', content);
    });

    this.process.on('exit', (code) => {
      // Process any remaining content in buffer
      if (this.lineBuffer.trim()) {
        this.processStreamLine(this.lineBuffer);
      }

      this.handleExit(code);
    });

    this.process.on('error', (err) => {
      this.logger.error('Claude process error', {
        error: err.message,
        stack: err.stack,
      });
      this.emitMessage('stderr', `Process error: ${err.message}`);
      this.setStatus('error');
    });
  }

  private processStreamLine(line: string): void {
    try {
      const parsed: unknown = JSON.parse(line);

      if (typeof parsed !== 'object' || parsed === null) {
        if (line.trim()) {
          this.emitMessage('stdout', line);
        }
        return;
      }

      const event = parsed as StreamEvent;

      // Log the raw event from Claude - use info level for important events, debug for streaming deltas
      const isStreamingDelta = event.type === 'content_block_delta';
      const logMethod = isStreamingDelta ? 'debug' : 'info';
      this.logger[logMethod]('STDOUT <<< Stream event', {
        direction: 'output',
        eventType: event.type,
        eventSubtype: event.subtype,
        rawLength: line.length,
      });

      this.handleStreamEvent(event);
    } catch {
      // Not JSON or parse error - emit as plain text
      if (line.trim()) {
        this.logger.info('STDOUT <<< Non-JSON output', {
          direction: 'output',
          content: this.truncateForLog(line, 300),
        });
        this.emitMessage('stdout', line);
      }
    }
  }

  private handleStreamEvent(event: StreamEvent): void {
    // Track usage from any event that contains it
    this.updateUsageFromEvent(event);

    switch (event.type) {
      case 'assistant': {
        const content = event.message?.content || [];
        const blocks = content.map((block: { type: string; text?: string; name?: string; id?: string }) => {
          if (block.type === 'text') {
            return {
              type: 'text',
              length: block.text?.length || 0,
              preview: block.text?.substring(0, 100) || '',
            };
          }

          if (block.type === 'tool_use') {
            return {
              type: 'tool_use',
              name: block.name,
              id: block.id,
            };
          }

          return { type: block.type };
        });

        const usage = event.message?.usage;

        this.logger.info('STDOUT <<< Assistant message', {
          direction: 'output',
          eventType: 'assistant',
          contentBlocks: content.length,
          blocks,
          ...(usage && {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
          }),
        });
        this.handleAssistantEvent(event);
        break;
      }

      case 'content_block_delta':
        if (event.delta?.text) {
          this.emitMessage('stdout', event.delta.text);
        }
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          // Ensure we're marked as processing while using tools
          this.setProcessing(true);
          this.logger.info('STDOUT <<< Tool use started', {
            direction: 'output',
            eventType: 'tool_use',
            toolName: event.content_block.name,
            toolInput: event.content_block.input,
          });
        }
        this.handleContentBlockStart(event);
        break;

      case 'content_block_stop':
        // Tool execution completed
        this.logger.debug('STDOUT <<< Content block stop', {
          direction: 'output',
          eventType: 'content_block_stop',
        });
        // Emit tool result to update the tool's status in the UI
        this.emitToolResult('completed');
        break;

      case 'result': {
        const resultContent = event.result || '';

        this.logger.info('STDOUT <<< Result event', {
          direction: 'output',
          eventType: 'result',
          subtype: event.subtype,
          isError: event.is_error,
          errors: event.errors,
          lastInputWasCommand: this.lastInputWasCommand,
          resultContent: resultContent,
        });

        // Only emit result content for commands (like /compact, /help, etc.)
        // Regular assistant responses are already streamed via content_block_delta
        if (resultContent && this.lastInputWasCommand) {
          this.emitResultMessage(resultContent, event.is_error || false);
        }

        // Handle errors in result
        if (event.is_error && event.errors && event.errors.length > 0) {
          this.handleResultErrors(event.errors);
        }

        this.setProcessing(false);
        this.lastInputWasCommand = false;
        this.processNextQueuedInput();
        break;
      }

      case 'system':
        if (event.subtype === 'init') {
          // Capture session ID from Claude
          if (event.session_id) {
            this._sessionId = event.session_id;
          }

          this.logger.info('STDOUT <<< System init', {
            direction: 'output',
            eventType: 'system',
            sessionId: event.session_id,
          });
        } else if (event.subtype === 'status') {
          // Status change event (e.g., compacting)
          const status = (event as unknown as { status: string }).status;
          this.logger.info('STDOUT <<< System status', {
            direction: 'output',
            eventType: 'system',
            subtype: event.subtype,
            status,
          });
          this.emitStatusChangeMessage(status);
        } else if (event.subtype === 'compact_boundary') {
          // Compaction boundary event - summary will follow in the next user message
          const metadata = (event as unknown as { compact_metadata?: { trigger?: string; pre_tokens?: number } }).compact_metadata;
          this.logger.info('STDOUT <<< Compaction boundary', {
            direction: 'output',
            eventType: 'system',
            subtype: event.subtype,
            sessionId: event.session_id,
            compactMetadata: metadata,
          });
          this.awaitingCompactionSummary = true;
        } else if (event.subtype === 'compact' || event.subtype === 'summary') {
          // Context compaction/summarization event
          this.logger.info('STDOUT <<< Context compaction', {
            direction: 'output',
            eventType: 'system',
            subtype: event.subtype,
          });
          const summary = this.extractEventContent(event);
          this.emitCompactionMessage(summary);
        }
        break;

      case 'compact':
      case 'summary': {
        // Handle top-level compaction events (alternative format)
        this.logger.info('STDOUT <<< Context compaction', {
          direction: 'output',
          eventType: event.type,
        });
        const compactionContent = this.extractEventContent(event);
        this.emitCompactionMessage(compactionContent);
        break;
      }

      case 'user':
        this.handleUserEvent(event);
        break;

      default:
        this.logger.info('STDOUT <<< Unhandled event type', {
          direction: 'output',
          eventType: event.type,
          event: JSON.stringify(event).substring(0, 500),
        });
        break;
    }
  }

  private updateUsageFromEvent(event: StreamEvent): void {
    const usage = event.usage || event.message?.usage;

    if (!usage) {
      return;
    }

    // Claude Code CLI reports token usage per API call/response, not cumulatively.
    // We need to track the latest values from each event, as they represent the
    // running total for the current conversation context.
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadInputTokens = usage.cache_read_input_tokens || 0;

    // Log token updates for debugging
    this.logger.debug('Token usage update', {
      eventType: event.type,
      incoming: { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens },
      previous: this._contextUsage
        ? {
            inputTokens: this._contextUsage.inputTokens,
            outputTokens: this._contextUsage.outputTokens,
          }
        : null,
    });

    // Use the values directly from the event - they represent the conversation's context usage.
    // Only take maximum if the new value is greater (handles cumulative reporting).
    // If new value is less, it likely means a fresh context window was started.
    const prevUsage = this._contextUsage;
    const finalInputTokens = Math.max(inputTokens, prevUsage?.inputTokens || 0);
    const finalOutputTokens = Math.max(outputTokens, prevUsage?.outputTokens || 0);
    const finalCacheCreation = Math.max(cacheCreationInputTokens, prevUsage?.cacheCreationInputTokens || 0);
    const finalCacheRead = Math.max(cacheReadInputTokens, prevUsage?.cacheReadInputTokens || 0);

    const totalTokens = finalInputTokens + finalOutputTokens;
    const maxContextTokens = DefaultClaudeAgent.DEFAULT_MAX_CONTEXT_TOKENS;
    const percentUsed = Math.round((totalTokens / maxContextTokens) * 100 * 10) / 10;

    this._contextUsage = {
      inputTokens: finalInputTokens,
      outputTokens: finalOutputTokens,
      totalTokens,
      cacheCreationInputTokens: finalCacheCreation,
      cacheReadInputTokens: finalCacheRead,
      maxContextTokens,
      percentUsed,
    };
  }

  private handleResultErrors(errors: string[]): void {
    // Check for session not found error
    const sessionNotFoundPattern = /No conversation found with session ID: ([a-f0-9-]+)/i;

    for (const error of errors) {
      const match = error.match(sessionNotFoundPattern);

      if (match) {
        const missingSessionId = match[1];
        this.logger.warn('Session not found error detected', {
          missingSessionId,
          configuredSessionId: this._configuredSessionId,
        });

        // Emit session not found event for the agent manager to handle
        this.emitter.emit('sessionNotFound', missingSessionId);

        // Also show a user-friendly message
        this.emitMessage('stderr', `Session not found: ${missingSessionId}. Creating new conversation...`);
        return;
      }

      // For other errors, just display them
      this.emitMessage('stderr', `Error: ${error}`);
    }
  }

  private handleAssistantEvent(event: StreamEvent): void {
    if (!event.message?.content) return;

    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) {
        this.emitMessage('stdout', block.text);
      } else if (block.type === 'tool_use' && block.name) {
        this.emitToolMessage(block.name, block.input);
      }
    }
  }

  private handleContentBlockStart(event: StreamEvent): void {
    const block = event.content_block;

    if (!block) return;

    if (block.type === 'tool_use' && block.name) {
      this.emitToolMessage(block.name, block.input, block.id);
    }
  }

  private handleUserEvent(event: StreamEvent): void {
    if (!event.message?.content) return;

    for (const block of event.message.content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        this.logger.debug('STDOUT <<< Tool result', {
          direction: 'output',
          eventType: 'user',
          toolUseId: block.tool_use_id,
          isError: block.is_error,
          contentPreview: typeof block.content === 'string'
            ? block.content.substring(0, 100)
            : undefined,
        });

        // Emit tool result with the tool_use_id for matching
        this.emitToolResultWithId(
          block.tool_use_id,
          block.is_error ? 'failed' : 'completed',
          typeof block.content === 'string' ? block.content : undefined
        );
      } else if (block.type === 'text' && block.text && this.awaitingCompactionSummary) {
        // This is the compaction summary following a compact_boundary event
        this.logger.info('STDOUT <<< Compaction summary from user message', {
          direction: 'output',
          eventType: 'user',
          summaryLength: block.text.length,
          summaryPreview: block.text.substring(0, 200),
        });
        this.awaitingCompactionSummary = false;
        this.emitCompactionMessage(block.text);
      }
    }
  }

  private toolCounter = 0;
  private activeToolId: string | null = null;
  private activeToolName: string | null = null;
  private activeClaudeToolUseId: string | null = null;
  private toolIdMap: Map<string, { internalId: string; name: string }> = new Map();
  private lastPlanModeAction: 'enter' | 'exit' | null = null;
  private lastQuestionContent: string | null = null;

  private emitToolMessage(name: string, input?: Record<string, unknown>, claudeToolUseId?: string): void {
    // Handle AskUserQuestion specially
    if (name === 'AskUserQuestion' && input) {
      this.emitQuestionMessage(input);
      return;
    }

    // Handle EnterPlanMode specially
    if (name === 'EnterPlanMode') {
      this.emitPlanModeMessage('enter');
      return;
    }

    // Handle ExitPlanMode specially
    if (name === 'ExitPlanMode') {
      this.emitPlanModeMessage('exit');
      return;
    }

    const toolId = `tool-${Date.now()}-${++this.toolCounter}`;
    this.activeToolId = toolId;
    this.activeToolName = name;
    this.activeClaudeToolUseId = claudeToolUseId || null;

    // Store mapping from Claude's tool_use_id to our internal ID
    if (claudeToolUseId) {
      this.toolIdMap.set(claudeToolUseId, { internalId: toolId, name });
    }

    const toolInfo: ToolUseInfo = {
      id: toolId,
      name,
      input,
      status: 'running',
      claudeToolUseId,
    };

    const content = this.formatToolContent(name, input);

    const message: AgentMessage = {
      type: 'tool_use',
      content,
      timestamp: new Date().toISOString(),
      toolInfo,
    };

    this.emitter.emit('message', message);
  }

  private emitToolResult(status: 'completed' | 'failed'): void {
    if (!this.activeToolId || !this.activeToolName) {
      return;
    }

    const toolInfo: ToolUseInfo = {
      id: this.activeToolId,
      name: this.activeToolName,
      status,
      claudeToolUseId: this.activeClaudeToolUseId || undefined,
    };

    const message: AgentMessage = {
      type: 'tool_result',
      content: `Tool ${this.activeToolName} ${status}`,
      timestamp: new Date().toISOString(),
      toolInfo,
    };

    this.emitter.emit('message', message);
    this.activeToolId = null;
    this.activeToolName = null;
    this.activeClaudeToolUseId = null;
  }

  private emitToolResultWithId(
    claudeToolUseId: string,
    status: 'completed' | 'failed',
    resultContent?: string
  ): void {
    const toolMapping = this.toolIdMap.get(claudeToolUseId);

    if (!toolMapping) {
      this.logger.debug('Tool result received for unknown tool_use_id', {
        claudeToolUseId,
        status,
      });
      return;
    }

    const toolInfo: ToolUseInfo = {
      id: toolMapping.internalId,
      name: toolMapping.name,
      status,
      claudeToolUseId,
      resultContent,
    };

    const displayContent = resultContent
      ? `Tool ${toolMapping.name} ${status}: ${resultContent.substring(0, 200)}${resultContent.length > 200 ? '...' : ''}`
      : `Tool ${toolMapping.name} ${status}`;

    const message: AgentMessage = {
      type: 'tool_result',
      content: displayContent,
      timestamp: new Date().toISOString(),
      toolInfo,
    };

    this.emitter.emit('message', message);

    // Clean up the mapping after we've processed the result
    this.toolIdMap.delete(claudeToolUseId);
  }

  private emitQuestionMessage(input: Record<string, unknown>): void {
    const questions = input.questions as Array<{
      question: string;
      header?: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }> | undefined;

    if (!questions || questions.length === 0) return;

    // Handle the first question (most common case)
    const q = questions[0];

    if (!q) return;

    // Prevent duplicate question messages
    if (this.lastQuestionContent === q.question) {
      this.logger.debug('Skipping duplicate question message', { question: q.question });
      return;
    }
    this.lastQuestionContent = q.question;

    const questionInfo: QuestionInfo = {
      question: q.question,
      header: q.header,
      options: q.options.map((opt) => ({
        label: opt.label,
        description: opt.description,
      })),
      multiSelect: q.multiSelect,
    };

    const message: AgentMessage = {
      type: 'question',
      content: q.question,
      timestamp: new Date().toISOString(),
      questionInfo,
    };

    this.emitter.emit('message', message);
  }

  private emitPlanModeMessage(action: 'enter' | 'exit'): void {
    // Prevent duplicate consecutive plan mode messages
    if (this.lastPlanModeAction === action) {
      this.logger.debug('Skipping duplicate plan mode message', { action });
      return;
    }

    this.lastPlanModeAction = action;

    const planModeInfo: PlanModeInfo = { action };

    const content = action === 'enter'
      ? 'Claude entered plan mode - reviewing approach before implementation'
      : 'Claude is ready to execute the plan';

    const message: AgentMessage = {
      type: 'plan_mode',
      content,
      timestamp: new Date().toISOString(),
      planModeInfo,
    };

    this.emitter.emit('message', message);
  }

  private formatToolContent(name: string, input?: Record<string, unknown>): string {
    if (!input) return `Using tool: ${name}`;

    // Format based on tool type
    switch (name) {
      case 'Read':
        return this.formatReadTool(input);
      case 'Write':
        return this.formatWriteTool(input);
      case 'Edit':
        return this.formatEditTool(input);
      case 'Bash':
        return `Running: ${this.truncate(String(input.command ?? ''), 80)}`;
      case 'Glob':
        return this.formatGlobTool(input);
      case 'Grep':
        return this.formatGrepTool(input);
      case 'Task':
        return this.formatTaskTool(input);
      case 'WebFetch':
        return this.formatWebFetchTool(input);
      case 'WebSearch':
        return `Searching web: ${this.truncate(String(input.query ?? ''), 60)}`;
      default:
        return `Using tool: ${name}`;
    }
  }

  private formatReadTool(input: Record<string, unknown>): string {
    const filePath = String(input.file_path ?? 'file');
    const parts = [filePath];

    if (input.offset !== undefined || input.limit !== undefined) {
      const offset = input.offset !== undefined ? `offset: ${String(input.offset)}` : '';
      const limit = input.limit !== undefined ? `limit: ${String(input.limit)}` : '';
      const range = [offset, limit].filter(Boolean).join(', ');
      parts.push(`(${range})`);
    }

    return `Reading: ${parts.join(' ')}`;
  }

  private formatWriteTool(input: Record<string, unknown>): string {
    const filePath = String(input.file_path ?? 'file');
    const contentLen = typeof input.content === 'string' ? input.content.length : 0;

    if (contentLen > 0) {
      return `Writing: ${filePath} (${this.formatBytes(contentLen)})`;
    }

    return `Writing: ${filePath}`;
  }

  private formatEditTool(input: Record<string, unknown>): string {
    const filePath = String(input.file_path ?? 'file');
    const oldLen = typeof input.old_string === 'string' ? input.old_string.length : 0;
    const newLen = typeof input.new_string === 'string' ? input.new_string.length : 0;

    if (oldLen > 0 || newLen > 0) {
      return `Editing: ${filePath} (${oldLen} → ${newLen} chars)`;
    }

    return `Editing: ${filePath}`;
  }

  private formatGlobTool(input: Record<string, unknown>): string {
    const pattern = String(input.pattern ?? 'files');
    const searchPath = input.path ? ` in ${this.truncate(String(input.path), 30)}` : '';
    return `Glob: ${pattern}${searchPath}`;
  }

  private formatGrepTool(input: Record<string, unknown>): string {
    const pattern = this.truncate(String(input.pattern ?? ''), 40);
    const parts = [`"${pattern}"`];

    if (input.path) {
      parts.push(`in ${this.truncate(String(input.path), 25)}`);
    }

    if (input.glob) {
      parts.push(`(${String(input.glob)})`);
    } else if (input.type) {
      parts.push(`(*.${String(input.type)})`);
    }

    if (input.output_mode && input.output_mode !== 'files_with_matches') {
      parts.push(`[${String(input.output_mode)}]`);
    }

    if (input.head_limit) {
      parts.push(`limit: ${String(input.head_limit)}`);
    }

    return `Grep: ${parts.join(' ')}`;
  }

  private formatTaskTool(input: Record<string, unknown>): string {
    const description = String(input.description ?? 'spawning agent');
    const agentType = input.subagent_type ? ` (${String(input.subagent_type)})` : '';
    return `Task: ${description}${agentType}`;
  }

  private formatWebFetchTool(input: Record<string, unknown>): string {
    const url = String(input.url ?? '');

    try {
      const urlObj = new URL(url);
      return `Fetching: ${urlObj.hostname}${this.truncate(urlObj.pathname, 30)}`;
    } catch {
      return `Fetching: ${this.truncate(url, 50)}`;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  }

  private getMessagePreview(input: string): string {
    // Check if it's multimodal content (JSON array)
    try {
      const parsed: unknown = JSON.parse(input);

      if (Array.isArray(parsed)) {
        const imageCount = (parsed as Array<{ type?: string }>).filter((b) => b.type === 'image').length;
        const textBlock = (parsed as Array<{ type?: string; text?: string }>).find((b) => b.type === 'text');
        const textPreview = textBlock?.text ? this.truncate(textBlock.text, 40) : '';

        if (imageCount > 0 && textPreview) {
          return `[${imageCount} image(s)] ${textPreview}`;
        } else if (imageCount > 0) {
          return `[${imageCount} image(s)]`;
        }

        return textPreview || '[multimodal content]';
      }
    } catch {
      // Not JSON, treat as plain text
    }

    return this.truncate(input, 50);
  }

  private extractEventContent(event: StreamEvent): string {
    if (typeof event.content === 'string') {
      return event.content;
    }

    if (Array.isArray(event.content)) {
      return event.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n');
    }

    if (event.message?.content) {
      return event.message.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text || '')
        .join('\n');
    }

    return '';
  }

  private emitCompactionMessage(summary: string): void {
    const message: AgentMessage = {
      type: 'compaction',
      content: summary || 'Context was compacted to reduce token usage.',
      timestamp: new Date().toISOString(),
    };

    this.logger.info('Emitting compaction message', {
      summaryLength: summary.length,
    });

    this.emitter.emit('message', message);
  }

  private emitResultMessage(result: string, isError: boolean): void {
    const message: AgentMessage = {
      type: 'result',
      content: result,
      timestamp: new Date().toISOString(),
      resultInfo: { isError },
    };

    this.logger.info('Emitting result message', {
      resultLength: result.length,
      isError,
    });

    this.emitter.emit('message', message);
  }

  private emitStatusChangeMessage(status: string): void {
    const message: AgentMessage = {
      type: 'status_change',
      content: status === 'compacting' ? 'Compacting context...' : `Status: ${status}`,
      timestamp: new Date().toISOString(),
      statusChangeInfo: { status },
    };

    this.logger.info('Emitting status change message', { status });
    this.emitter.emit('message', message);
  }

  private handleExit(code: number | null): void {
    const wasStopping = this.isStopping;
    this.process = null;
    this._processInfo = null;
    this.isStopping = false;
    this.awaitingCompactionSummary = false;
    this.lastInputWasCommand = false;

    const finalStatus = wasStopping || code === 0 ? 'stopped' : 'error';
    this.logger.info('Claude process exited', {
      exitCode: code,
      wasStopping,
      finalStatus,
      contextUsage: this._contextUsage,
    });

    this.emitMessage('system', `Agent exited with code ${code}`);
    this.setStatus(finalStatus);
    this.emitter.emit('exit', code);
  }

  private setStatus(status: AgentStatus): void {
    this._status = status;
    this.emitter.emit('status', status);
  }

  private emitMessage(
    type: AgentMessage['type'],
    content: string,
    toolInfo?: ToolUseInfo
  ): void {
    const message: AgentMessage = {
      type,
      content,
      timestamp: new Date().toISOString(),
      toolInfo,
    };

    // Collect stdout output for response parsing
    if (type === 'stdout') {
      this._collectedOutput += content;
    }

    this.emitter.emit('message', message);
  }
}
