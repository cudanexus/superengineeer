import { DefaultClaudeAgent, ClaudeAgentConfig } from '../../../src/agents/claude-agent';
import { createMockChildProcess, createMockProcessSpawner, MockChildProcess } from '../helpers/mock-factories';

// Helper to safely get spawn args
function getSpawnArgs(spawner: ReturnType<typeof createMockProcessSpawner>): string[] {
  const call = spawner.spawn.mock.calls[0];
  return call ? call[1] : [];
}

describe('DefaultClaudeAgent', () => {
  let mockProcess: MockChildProcess;
  let mockSpawner: ReturnType<typeof createMockProcessSpawner>;
  let agent: DefaultClaudeAgent;
  const defaultConfig: ClaudeAgentConfig = {
    projectId: 'test-project',
    projectPath: '/test/path',
    mode: 'interactive',
    permissions: {
      skipPermissions: false,
      permissionMode: 'acceptEdits',
    },
  };

  beforeEach(() => {
    mockProcess = createMockChildProcess(12345);
    mockSpawner = createMockProcessSpawner(mockProcess);
  });

  afterEach(() => {
    // Simply reset the agent reference - we don't need to actually stop
    // since we're using mocked processes. Calling stop() would hang
    // because the mock process doesn't auto-exit.
    agent = undefined as unknown as DefaultClaudeAgent;
  });

  describe('constructor', () => {
    it('should initialize with default values when minimal config provided', () => {
      agent = new DefaultClaudeAgent({
        projectId: 'test',
        projectPath: '/test',
        processSpawner: mockSpawner,
      });

      expect(agent.projectId).toBe('test');
      expect(agent.status).toBe('stopped');
      expect(agent.mode).toBe('interactive');
      expect(agent.collectedOutput).toBe('');
      expect(agent.queuedMessageCount).toBe(0);
    });

    it('should use custom processSpawner when provided', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
      agent.start('test instructions');

      expect(mockSpawner.spawn).toHaveBeenCalled();
    });

    it('should set mode to interactive by default', () => {
      agent = new DefaultClaudeAgent({
        projectId: 'test',
        projectPath: '/test',
        processSpawner: mockSpawner,
      });

      expect(agent.mode).toBe('interactive');
    });

    it('should set mode to autonomous when specified', () => {
      agent = new DefaultClaudeAgent({
        projectId: 'test',
        projectPath: '/test',
        mode: 'autonomous',
        processSpawner: mockSpawner,
      });

      expect(agent.mode).toBe('autonomous');
    });

    it('should use permissions config over legacy skipPermissions', () => {
      agent = new DefaultClaudeAgent({
        projectId: 'test',
        projectPath: '/test',
        skipPermissions: true,
        permissions: {
          skipPermissions: false,
          permissionMode: 'plan',
        },
        processSpawner: mockSpawner,
      });

      expect(agent.permissionMode).toBe('plan');
    });
  });

  describe('start', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('should not start if process already exists', () => {
      agent.start('first instructions');
      const firstCallCount = mockSpawner.spawn.mock.calls.length;

      agent.start('second instructions');

      expect(mockSpawner.spawn.mock.calls.length).toBe(firstCallCount);
    });

    it('should set status to running on start', () => {
      const statusListener = jest.fn();
      agent.on('status', statusListener);

      agent.start('test instructions');

      expect(agent.status).toBe('running');
      expect(statusListener).toHaveBeenCalledWith('running');
    });

    it('should spawn process with correct arguments for interactive mode', () => {
      agent.start('test instructions');

      expect(mockSpawner.spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--print', '--input-format', 'stream-json', '--output-format', 'stream-json']),
        expect.objectContaining({ cwd: '/test/path', shell: true })
      );
    });

    it('should add --permission-mode when permissionMode is set', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        permissions: { skipPermissions: false, permissionMode: 'plan' },
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--permission-mode');
      expect(args).toContain('plan');
    });

    it('should add --dangerously-skip-permissions when skipPermissions is true', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        permissions: { skipPermissions: true },
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--dangerously-skip-permissions');
    });

    it('should add --allowedTools when allowedTools provided', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        permissions: { skipPermissions: false, allowedTools: ['Read', 'Write'] },
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--allowedTools');
      expect(args).toContain('Read Write');
    });

    it('should add --disallowedTools when disallowedTools provided', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        permissions: { skipPermissions: false, disallowedTools: ['Bash'] },
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--disallowedTools');
      expect(args).toContain('Bash');
    });

    it('should add --append-system-prompt when appendSystemPrompt provided', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        permissions: { skipPermissions: false, appendSystemPrompt: 'Custom prompt' },
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--append-system-prompt');
      expect(args).toContain('Custom prompt');
    });

    it('should add --session-id for new sessions', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        sessionId: 'test-session-123',
        isNewSession: true,
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--session-id');
      expect(args).toContain('test-session-123');
    });

    it('should add --resume for existing sessions', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        sessionId: 'test-session-123',
        isNewSession: false,
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      const args = getSpawnArgs(mockSpawner);
      expect(args).toContain('--resume');
      expect(args).toContain('test-session-123');
    });

    it('should write instructions to stdin on start', () => {
      agent.start('test instructions');

      expect(mockProcess.stdin.write).toHaveBeenCalled();
      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const parsed = JSON.parse(writtenData.replace('\n', ''));
      expect(parsed.type).toBe('user');
      expect(parsed.message.content).toBe('test instructions');
    });

    it('should close stdin in autonomous mode after writing', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        mode: 'autonomous',
        processSpawner: mockSpawner,
      });

      agent.start('test instructions');

      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });

    it('should keep stdin open in interactive mode', () => {
      agent.start('test instructions');

      expect(mockProcess.stdin.end).not.toHaveBeenCalled();
    });

    it('should emit system message on start', () => {
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      agent.start('test instructions');

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          content: expect.stringContaining('Starting Claude agent'),
        })
      );
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('should do nothing if no process exists', async () => {
      await agent.stop();

      expect(agent.status).toBe('stopped');
    });

    it('should emit system message on exit', () => {
      agent.start('test');
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      // Simulate exit callback to trigger the exit message
      const exitCallback = mockProcess.on.mock.calls.find((c) => c[0] === 'exit')?.[1];

      if (exitCallback) {
        exitCallback(0);
      }

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          content: expect.stringContaining('exited'),
        })
      );
    });
  });

  describe('sendInput', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('should ignore input when status is not running', () => {
      agent.sendInput('test message');

      expect(mockProcess.stdin.write).not.toHaveBeenCalled();
    });

    it('should write to stdin when running and not processing', () => {
      agent.start('initial');

      // Clear the initial instruction write
      mockProcess.stdin.write.mockClear();

      // Simulate result event to mark as not processing
      const resultEvent = JSON.stringify({ type: 'result', subtype: 'success' });
      mockProcess.stdout.emit('data', Buffer.from(resultEvent + '\n'));

      agent.sendInput('user message');

      expect(mockProcess.stdin.write).toHaveBeenCalled();
      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const parsed = JSON.parse(writtenData.replace('\n', ''));
      expect(parsed.type).toBe('user');
      expect(parsed.message.content).toBe('user message');
    });

    it('should handle multimodal content (JSON array with images)', () => {
      agent.start('initial');
      mockProcess.stdin.write.mockClear();

      // Simulate result event to mark as not processing
      const resultEvent = JSON.stringify({ type: 'result', subtype: 'success' });
      mockProcess.stdout.emit('data', Buffer.from(resultEvent + '\n'));

      const multimodalContent = JSON.stringify([
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        { type: 'text', text: 'Describe this image' },
      ]);

      agent.sendInput(multimodalContent);

      expect(mockProcess.stdin.write).toHaveBeenCalled();
      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const parsed = JSON.parse(writtenData.replace('\n', ''));
      expect(Array.isArray(parsed.message.content)).toBe(true);
    });
  });

  describe('removeQueuedMessage', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('should return false for invalid index', () => {
      expect(agent.removeQueuedMessage(-1)).toBe(false);
      expect(agent.removeQueuedMessage(0)).toBe(false);
      expect(agent.removeQueuedMessage(100)).toBe(false);
    });
  });

  describe('Stream Event Handling', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
      agent.start('test');
    });

    describe('handleStreamEvent', () => {
      it('should handle assistant event with text content', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from Claude' }],
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'stdout',
            content: 'Hello from Claude',
          })
        );
      });

      it('should handle assistant event with tool_use content', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', name: 'Read', id: 'tool-1', input: { file_path: '/test.ts' } }],
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'tool_use',
            toolInfo: expect.objectContaining({ name: 'Read' }),
          })
        );
      });

      it('should handle content_block_delta with text', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = { type: 'content_block_delta', delta: { text: 'streaming text' } };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'stdout',
            content: 'streaming text',
          })
        );
      });

      it('should handle content_block_start for tool_use', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Bash', id: 'tool-2', input: { command: 'ls' } },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'tool_use',
            toolInfo: expect.objectContaining({ name: 'Bash' }),
          })
        );
      });

      it('should handle content_block_stop and emit tool result', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        // First emit a tool_use to set activeToolId
        const toolEvent = {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Read', id: 'tool-3' },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(toolEvent) + '\n'));
        messageListener.mockClear();

        // Then emit content_block_stop
        const stopEvent = { type: 'content_block_stop' };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(stopEvent) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'tool_result',
            toolInfo: expect.objectContaining({ status: 'completed' }),
          })
        );
      });

      it('should handle result event and set processing to false', () => {
        const waitingListener = jest.fn();
        agent.on('waitingForInput', waitingListener);

        const event = { type: 'result', subtype: 'success' };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(waitingListener).toHaveBeenCalledWith(
          expect.objectContaining({ isWaiting: true })
        );
      });

      it('should handle system init event and capture session ID', () => {
        const event = { type: 'system', subtype: 'init', session_id: 'captured-session-id' };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(agent.sessionId).toBe('captured-session-id');
      });

      it('should handle compaction events', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = { type: 'system', subtype: 'compact', content: 'Context was compacted' };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'compaction',
          })
        );
      });

      it('should handle user event with tool_result', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        // First emit a tool_use to set up toolIdMap
        const toolEvent = {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Read', id: 'tool-result-1' },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(toolEvent) + '\n'));
        messageListener.mockClear();

        // Then emit user event with tool_result
        const userEvent = {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tool-result-1', content: 'File content' }],
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(userEvent) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'tool_result',
            toolInfo: expect.objectContaining({
              status: 'completed',
              claudeToolUseId: 'tool-result-1',
            }),
          })
        );
      });
    });

    describe('updateUsageFromEvent', () => {
      it('should update context usage with input/output tokens', () => {
        const event = {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'test' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(agent.contextUsage).not.toBeNull();
        expect(agent.contextUsage?.inputTokens).toBe(100);
        expect(agent.contextUsage?.outputTokens).toBe(50);
        expect(agent.contextUsage?.totalTokens).toBe(150);
      });

      it('should take maximum of new and previous values', () => {
        // First update
        const event1 = {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'test' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event1) + '\n'));

        // Second update with higher values
        const event2 = {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'test2' }],
            usage: { input_tokens: 200, output_tokens: 75 },
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event2) + '\n'));

        expect(agent.contextUsage?.inputTokens).toBe(200);
        expect(agent.contextUsage?.outputTokens).toBe(75);
      });

      it('should calculate percentUsed correctly', () => {
        const event = {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'test' }],
            usage: { input_tokens: 100000, output_tokens: 50000 },
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        // 150000 / 200000 = 75%
        expect(agent.contextUsage?.percentUsed).toBe(75);
      });
    });

    describe('Tool Messages', () => {
      it('should emit tool_use message with proper formatting', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Read', input: { file_path: '/path/to/file.ts' } },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'tool_use',
            content: expect.stringContaining('/path/to/file.ts'),
          })
        );
      });

      it('should handle AskUserQuestion tool specially (question message)', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            content: [{
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: {
                questions: [{
                  question: 'Which option?',
                  header: 'Choice',
                  options: [{ label: 'A' }, { label: 'B' }],
                }],
              },
            }],
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'question',
            questionInfo: expect.objectContaining({
              question: 'Which option?',
            }),
          })
        );
      });

      it('should handle EnterPlanMode tool (plan_mode message)', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'EnterPlanMode' }],
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'plan_mode',
            planModeInfo: expect.objectContaining({ action: 'enter' }),
          })
        );
      });

      it('should handle ExitPlanMode tool (plan_mode message)', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'ExitPlanMode' }],
          },
        };
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        expect(messageListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'plan_mode',
            planModeInfo: expect.objectContaining({ action: 'exit' }),
          })
        );
      });

      it('should prevent duplicate consecutive plan mode messages', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'EnterPlanMode' }],
          },
        };

        // Emit same event twice
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        const planModeMessages = messageListener.mock.calls.filter(
          (call) => call[0].type === 'plan_mode'
        );
        expect(planModeMessages.length).toBe(1);
      });

      it('should prevent duplicate question messages', () => {
        const messageListener = jest.fn();
        agent.on('message', messageListener);

        const event = {
          type: 'assistant',
          message: {
            content: [{
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: {
                questions: [{
                  question: 'Same question?',
                  options: [{ label: 'Yes' }, { label: 'No' }],
                }],
              },
            }],
          },
        };

        // Emit same question twice
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

        const questionMessages = messageListener.mock.calls.filter(
          (call) => call[0].type === 'question'
        );
        expect(questionMessages.length).toBe(1);
      });
    });
  });

  describe('Properties', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('isWaitingForInput should return true in interactive mode when running and not processing', () => {
      agent.start('test');

      // After result event, should be waiting
      const event = { type: 'result', subtype: 'success' };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(agent.isWaitingForInput).toBe(true);
    });

    it('isWaitingForInput should return false in autonomous mode', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        mode: 'autonomous',
        processSpawner: mockSpawner,
      });
      agent.start('test');

      const event = { type: 'result', subtype: 'success' };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(agent.isWaitingForInput).toBe(false);
    });

    it('waitingVersion should increment when waiting status changes', () => {
      agent.start('test');
      const initialVersion = agent.waitingVersion;

      // Trigger a result event to change waiting status
      const event = { type: 'result', subtype: 'success' };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(agent.waitingVersion).toBeGreaterThan(initialVersion);
    });

    it('permissionMode should return from permissions config', () => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        permissions: { skipPermissions: false, permissionMode: 'plan' },
        processSpawner: mockSpawner,
      });

      expect(agent.permissionMode).toBe('plan');
    });
  });

  describe('Exit Handling', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('should process remaining buffer content on exit', () => {
      agent.start('test');
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      // Simulate partial line in buffer followed by exit
      mockProcess.stdout.emit('data', Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"final"}]}}'));

      // Find and call exit handler
      const exitHandler = mockProcess.on.mock.calls.find((c) => c[0] === 'exit')?.[1];

      if (exitHandler) {
        exitHandler(0);
      }

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stdout',
          content: 'final',
        })
      );
    });

    it('should set status to stopped on graceful exit', () => {
      agent.start('test');

      const exitHandler = mockProcess.on.mock.calls.find((c) => c[0] === 'exit')?.[1];

      if (exitHandler) {
        exitHandler(0);
      }

      expect(agent.status).toBe('stopped');
    });

    it('should set status to error on non-zero exit code', () => {
      agent.start('test');

      const exitHandler = mockProcess.on.mock.calls.find((c) => c[0] === 'exit')?.[1];

      if (exitHandler) {
        exitHandler(1);
      }

      expect(agent.status).toBe('error');
    });

    it('should emit exit event with code', () => {
      agent.start('test');
      const exitListener = jest.fn();
      agent.on('exit', exitListener);

      const exitHandler = mockProcess.on.mock.calls.find((c) => c[0] === 'exit')?.[1];

      if (exitHandler) {
        exitHandler(0);
      }

      expect(exitListener).toHaveBeenCalledWith(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
    });

    it('should detect session not found error from result', () => {
      agent.start('test');
      const sessionNotFoundListener = jest.fn();
      agent.on('sessionNotFound', sessionNotFoundListener);

      const event = {
        type: 'result',
        is_error: true,
        errors: ['No conversation found with session ID: abc-123-def'],
      };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(sessionNotFoundListener).toHaveBeenCalledWith('abc-123-def');
    });

    it('should detect session ID conflict from stderr', () => {
      agent.start('test');

      mockProcess.stderr.emit('data', Buffer.from('Session ID test-session already in use\n'));

      expect(agent.sessionError).toContain('already in use');
    });

    it('should handle process error event', () => {
      agent.start('test');
      const statusListener = jest.fn();
      agent.on('status', statusListener);

      const errorHandler = mockProcess.on.mock.calls.find((c) => c[0] === 'error')?.[1];

      if (errorHandler) {
        errorHandler(new Error('Process failed'));
      }

      expect(agent.status).toBe('error');
    });
  });

  describe('Tool Content Formatting', () => {
    beforeEach(() => {
      agent = new DefaultClaudeAgent({
        ...defaultConfig,
        processSpawner: mockSpawner,
      });
      agent.start('test');
    });

    it('should format Read tool content correctly', () => {
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      const event = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/path/to/file.ts', offset: 10, limit: 50 },
        },
      };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Reading:'),
        })
      );
    });

    it('should format Write tool content correctly', () => {
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      const event = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/path/to/file.ts', content: 'some content here' },
        },
      };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Writing:'),
        })
      );
    });

    it('should format Bash tool content correctly', () => {
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      const event = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'npm run test' },
        },
      };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Running:'),
        })
      );
    });

    it('should format Grep tool content correctly', () => {
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      const event = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          name: 'Grep',
          input: { pattern: 'function.*test', path: '/src' },
        },
      };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Grep:'),
        })
      );
    });

    it('should format Task tool content correctly', () => {
      const messageListener = jest.fn();
      agent.on('message', messageListener);

      const event = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          name: 'Task',
          input: { description: 'Explore codebase', subagent_type: 'Explore' },
        },
      };
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Task:'),
        })
      );
    });
  });
});
