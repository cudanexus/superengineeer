import { EventEmitter } from 'events';

import { ReviewerAgent } from '../../../../src/services/ralph-loop/reviewer-agent';
import {
  createMockContextInitializer,
  createTestRalphLoopState,
} from '../../helpers/mock-factories';

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;
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

    agent = new ReviewerAgent(
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
      const runPromise = agent.run(state, 'Worker output');

      // Try to run again while running
      await expect(agent.run(state, 'Worker output')).rejects.toThrow(
        'Reviewer agent is already running'
      );

      // Clean up - send valid JSON feedback
      const feedback = JSON.stringify({
        decision: 'approve',
        feedback: 'Looks good',
        specificIssues: [],
        suggestedImprovements: [],
      });
      const event = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: feedback }],
        },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should spawn Claude process with correct arguments', async () => {
      const state = createTestRalphLoopState({
        currentIteration: 1,
      });

      const runPromise = agent.run(state, 'Worker output');

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

      // Clean up
      const feedback = JSON.stringify({
        decision: 'approve',
        feedback: 'Looks good',
      });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should call contextInitializer.buildReviewerContext', async () => {
      const state = createTestRalphLoopState();
      const workerOutput = 'Test worker output';

      const runPromise = agent.run(state, workerOutput);

      expect(mockContextInitializer.buildReviewerContext).toHaveBeenCalledWith(
        state,
        workerOutput
      );

      // Clean up
      const feedback = JSON.stringify({ decision: 'approve', feedback: 'Good' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should send context to stdin', async () => {
      mockContextInitializer.buildReviewerContext.mockReturnValue('Test reviewer context');
      const state = createTestRalphLoopState();

      const runPromise = agent.run(state, 'Worker output');

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('Test reviewer context')
      );
      expect(mockProcess.stdin.end).toHaveBeenCalled();

      // Clean up
      const feedback = JSON.stringify({ decision: 'approve', feedback: 'Good' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);
      await runPromise;
    });

    it('should return ReviewerFeedback with approve decision', async () => {
      const state = createTestRalphLoopState({ currentIteration: 2 });

      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({
        decision: 'approve',
        feedback: 'Implementation looks correct',
        specificIssues: [],
        suggestedImprovements: ['Add more tests'],
      });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;

      expect(result.iterationNumber).toBe(2);
      expect(result.decision).toBe('approve');
      expect(result.feedback).toBe('Implementation looks correct');
      expect(result.suggestedImprovements).toEqual(['Add more tests']);
    });

    it('should return ReviewerFeedback with needs_changes decision', async () => {
      const state = createTestRalphLoopState({ currentIteration: 1 });

      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({
        decision: 'needs_changes',
        feedback: 'Some issues found',
        specificIssues: ['Missing error handling', 'No tests'],
        suggestedImprovements: [],
      });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;

      expect(result.decision).toBe('needs_changes');
      expect(result.specificIssues).toEqual(['Missing error handling', 'No tests']);
    });

    it('should handle JSON in markdown code block', async () => {
      const state = createTestRalphLoopState({ currentIteration: 1 });

      const runPromise = agent.run(state, 'Worker output');

      const feedbackJson = JSON.stringify({
        decision: 'approve',
        feedback: 'Good work',
        specificIssues: [],
        suggestedImprovements: [],
      });
      const response = `Here's my review:\n\n\`\`\`json\n${feedbackJson}\n\`\`\``;
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: response }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;

      expect(result.decision).toBe('approve');
      expect(result.feedback).toBe('Good work');
    });

    it('should create fallback feedback when JSON parsing fails', async () => {
      const state = createTestRalphLoopState({ currentIteration: 1 });

      const runPromise = agent.run(state, 'Worker output');

      const plainText = 'The implementation looks good. APPROVED.';
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: plainText }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;

      expect(result.decision).toBe('approve');
      expect(result.feedback).toContain('looks good');
    });

    it('should detect reject decision from text', async () => {
      const state = createTestRalphLoopState({ currentIteration: 1 });

      const runPromise = agent.run(state, 'Worker output');

      const plainText = 'This has critical issues and should be rejected.';
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: plainText }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;

      expect(result.decision).toBe('reject');
    });

    it('should reject on non-zero exit code', async () => {
      const state = createTestRalphLoopState();

      // Add error listener to prevent unhandled error
      agent.on('error', () => {});

      const runPromise = agent.run(state, 'Worker output');
      mockProcess.emit('exit', 1);

      await expect(runPromise).rejects.toThrow(
        'Reviewer process exited with code 1'
      );
    });

    it('should update status to running then completed', async () => {
      const statusChanges: string[] = [];
      agent.on('status', (status) => statusChanges.push(status));

      const state = createTestRalphLoopState();

      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'approve', feedback: 'Good' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);
      await runPromise;

      expect(statusChanges).toContain('running');
      expect(statusChanges).toContain('completed');
    });

    it('should emit output events', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'approve', feedback: 'LGTM' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      expect(outputs.length).toBeGreaterThan(0);
    });

    it('should emit complete event with feedback', async () => {
      let emittedFeedback: unknown = null;
      agent.on('complete', (feedback) => {
        emittedFeedback = feedback;
      });

      const state = createTestRalphLoopState({ currentIteration: 3 });
      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'approve', feedback: 'Done' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);
      await runPromise;

      expect(emittedFeedback).toBeDefined();
      expect((emittedFeedback as { iterationNumber: number }).iterationNumber).toBe(3);
    });
  });

  describe('stop', () => {
    it('should do nothing if not running', async () => {
      await agent.stop();

      expect(agent.status).toBe('idle');
    });

    it('should stop running process', async () => {
      const state = createTestRalphLoopState();

      const runPromise = agent.run(state, 'Worker output');

      // Stop immediately
      const stopPromise = agent.stop();

      // Simulate process exit after stop
      mockProcess.emit('exit', null);

      await stopPromise;

      // Run promise should reject because it was stopped
      await expect(runPromise).rejects.toThrow('Reviewer was stopped');
    });
  });

  describe('stream event handling', () => {
    it('should handle content_block_delta events', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      const delta1 = JSON.stringify({
        type: 'content_block_delta',
        delta: { text: '{"decision": "approve",' },
      });
      mockProcess.stdout.emit('data', Buffer.from(delta1 + '\n'));

      const delta2 = JSON.stringify({
        type: 'content_block_delta',
        delta: { text: ' "feedback": "Good"}' },
      });
      mockProcess.stdout.emit('data', Buffer.from(delta2 + '\n'));

      mockProcess.emit('exit', 0);
      const result = await runPromise;

      expect(outputs).toContain('{"decision": "approve",');
      expect(outputs).toContain(' "feedback": "Good"}');
      expect(result.decision).toBe('approve');
    });

    it('should handle non-JSON output gracefully', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      // Send non-JSON text that contains "approved"
      mockProcess.stdout.emit('data', Buffer.from('Work looks good, APPROVED\n'));

      mockProcess.emit('exit', 0);
      const result = await runPromise;

      expect(outputs).toContain('Work looks good, APPROVED');
      expect(result.decision).toBe('approve');
    });

    it('should buffer incomplete lines', async () => {
      const outputs: string[] = [];
      agent.on('output', (content) => outputs.push(content));

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'approve', feedback: 'Complete' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });

      // Send partial data
      mockProcess.stdout.emit('data', Buffer.from(event.substring(0, 20)));
      // Send rest of data with newline
      mockProcess.stdout.emit('data', Buffer.from(event.substring(20) + '\n'));

      mockProcess.emit('exit', 0);
      await runPromise;

      // Should have captured the complete feedback text
      const hasCompleteOutput = outputs.some(o => o.includes('Complete'));
      expect(hasCompleteOutput).toBe(true);
    });
  });

  describe('decision normalization', () => {
    it('should normalize "approved" to "approve"', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'approved', feedback: 'Good' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;
      expect(result.decision).toBe('approve');
    });

    it('should normalize "rejected" to "reject"', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'rejected', feedback: 'Bad' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;
      expect(result.decision).toBe('reject');
    });

    it('should normalize "needs-changes" to "needs_changes"', async () => {
      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      const feedback = JSON.stringify({ decision: 'needs-changes', feedback: 'Fix' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: feedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      const result = await runPromise;
      expect(result.decision).toBe('needs_changes');
    });
  });

  describe('error handling', () => {
    it('should emit error event on process error', async () => {
      const errors: string[] = [];
      agent.on('error', (error) => {
        errors.push(error);
      });

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      mockProcess.emit('error', new Error('Process failed'));

      // Also emit exit to complete the promise
      mockProcess.emit('exit', 1);

      await expect(runPromise).rejects.toThrow();
      expect(errors).toContain('Process failed');
    });

    it('should set status to failed on error', async () => {
      // Add error listener to prevent unhandled error
      agent.on('error', () => {});

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      mockProcess.emit('error', new Error('Test error'));
      mockProcess.emit('exit', 1);

      await expect(runPromise).rejects.toThrow();
      expect(agent.status).toBe('failed');
    });

    it('should fail when JSON missing decision field', async () => {
      agent.on('error', () => {});

      const state = createTestRalphLoopState();
      const runPromise = agent.run(state, 'Worker output');

      // Send invalid feedback (missing decision)
      const invalidFeedback = JSON.stringify({ feedback: 'No decision' });
      const event = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: invalidFeedback }] },
      });
      mockProcess.stdout.emit('data', Buffer.from(event + '\n'));
      mockProcess.emit('exit', 0);

      // Should create fallback feedback with needs_changes
      const result = await runPromise;
      expect(result.decision).toBe('needs_changes');
    });
  });
});
