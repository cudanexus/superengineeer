import { AgentMessage, AgentMode } from './claude-agent';

/**
 * Utilities for building and formatting agent messages.
 */
export class MessageBuilder {
  /**
   * Build a user message with optional images.
   */
  static buildUserMessage(content: string, images?: Array<{ data: string; mediaType: string }>): string {
    if (!images || images.length === 0) {
      return content;
    }

    // Build multimodal message with images
    const parts: string[] = [];

    // Add images first
    for (const image of images) {
      parts.push(`<image media_type="${image.mediaType}">${image.data}</image>`);
    }

    // Add text content
    parts.push(content);

    return parts.join('\n\n');
  }

  /**
   * Build command line arguments for Claude CLI.
   */
  static buildArgs(options: {
    mode: AgentMode;
    sessionId?: string;
    resumeSessionId?: string;
    appendSystemPrompt?: string;
    model?: string;
    waitForReady?: boolean;
    contextTokens?: number;
    agentTurns?: number;
    totalBudget?: number;
    cacheAnything?: boolean;
    allowedTools?: string[];
    disallowedTools?: string[];
    permissionMode?: 'acceptEdits' | 'plan';
    skipPermissions?: boolean;
    message?: string;
    env?: Record<string, string>;
  }): string[] {
    const args: string[] = [];

    // Mode-specific arguments
    if (options.mode === 'interactive') {
      args.push('--interactive');

      if (options.sessionId) {
        args.push('--session-id', options.sessionId);
      } else if (options.resumeSessionId) {
        args.push('--resume', options.resumeSessionId);
      }

      if (options.message) {
        args.push('--message', options.message);
      }
    } else {
      // Autonomous mode - message is required
      if (!options.message) {
        throw new Error('Message is required for autonomous mode');
      }
      args.push('--message', options.message);
    }

    // Common arguments
    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', options.appendSystemPrompt);
    }

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.waitForReady) {
      args.push('--wait-ready');
    }

    // Agent limits
    if (options.contextTokens !== undefined && options.contextTokens > 0) {
      args.push('--max-context-tokens', String(options.contextTokens));
    }

    if (options.agentTurns !== undefined && options.agentTurns > 0) {
      args.push('--max-turns', String(options.agentTurns));
    }

    if (options.totalBudget !== undefined && options.totalBudget > 0) {
      args.push('--total-budget', String(options.totalBudget));
    }

    // Streaming options
    if (options.cacheAnything) {
      args.push('--cache-anything');
    }

    // Permissions
    if (options.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    } else {
      // Permission mode
      if (options.permissionMode === 'plan') {
        args.push('--plan');
      } else {
        args.push('--accept-edits');
      }

      // Allowed tools
      if (options.allowedTools && options.allowedTools.length > 0) {
        for (const tool of options.allowedTools) {
          args.push('--allow', tool);
        }
      }

      // Disallowed tools
      if (options.disallowedTools && options.disallowedTools.length > 0) {
        for (const tool of options.disallowedTools) {
          args.push('--deny', tool);
        }
      }
    }

    return args;
  }

  /**
   * Build environment variables for Claude CLI.
   */
  static buildEnvironment(env?: Record<string, string>): Record<string, string> {
    return {
      ...process.env,
      ...env,
      // Force color output for better formatting
      FORCE_COLOR: '1',
      // Disable telemetry
      ANTHROPIC_TELEMETRY: 'false',
    };
  }

  /**
   * Format a system message for display.
   */
  static formatSystemMessage(content: string): AgentMessage {
    return {
      type: 'system',
      content,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format an error message for display.
   */
  static formatErrorMessage(error: Error | string): AgentMessage {
    const content = error instanceof Error ? error.message : error;
    return {
      type: 'stderr',
      content: `Error: ${content}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extract session ID from a message.
   * Looks for patterns like "Session ID: xxx" or "Resuming session: xxx"
   */
  static extractSessionId(message: string): string | null {
    const patterns = [
      /Session ID: ([a-f0-9-]+)/i,
      /Resuming session: ([a-f0-9-]+)/i,
      /Created new session: ([a-f0-9-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if a message indicates the agent is ready.
   */
  static isReadyMessage(message: string): boolean {
    const readyPatterns = [
      /^Ready\.?$/i,
      /Agent is ready/i,
      /Claude is ready/i,
      /Assistant is ready/i,
    ];

    return readyPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Check if a message indicates the agent is waiting for input.
   */
  static isWaitingMessage(message: string): boolean {
    const waitingPatterns = [
      /Waiting for input/i,
      /Waiting for user input/i,
      /Enter your message/i,
      /^>$/,
    ];

    return waitingPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Parse agent response for completion status.
   * Used in autonomous mode to detect when the agent has finished.
   */
  static parseCompletionResponse(content: string): { status: 'COMPLETE' | 'FAILED'; reason: string } | null {
    // Check for explicit completion markers
    if (content.includes('MILESTONE_COMPLETE')) {
      const match = content.match(/MILESTONE_COMPLETE: (.+)/);
      return {
        status: 'COMPLETE',
        reason: match?.[1] || 'Milestone completed',
      };
    }

    if (content.includes('MILESTONE_FAILED')) {
      const match = content.match(/MILESTONE_FAILED: (.+)/);
      return {
        status: 'FAILED',
        reason: match?.[1] || 'Milestone failed',
      };
    }

    // Check for task completion patterns
    const completionPatterns = [
      /All tasks? (?:have been )?completed?/i,
      /Milestone is complete/i,
      /Successfully completed all tasks/i,
      /Finished all pending tasks/i,
    ];

    for (const pattern of completionPatterns) {
      if (pattern.test(content)) {
        return {
          status: 'COMPLETE',
          reason: 'All tasks completed',
        };
      }
    }

    // Check for failure patterns
    const failurePatterns = [
      /Failed to complete milestone/i,
      /Cannot continue with milestone/i,
      /Milestone cannot be completed/i,
      /Critical error occurred/i,
    ];

    for (const pattern of failurePatterns) {
      if (pattern.test(content)) {
        return {
          status: 'FAILED',
          reason: content.trim(),
        };
      }
    }

    return null;
  }

  /**
   * Escape command line arguments for shell execution.
   * This is used when shell mode is required.
   */
  static escapeShellArg(arg: string): string {
    if (process.platform === 'win32') {
      // Windows: Double quotes and escape internal quotes
      return `"${arg.replace(/"/g, '""')}"`;
    } else {
      // Unix: Single quotes and escape internal quotes
      return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }
  }

  /**
   * Build a shell command from command and arguments.
   * Used when shell execution is required.
   */
  static buildShellCommand(command: string, args: string[]): string {
    const escapedArgs = args.map(arg => this.escapeShellArg(arg));
    return `${command} ${escapedArgs.join(' ')}`;
  }
}