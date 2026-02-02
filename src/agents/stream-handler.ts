import { EventEmitter } from 'events';
import { Logger } from '../utils';
import {
  AgentMessage,
  ToolUseInfo,
  QuestionInfo,
  PermissionRequest,
  PlanModeInfo,
  ResultInfo,
  StatusChangeInfo,
  ContextUsage,
  WaitingStatus,
} from './types';

export interface ContentBlock {
  toolUse?: {
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

export interface StreamEventUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface StreamEvent {
  type: string;
  index?: number;
  message?: {
    id?: string;
    type?: string;
    role?: string;
    model?: string;
    usage?: StreamEventUsage;
  };
  content_block?: ContentBlock;
  delta?: {
    text?: string;
    partial_json?: string;
    type?: string;
  };
  error?: {
    type?: string;
    message?: string;
  };
  text?: string;
  message_id?: string;
  assistant_event_type?: string;
  user_event_type?: string;
  user_input?: Record<string, unknown>;
  conversation_id?: string;
  timestamp?: string;
  usage?: StreamEventUsage;
  message_limit_type?: string;
  tool_use_id?: string;
  content?: string;
}

export interface StreamHandlerEvents {
  message: (message: AgentMessage) => void;
  waitingForInput: (status: WaitingStatus) => void;
  contextUsage: (usage: ContextUsage) => void;
  error: (error: Error) => void;
  sessionNotFound: (sessionId: string) => void;
  permissionRequest: (request: PermissionRequest) => void;
}

/**
 * Handles streaming events from Claude CLI process.
 * Extracts and emits structured messages from raw stream data.
 */
export class StreamHandler extends EventEmitter {
  private currentToolUse: ToolUseInfo | null = null;
  private currentToolName: string | null = null;
  private currentContentBlock: ContentBlock | null = null;
  private partialJson = '';
  private contextUsage: ContextUsage | null = null;
  private waitingVersion = 0;

  constructor(
    private readonly logger: Logger,
    private readonly projectId: string,
    private readonly sessionId: string | null
  ) {
    super();
  }

  /**
   * Process a line from the Claude CLI stream.
   */
  processLine(line: string): void {
    const trimmed = line.trim();

    if (!trimmed || trimmed === 'event: message' || trimmed === 'data: [DONE]') {
      return;
    }

    // Check for raw event types first
    if (trimmed.startsWith('event: ')) {
      this.handleRawEvent(trimmed);
      return;
    }

    // Skip non-data lines
    if (!trimmed.startsWith('data: ')) {
      return;
    }

    const jsonStr = trimmed.substring(6);

    try {
      const event = JSON.parse(jsonStr) as StreamEvent;
      this.handleStreamEvent(event);
    } catch (error) {
      this.logger.debug('Failed to parse stream event', {
        line: trimmed,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle raw event types (not JSON).
   */
  private handleRawEvent(line: string): void {
    const eventType = line.substring(7).trim();

    switch (eventType) {
      case 'ping':
        // Heartbeat event, no action needed
        break;
      default:
        this.logger.debug('Unhandled raw event type', { eventType });
    }
  }

  /**
   * Main event router for stream events.
   */
  private handleStreamEvent(event: StreamEvent): void {
    const { type } = event;

    switch (type) {
      case 'message_start':
        this.handleMessageStart(event);
        break;
      case 'content_block_start':
        this.handleContentBlockStart(event);
        break;
      case 'content_block_delta':
        this.handleContentBlockDelta(event);
        break;
      case 'content_block_stop':
        this.handleContentBlockStop();
        break;
      case 'message_delta':
        this.handleMessageDelta(event);
        break;
      case 'message_stop':
        this.handleMessageStop();
        break;
      case 'error':
        this.handleError(event);
        break;
      case 'assistant_event':
        this.handleAssistantEvent(event);
        break;
      case 'user_event':
        this.handleUserEvent(event);
        break;
      case 'permission_request':
        this.handlePermissionRequest(event);
        break;
      case 'stdout':
      case 'stderr':
        this.emitOutputMessage(type, event.content || '');
        break;
      case 'result':
        this.handleResult(event);
        break;
      case 'session_not_found':
        this.handleSessionNotFound(event);
        break;
      case 'status_change':
        this.handleStatusChange(event);
        break;
      default:
        this.logger.debug('Unhandled stream event type', { type });
    }
  }

  private handleMessageStart(event: StreamEvent): void {
    if (event.message?.usage) {
      this.updateContextUsage(event.message.usage);
    }
  }

  private handleContentBlockStart(event: StreamEvent): void {
    this.currentContentBlock = event.content_block || null;
    if (this.currentContentBlock?.toolUse) {
      this.currentToolUse = {
        name: this.currentContentBlock.toolUse.name || 'unknown',
        id: this.currentContentBlock.toolUse.id,
      };
      this.currentToolName = this.currentContentBlock.toolUse.name || null;
    }
  }

  private handleContentBlockDelta(event: StreamEvent): void {
    if (!event.delta) return;

    if (event.delta.text) {
      this.emitTextMessage(event.delta.text);
    }

    if (event.delta.partial_json) {
      this.partialJson += event.delta.partial_json;
    }
  }

  private handleContentBlockStop(): void {
    if (this.currentToolUse && this.partialJson) {
      try {
        const toolInput = JSON.parse(this.partialJson);
        this.emitToolMessage(
          this.currentToolUse.name || 'unknown',
          toolInput,
          this.currentToolUse.id
        );
      } catch (error) {
        this.logger.error('Failed to parse tool input JSON', {
          error: error instanceof Error ? error.message : 'Unknown error',
          partialJson: this.partialJson,
        });
      }
    }

    this.currentToolUse = null;
    this.currentToolName = null;
    this.currentContentBlock = null;
    this.partialJson = '';
  }

  private handleMessageDelta(event: StreamEvent): void {
    if (event.usage) {
      this.updateContextUsage(event.usage);
    }
  }

  private handleMessageStop(): void {
    // Message completed
  }

  private handleError(event: StreamEvent): void {
    const errorMessage = event.error?.message || 'Unknown error';
    this.emit('error', new Error(errorMessage));

    this.emitMessage({
      type: 'stderr',
      content: `Error: ${errorMessage}`,
      timestamp: new Date().toISOString(),
    });
  }

  private handleAssistantEvent(event: StreamEvent): void {
    switch (event.assistant_event_type) {
      case 'thinking':
        // Claude is thinking - we could show this in UI
        break;
      case 'tool_result':
        if (event.tool_use_id) {
          this.emitToolResultWithId(
            event.tool_use_id,
            'completed',
            this.extractEventContent(event)
          );
        }
        break;
      case 'compaction':
        this.emitCompactionMessage(this.extractEventContent(event));
        break;
      default:
        this.logger.debug('Unhandled assistant event', {
          type: event.assistant_event_type,
        });
    }
  }

  private handleUserEvent(event: StreamEvent): void {
    switch (event.user_event_type) {
      case 'question':
        if (event.user_input) {
          this.emitQuestionMessage(event.user_input);
        }
        break;
      case 'tool_use':
        if (event.user_input) {
          const { tool_name, ...params } = event.user_input;
          if (typeof tool_name === 'string') {
            this.emitToolMessage(tool_name, params);
          }
        }
        break;
      case 'plan_mode':
        if (event.user_input?.action) {
          this.emitPlanModeMessage(event.user_input.action as 'enter' | 'exit');
        }
        break;
      default:
        this.logger.debug('Unhandled user event', {
          type: event.user_event_type,
        });
    }
  }

  private handlePermissionRequest(event: StreamEvent): void {
    if (!event.user_input) return;

    const request: PermissionRequest = {
      tool: event.user_input.tool as string,
      operation: event.user_input.operation as string,
      reason: event.user_input.reason as string,
      allowOnce: event.user_input.allow_once as boolean,
      allowAlways: event.user_input.allow_always as boolean,
      deny: event.user_input.deny as boolean,
    };

    this.emit('permissionRequest', request);

    this.emitMessage({
      type: 'permission',
      content: `Permission requested: ${request.tool} - ${request.operation}`,
      timestamp: new Date().toISOString(),
      permissionInfo: request,
    });
  }

  private handleResult(event: StreamEvent): void {
    if (!event.content) return;

    const lines = event.content.split('\n');
    const errors = lines.filter(line => line.startsWith('ERROR:'));

    if (errors.length > 0) {
      this.handleResultErrors(errors);
    } else {
      this.emitResultMessage(event.content, false);
    }
  }

  private handleResultErrors(errors: string[]): void {
    for (const error of errors) {
      const match = error.match(/ERROR: (Tool use failed|Failed to use tool) '([^']+)'(?: \(ID: ([^)]+)\))?: (.+)/);
      if (match) {
        const [, , toolName, toolId, reason] = match;
        this.emitToolResult('failed', toolName, reason, toolId);
      } else {
        this.emitResultMessage(error, true);
      }
    }
  }

  private handleSessionNotFound(event: StreamEvent): void {
    if (event.conversation_id && this.sessionId) {
      this.emit('sessionNotFound', this.sessionId);
    }
  }

  private handleStatusChange(event: StreamEvent): void {
    if (event.content) {
      this.emitStatusChangeMessage(event.content);
    }
  }

  private updateContextUsage(usage: StreamEventUsage): void {
    if (!usage.input_tokens && !usage.output_tokens) {
      return;
    }

    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;

    this.contextUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cacheCreationInputTokens: cacheCreation,
      cacheReadInputTokens: cacheRead,
      maxContextTokens: 0, // Will be set later
      percentUsed: 0, // Will be calculated later
    };

    this.emit('contextUsage', this.contextUsage);
  }

  private emitMessage(message: AgentMessage): void {
    this.emit('message', message);
  }

  private emitTextMessage(text: string): void {
    this.emitMessage({
      type: 'stdout',
      content: text,
      timestamp: new Date().toISOString(),
    });
  }

  private emitOutputMessage(type: 'stdout' | 'stderr', content: string): void {
    this.emitMessage({
      type,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  private emitToolMessage(name: string, input?: Record<string, unknown>, claudeToolUseId?: string): void {
    const toolInfo: ToolUseInfo = {
      name,
      input: input ? this.sanitizeToolInput(input) : undefined,
      id: claudeToolUseId,
    };

    this.emitMessage({
      type: 'tool_use',
      content: this.formatToolUseMessage(toolInfo),
      timestamp: new Date().toISOString(),
      toolInfo,
    });
  }

  private emitToolResult(
    status: 'completed' | 'failed',
    toolName?: string,
    error?: string,
    toolId?: string
  ): void {
    const resultInfo: ToolUseInfo = {
      name: toolName || this.currentToolName || 'unknown',
      status,
      error,
      id: toolId,
    };

    this.emitMessage({
      type: 'tool_result',
      content: this.formatToolResultMessage(resultInfo),
      timestamp: new Date().toISOString(),
      toolInfo: resultInfo,
    });
  }

  private emitToolResultWithId(
    toolId: string,
    status: 'completed' | 'failed',
    content: string
  ): void {
    const resultInfo: ToolUseInfo = {
      name: this.currentToolName || 'unknown',
      status,
      id: toolId,
      output: content,
    };

    this.emitMessage({
      type: 'tool_result',
      content: this.formatToolResultWithContent(resultInfo, content),
      timestamp: new Date().toISOString(),
      toolInfo: resultInfo,
    });
  }

  private emitQuestionMessage(input: Record<string, unknown>): void {
    const questionInfo: QuestionInfo = {
      question: input.question as string || 'Unknown question',
      options: this.extractQuestionOptions(input),
    };

    this.waitingVersion++;
    this.emit('waitingForInput', {
      isWaiting: true,
      version: this.waitingVersion,
    });

    this.emitMessage({
      type: 'question',
      content: this.formatQuestionMessage(questionInfo),
      timestamp: new Date().toISOString(),
      questionInfo,
    });
  }

  private emitPlanModeMessage(action: 'enter' | 'exit'): void {
    const planModeInfo: PlanModeInfo = { action };

    this.emitMessage({
      type: 'plan_mode',
      content: action === 'enter'
        ? '📋 Entering plan mode...'
        : '✅ Exiting plan mode',
      timestamp: new Date().toISOString(),
      planModeInfo,
    });
  }

  private emitCompactionMessage(summary: string): void {
    this.emitMessage({
      type: 'compaction',
      content: `📦 Context compacted: ${summary}`,
      timestamp: new Date().toISOString(),
    });
  }

  private emitResultMessage(result: string, isError: boolean): void {
    const resultInfo: ResultInfo = {
      result,
      isError,
    };

    this.emitMessage({
      type: 'result',
      content: result,
      timestamp: new Date().toISOString(),
      resultInfo,
    });
  }

  private emitStatusChangeMessage(status: string): void {
    const statusChangeInfo: StatusChangeInfo = { status };

    this.emitMessage({
      type: 'status_change',
      content: `Status: ${status}`,
      timestamp: new Date().toISOString(),
      statusChangeInfo,
    });
  }

  private extractEventContent(event: StreamEvent): string {
    if (event.text) return event.text;
    if (event.content) return event.content;
    if (event.message?.type) return event.message.type;
    return 'Unknown content';
  }

  private extractQuestionOptions(input: Record<string, unknown>): Array<{
    label: string;
    value: string;
  }> {
    const options: Array<{ label: string; value: string }> = [];

    if (input.allow_text === true) {
      options.push({ label: 'Enter custom text', value: 'text' });
    }

    // Extract other options from the input
    for (const [key, value] of Object.entries(input)) {
      if (key.startsWith('option_') && typeof value === 'string') {
        options.push({ label: value, value: key });
      }
    }

    return options;
  }

  private sanitizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (key === 'content' && typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '... (truncated)';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private formatToolUseMessage(toolInfo: ToolUseInfo): string {
    let message = `🔧 Using tool: ${toolInfo.name}`;
    if (toolInfo.id) {
      message += ` (ID: ${toolInfo.id})`;
    }
    if (toolInfo.input) {
      message += `\n   Input: ${JSON.stringify(toolInfo.input, null, 2)}`;
    }
    return message;
  }

  private formatToolResultMessage(toolInfo: ToolUseInfo): string {
    const icon = toolInfo.status === 'completed' ? '✅' : '❌';
    let message = `${icon} Tool ${toolInfo.status}: ${toolInfo.name}`;
    if (toolInfo.id) {
      message += ` (ID: ${toolInfo.id})`;
    }
    if (toolInfo.error) {
      message += `\n   Error: ${toolInfo.error}`;
    }
    return message;
  }

  private formatToolResultWithContent(toolInfo: ToolUseInfo, content: string): string {
    const icon = toolInfo.status === 'completed' ? '✅' : '❌';
    let message = `${icon} Tool result for ${toolInfo.name}`;
    if (toolInfo.id) {
      message += ` (ID: ${toolInfo.id})`;
    }
    if (content) {
      message += `:\n${content}`;
    }
    return message;
  }

  private formatQuestionMessage(questionInfo: QuestionInfo): string {
    let message = `❓ ${questionInfo.question}`;

    if (questionInfo.options.length > 0) {
      message += '\n\nOptions:';
      questionInfo.options.forEach((opt, idx) => {
        message += `\n  ${idx + 1}. ${opt.label}`;
      });
    }

    return message;
  }

  /**
   * Reset the stream handler state.
   */
  reset(): void {
    this.currentToolUse = null;
    this.currentToolName = null;
    this.currentContentBlock = null;
    this.partialJson = '';
    this.contextUsage = null;
    this.waitingVersion = 0;
  }

  /**
   * Get the current context usage.
   */
  getContextUsage(): ContextUsage | null {
    return this.contextUsage;
  }

  /**
   * Set max context tokens for percentage calculation.
   */
  setMaxContextTokens(maxTokens: number): void {
    if (this.contextUsage) {
      this.contextUsage.maxContextTokens = maxTokens;
      this.contextUsage.percentUsed = maxTokens > 0
        ? Math.round((this.contextUsage.totalTokens / maxTokens) * 100)
        : 0;

      this.emit('contextUsage', this.contextUsage);
    }
  }
}