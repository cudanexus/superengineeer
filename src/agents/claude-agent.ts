import { ChildProcess, spawn, exec } from 'child_process';
import { EventEmitter } from 'events';

import { getLogger, Logger } from '../utils/logger';

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

export interface AgentMessage {
  type: 'stdout' | 'stderr' | 'system' | 'tool_use' | 'tool_result' | 'user' | 'question' | 'permission' | 'plan_mode';
  content: string;
  timestamp: string;
  toolInfo?: ToolUseInfo;
  questionInfo?: QuestionInfo;
  permissionInfo?: PermissionRequest;
  planModeInfo?: PlanModeInfo;
}

export interface AgentEvents {
  message: (message: AgentMessage) => void;
  status: (status: AgentStatus) => void;
  exit: (code: number | null) => void;
  waitingForInput: (isWaiting: boolean) => void;
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
  readonly sessionId: string | null;
  readonly sessionError: string | null;
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

const defaultSpawner: ProcessSpawner = {
  spawn: (command, args, options) => spawn(command, args, options),
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

export interface ClaudeAgentConfig {
  projectId: string;
  projectPath: string;
  mode?: AgentMode;
  /** @deprecated Use permissions instead */
  skipPermissions?: boolean;
  permissions?: PermissionConfig;
  processSpawner?: ProcessSpawner;
  /** Session ID to resume or create with a specific ID */
  sessionId?: string;
  /** If true, use --session-id to create new session. If false, use --resume to resume existing session. */
  isNewSession?: boolean;
}

export class DefaultClaudeAgent implements ClaudeAgent {
  readonly projectId: string;
  private readonly projectPath: string;
  private readonly _mode: AgentMode;
  private readonly _permissions: PermissionConfig;
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
  private _sessionId: string | null = null;
  private readonly _configuredSessionId: string | null = null;
  private readonly _isNewSession: boolean = true;
  private _sessionError: string | null = null;

  // Claude Code uses 200k token context by default
  private static readonly DEFAULT_MAX_CONTEXT_TOKENS = 200000;

  constructor(config: ClaudeAgentConfig) {
    this.projectId = config.projectId;
    this.projectPath = config.projectPath;
    this._mode = config.mode || 'interactive';
    this._permissions = config.permissions ?? {
      skipPermissions: config.skipPermissions ?? true,
    };
    this.processSpawner = config.processSpawner || defaultSpawner;
    this.emitter = new EventEmitter();
    this.logger = getLogger('ClaudeAgent').withProject(config.projectId);
    this._configuredSessionId = config.sessionId || null;
    this._isNewSession = config.isNewSession ?? true;
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

  get sessionId(): string | null {
    return this._sessionId;
  }

  get sessionError(): string | null {
    return this._sessionError;
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
      this.logger.info('Claude process started', { pid: this.process.pid });
    }

    this.setupProcessHandlers();

    // Write instructions to stdin using stream-json format
    if (this.process.stdin) {
      if (instructions && instructions.trim()) {
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

        this.process.stdin.write(message + '\n');
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
    if (!this.process?.stdin || this.process.stdin.destroyed) {
      return;
    }

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

    this.process.stdin.write(message + '\n');
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
      this.emitter.emit('waitingForInput', isWaiting);
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

    // Add permission-related arguments
    this.addPermissionArgs(args);

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
      const toolsArg = this._permissions.allowedTools.join(' ');
      args.push('--allowedTools', this.quoteShellArg(toolsArg));
    }

    if (this._permissions.disallowedTools && this._permissions.disallowedTools.length > 0) {
      // Claude CLI expects tools as a single space-separated string
      const toolsArg = this._permissions.disallowedTools.join(' ');
      args.push('--disallowedTools', this.quoteShellArg(toolsArg));
    }

    if (this._permissions.appendSystemPrompt && this._permissions.appendSystemPrompt.trim().length > 0) {
      args.push('--append-system-prompt', this.quoteShellArg(this._permissions.appendSystemPrompt.trim()));
    }
  }

  private quoteShellArg(arg: string): string {
    // Check if argument contains shell metacharacters that need quoting
    // Common metacharacters: space, (, ), *, ?, [, ], {, }, <, >, |, &, ;, $, ", ', \, newline
    if (/[\s()*?[\]{}<>|&;$"'\\]/.test(arg)) {
      // Use double quotes and escape any existing double quotes and backslashes
      return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    return arg;
  }

  private setupProcessHandlers(): void {
    if (!this.process) {
      return;
    }

    this.lineBuffer = '';

    this.process.stdout?.on('data', (data: Buffer) => {
      const content = data.toString();
      this.lineBuffer += content;
      const lines = this.lineBuffer.split('\n');
      this.lineBuffer = lines.pop() || '';

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

      // Log the raw event from Claude
      this.logger.debug('STDOUT <<< Raw stream event', {
        direction: 'output',
        eventType: event.type,
        eventSubtype: event.subtype,
        rawLength: line.length,
      });

      this.handleStreamEvent(event);
    } catch {
      // Not JSON or parse error - emit as plain text
      if (line.trim()) {
        this.logger.debug('STDOUT <<< Non-JSON output', {
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
      case 'assistant':
        this.logger.info('STDOUT <<< Assistant message', {
          direction: 'output',
          eventType: 'assistant',
          contentBlocks: event.message?.content?.length || 0,
        });
        this.handleAssistantEvent(event);
        break;

      case 'content_block_delta':
        if (event.delta?.text) {
          this.emitMessage('stdout', event.delta.text);
        }
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
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

      case 'result':
        this.logger.info('STDOUT <<< Result', {
          direction: 'output',
          eventType: 'result',
          subtype: event.subtype,
        });
        this.setProcessing(false);
        this.processNextQueuedInput();
        break;

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
        }
        break;

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
      }
    }
  }

  private toolCounter = 0;
  private activeToolId: string | null = null;
  private activeToolName: string | null = null;
  private activeClaudeToolUseId: string | null = null;
  private toolIdMap: Map<string, { internalId: string; name: string }> = new Map();
  private lastPlanModeAction: 'enter' | 'exit' | null = null;

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

  private handleExit(code: number | null): void {
    const wasStopping = this.isStopping;
    this.process = null;
    this._processInfo = null;
    this.isStopping = false;

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
