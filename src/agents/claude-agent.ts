import { ChildProcess, spawn, exec } from 'child_process';
import { EventEmitter } from 'events';

import { getLogger, Logger } from '../utils/logger.js';

export type AgentStatus = 'stopped' | 'running' | 'error';
export type AgentMode = 'autonomous' | 'interactive';
const isWindows = process.platform === 'win32';

export interface ToolUseInfo {
  id?: string;
  name: string;
  input?: Record<string, unknown>;
  status?: 'running' | 'completed' | 'failed';
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

export interface AgentMessage {
  type: 'stdout' | 'stderr' | 'system' | 'tool_use' | 'tool_result' | 'user' | 'question' | 'permission';
  content: string;
  timestamp: string;
  toolInfo?: ToolUseInfo;
  questionInfo?: QuestionInfo;
  permissionInfo?: PermissionRequest;
}

export interface AgentEvents {
  message: (message: AgentMessage) => void;
  status: (status: AgentStatus) => void;
  exit: (code: number | null) => void;
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
  start(instructions: string): void;
  stop(): Promise<void>;
  sendInput(input: string): void;
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

export interface ClaudeAgentConfig {
  projectId: string;
  projectPath: string;
  mode?: AgentMode;
  skipPermissions?: boolean;
  processSpawner?: ProcessSpawner;
}

export class DefaultClaudeAgent implements ClaudeAgent {
  readonly projectId: string;
  private readonly projectPath: string;
  private readonly _mode: AgentMode;
  private readonly _skipPermissions: boolean;
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

  // Claude Code uses 200k token context by default
  private static readonly DEFAULT_MAX_CONTEXT_TOKENS = 200000;

  constructor(config: ClaudeAgentConfig) {
    this.projectId = config.projectId;
    this.projectPath = config.projectPath;
    this._mode = config.mode || 'interactive';
    this._skipPermissions = config.skipPermissions ?? true;
    this.processSpawner = config.processSpawner || defaultSpawner;
    this.emitter = new EventEmitter();
    this.logger = getLogger('ClaudeAgent').withProject(config.projectId);
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

  start(instructions: string): void {
    if (this.process) {
      return;
    }

    this.isStopping = false;
    this._collectedOutput = '';
    this.lineBuffer = '';
    this.setStatus('running');
    this.emitMessage('system', 'Starting Claude agent...');

    const args = this.buildArgs();
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
        // Format: {"type":"user","message":{"role":"user","content":"..."}}
        const message = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: instructions,
          },
        });

        this.logger.info('STDIN >>> Sending initial instructions', {
          direction: 'input',
          messageType: 'user',
          contentLength: instructions.length,
          contentPreview: this.truncateForLog(instructions, 500),
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
      this.emitMessage('system', `Message queued (${this.inputQueue.length} in queue)`);
      return;
    }

    this.writeInputToStdin(input);
  }

  private writeInputToStdin(input: string): void {
    if (!this.process?.stdin || this.process.stdin.destroyed) {
      return;
    }

    this.isProcessing = true;

    // Format input as stream-json message
    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: input,
      },
    });

    this.logger.info('STDIN >>> Sending user message', {
      direction: 'input',
      messageType: 'user',
      contentLength: input.length,
      contentPreview: this.truncateForLog(input, 500),
    });

    this.process.stdin.write(message + '\n');
  }

  private processNextQueuedInput(): void {
    if (this.inputQueue.length === 0) {
      return;
    }

    const nextInput = this.inputQueue.shift()!;
    this.emitMessage('system', `Processing queued message (${this.inputQueue.length} remaining)`);
    this.writeInputToStdin(nextInput);
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

    if (this._skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // stream-json for both input and output (only works with --print)
    args.push('--input-format', 'stream-json');
    args.push('--output-format', 'stream-json');
    args.push('--verbose');

    return args;
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
      const event = JSON.parse(line);

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
        break;

      case 'result':
        this.logger.info('STDOUT <<< Result', {
          direction: 'output',
          eventType: 'result',
          subtype: event.subtype,
        });
        this.emitMessage('system', `Result: ${event.subtype || 'completed'}`);
        this.isProcessing = false;
        this.processNextQueuedInput();
        break;

      case 'system':
        if (event.subtype === 'init') {
          this.logger.info('STDOUT <<< System init', {
            direction: 'output',
            eventType: 'system',
            sessionId: event.session_id,
          });
          this.emitMessage('system', `Session: ${event.session_id || 'new'}`);
        }
        break;

      default:
        this.logger.debug('STDOUT <<< Unknown event type', {
          direction: 'output',
          eventType: event.type,
        });
        break;
    }
  }

  private updateUsageFromEvent(event: StreamEvent): void {
    const usage = event.usage || event.message?.usage;

    if (!usage) {
      return;
    }

    // The usage data from Claude API events is typically cumulative for the session.
    // However, some events report incremental values. We take the maximum seen value
    // to handle both cases correctly.
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadInputTokens = usage.cache_read_input_tokens || 0;

    // Keep the larger value (assumes cumulative or take latest larger snapshot)
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
      this.emitToolMessage(block.name, block.input);
    }
  }

  private toolCounter = 0;

  private emitToolMessage(name: string, input?: Record<string, unknown>): void {
    // Handle AskUserQuestion specially
    if (name === 'AskUserQuestion' && input) {
      this.emitQuestionMessage(input);
      return;
    }

    const toolId = `tool-${Date.now()}-${++this.toolCounter}`;
    const toolInfo: ToolUseInfo = {
      id: toolId,
      name,
      input,
      status: 'running',
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

  private formatToolContent(name: string, input?: Record<string, unknown>): string {
    if (!input) return `Using tool: ${name}`;

    // Format based on tool type
    switch (name) {
      case 'Read':
        return `Reading: ${input.file_path || 'file'}`;
      case 'Write':
        return `Writing: ${input.file_path || 'file'}`;
      case 'Edit':
        return `Editing: ${input.file_path || 'file'}`;
      case 'Bash':
        return `Running: ${this.truncate(String(input.command || ''), 80)}`;
      case 'Glob':
        return `Searching: ${input.pattern || 'files'}`;
      case 'Grep':
        return `Grep: ${this.truncate(String(input.pattern || ''), 50)}`;
      case 'Task':
        return `Task: ${input.description || 'spawning agent'}`;
      default:
        return `Using tool: ${name}`;
    }
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
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
