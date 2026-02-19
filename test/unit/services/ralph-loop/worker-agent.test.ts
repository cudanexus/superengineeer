import { EventEmitter } from 'events';

import { WorkerAgent } from '../../../../src/services/ralph-loop/worker-agent';
import {
  createMockContextInitializer,
  createTestRalphLoopState,
} from '../../helpers/mock-factories';

describe('WorkerAgent', () => {
  let agent: WorkerAgent;
  let mockContextInitializer: ReturnType<typeof createMockContextInitializer>;
  let mockProcess: MockChildProcess;
  let mockSpawner: { spawn: jest.Mock };

  class MockChildProcess extends EventEmitter {
    stdin = {
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      destroyed: false,
    };
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 12345;

    kill = jest.fn();
  }

  beforeEach(() => {
    mockContextInitializer = createMockContextInitializer();
    mockProcess = new MockChildProcess();

    mockSpawner = {
      spawn: jest.fn().mockReturnValue(mockProcess),
    };

    agent = new WorkerAgent(
      {
        projectPath: '/test/project',
        model: 'claude-opus-4-6',
        contextInitializer: mockContextInitializer,
      },
      mockSpawner
    );
  });

  describe('constructor', () => {
    it('should initialize with idle status', () => {
      expect(agent.status).toBe('idle');
    });
  });

  describe('run', () => {
    it('should throw if already running', async () => {
      const state = createTestRalphLoopState();

      // Start first run
      const runPromise = agent.run(state);

      // Try to run again while running
      await expect(agent.run(state)).rejects.toThrow(
        'Worker agent is already running'
      );

      // Clean up
      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should spawn Claude process with correct arguments', async () => {
      const state = createTestRalphLoopState({
        currentIteration: 1,
      });

      const runPromise = agent.run(state);

      expect(mockSpawner.spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--print',
          '--model',
          'claude-opus-4-6',
          '--dangerously-skip-permissions',
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--verbose',
        ]),
        expect.objectContaining({
          cwd: '/test/project',
          shell: true,
        })
      );

      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should call contextInitializer.buildWorkerContext', async () => {
      const state = createTestRalphLoopState();

      const runPromise = agent.run(state);

      expect(mockContextInitializer.buildWorkerContext).toHaveBeenCalledWith(
        state
      );

      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should send context to stdin', async () => {
      mockContextInitializer.buildWorkerContext.mockReturnValue('Test context');
      const state = createTestRalphLoopState();

      const runPromise = agent.run(state);

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('Test context')
      );
      expect(mockProcess.stdin.end).toHaveBeenCalled();

      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should return IterationSummary on successful completion', async () => {
      const state = createTestRalphLoopState({
        currentIteration: 2,
      });

      const runPromise = agent.run(state);

      // Simulate output
      const assistantEvent = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Worker output text' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(assistantEvent + '\n'));

      // Exit successfully
      mockProcess.emit('exit', 0);

      const summary = await runPromise;

      expect(summary.iterationNumber).toBe(2);
      expect(summary.workerOutput).toContain('Worker output text');
      expect(summary.tokensUsed).toBe(150);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
      expect(summary.timestamp).toBeDefined();
    });

    it('should reject on non-zero exit code', async () => {
      const state = createTestRalphLoopState();

      // Add error listener to prevent unhandled error
      agent.on('error', () => {});

      const runPromise = agent.run(state);
      mockProcess.emit('exit', 1);

      await expect(runPromise).rejects.toThrow(
        'Worker process exited with code 1'
      );
    });

    it('should update status to running then completed', async () => {
      const statusChanges: string[] = [];
      agent.on('status', (status) => statusChanges.push(status));

      const state = createTestRalphLoopState();

      const runPromise = agent.run(state);
      mockProcess.emit('exit', 0);
      await runPromise;

      expect(statusChanges).toContain('running');
      expect(statusChanges).toContain('completed');
    });

    it('should emit output events', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputs).toContain('Hello world');
    });

    it('should emit complete event with summary', async () => {
      let emittedSummary: unknown = null;
      agent.on('complete', (summary) => {
        emittedSummary = summary;
      });

      const state = createTestRalphLoopState({ currentIteration: 3 });
      const runPromise = agent.run(state);

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(emittedSummary).toBeDefined();
      expect((emittedSummary as { iterationNumber: number }).iterationNumber).toBe(3);
    });
  });

  describe('stop', () => {
    it('should do nothing if not running', async () => {
      await agent.stop();

      expect(agent.status).toBe('idle');
    });

    it('should stop running process', async () => {
      const state = createTestRalphLoopState();

      const runPromise = agent.run(state);

      // Stop immediately
      const stopPromise = agent.stop();

      // Simulate process exit after stop
      mockProcess.emit('exit', null);

      await stopPromise;

      // Run promise should reject because it was stopped
      await expect(runPromise).rejects.toThrow('Worker was stopped');
    });
  });

  describe('stream event handling', () => {
    it('should handle content_block_delta events', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const delta = JSON.stringify({
        type: 'content_block_delta',
        delta: { text: 'streaming ' },
      });
      mockProcess.stdout.emit('data', Buffer.from(delta + '\n'));

      const delta2 = JSON.stringify({
        type: 'content_block_delta',
        delta: { text: 'text' },
      });
      mockProcess.stdout.emit('data', Buffer.from(delta2 + '\n'));

      mockProcess.emit('exit', 0);
      const summary = await runPromise;

      expect(outputs).toContain('streaming ');
      expect(outputs).toContain('text');
      expect(summary.workerOutput).toContain('streaming ');
      expect(summary.workerOutput).toContain('text');
    });

    it('should track token usage from events', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: {
          content: [],
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      const summary = await runPromise;

      expect(summary.tokensUsed).toBe(700);
    });

    it('should handle non-JSON output gracefully', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      // Send non-JSON text
      mockProcess.stdout.emit('data', Buffer.from('Plain text output\n'));

      mockProcess.emit('exit', 0);
      const summary = await runPromise;

      expect(outputs).toContain('Plain text output');
      expect(summary.workerOutput).toContain('Plain text output');
    });

    it('should buffer incomplete lines', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Complete output' }] },
      });

      // Send partial data
      mockProcess.stdout.emit('data', Buffer.from(event.substring(0, 20)));
      // Send rest of data with newline
      mockProcess.stdout.emit('data', Buffer.from(event.substring(20) + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputs).toContain('Complete output');
    });
  });

  describe('error handling', () => {
    it('should emit error event on process error', async () => {
      const errors: string[] = [];
      agent.on('error', (error) => {
        errors.push(error);
      });

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      mockProcess.emit('error', new Error('Process failed'));

      // Also emit exit to complete the promise
      mockProcess.emit('exit', 1);

      await expect(runPromise).rejects.toThrow();
      // Process error is emitted first, then exit error
      expect(errors).toContain('Process failed');
    });

    it('should set status to failed on error', async () => {
      // Add error listener to prevent unhandled error
      agent.on('error', () => {});

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      mockProcess.emit('error', new Error('Test error'));
      mockProcess.emit('exit', 1);

      await expect(runPromise).rejects.toThrow();
      expect(agent.status).toBe('failed');
    });
  });

  describe('tool_use handling', () => {
    it('should handle Write tool use in assistant message', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Writing file...' },
            { type: 'tool_use', name: 'Write' },
          ],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(agent.status).toBe('completed');
    });

    it('should handle Edit tool use in assistant message', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Edit' },
          ],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(agent.status).toBe('completed');
    });
  });

  describe('result event handling', () => {
    it('should handle result events', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'result',
        subtype: 'success',
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(agent.status).toBe('completed');
    });
  });

  describe('stderr handling', () => {
    it('should log stderr output', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      // Emit stderr data
      mockProcess.stderr.emit('data', Buffer.from('Warning: something happened\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      // Should complete successfully even with stderr output
      expect(agent.status).toBe('completed');
    });
  });

  describe('usage tracking', () => {
    it('should track usage from top-level event usage', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [] },
        usage: { input_tokens: 300, output_tokens: 100 },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      const summary = await runPromise;

      expect(summary.tokensUsed).toBe(400);
    });

    it('should handle missing token counts', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: {
          content: [],
          usage: {},
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      const summary = await runPromise;

      expect(summary.tokensUsed).toBe(0);
    });
  });

  describe('off method', () => {
    it('should remove event listener', async () => {
      const outputHandler = jest.fn();
      agent.on('output', outputHandler);
      agent.off('output', outputHandler);

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'test' }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputHandler).not.toHaveBeenCalled();
    });
  });

  describe('process without stdin', () => {
    it('should handle process without stdin', async () => {
      const processWithoutStdin = new MockChildProcess();
      processWithoutStdin.stdin = null as unknown as typeof processWithoutStdin.stdin;
      mockSpawner.spawn.mockReturnValue(processWithoutStdin);

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      processWithoutStdin.emit('exit', 0);
      await runPromise;

      // Should complete without throwing
      expect(agent.status).toBe('completed');
    });
  });

  describe('process buffer handling on exit', () => {
    it('should process remaining buffer on exit', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      // Send data without trailing newline (will be in buffer)
      mockProcess.stdout.emit('data', Buffer.from('Buffered output'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputs).toContain('Buffered output');
    });
  });

  describe('content_block_delta without text', () => {
    it('should handle content_block_delta without text', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'content_block_delta',
        delta: {},
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      // Should complete without error
      expect(agent.status).toBe('completed');
    });
  });

  describe('assistant message with empty content', () => {
    it('should handle assistant message with null content array', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      const event = JSON.stringify({
        type: 'assistant',
        message: { content: null },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(agent.status).toBe('completed');
    });
  });

  describe('JSON parsing edge cases', () => {
    it('should handle parsed JSON that is not an object', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      // Valid JSON but not an object
      mockProcess.stdout.emit('data', Buffer.from('"just a string"\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputs).toContain('"just a string"');
    });

    it('should handle null JSON', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      mockProcess.stdout.emit('data', Buffer.from('null\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputs).toContain('null');
    });

    it('should handle empty lines', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      // Multiple empty lines
      mockProcess.stdout.emit('data', Buffer.from('\n\n\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      // Empty lines should not produce output
      expect(outputs).toHaveLength(0);
    });
  });

  describe('stop edge cases', () => {
    it('should handle multiple stop calls', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      // Call stop twice
      const stopPromise1 = agent.stop();
      const stopPromise2 = agent.stop();

      mockProcess.emit('exit', null);

      await Promise.all([stopPromise1, stopPromise2]);

      await expect(runPromise).rejects.toThrow('Worker was stopped');
    });

    it('should handle stop when process has no pid', async () => {
      const processWithoutPid = new MockChildProcess();
      (processWithoutPid as { pid: number | undefined }).pid = undefined;
      mockSpawner.spawn.mockReturnValue(processWithoutPid);

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state);

      await agent.stop();

      processWithoutPid.emit('exit', null);

      await expect(runPromise).rejects.toThrow('Worker was stopped');
    });
  });
});
