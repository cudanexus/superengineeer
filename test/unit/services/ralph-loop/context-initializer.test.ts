import { DefaultContextInitializer } from '../../../../src/services/ralph-loop/context-initializer';
import {
  createTestRalphLoopState,
  createTestIterationSummary,
  createTestReviewerFeedback,
  createTestRalphLoopConfig,
} from '../../helpers/mock-factories';

describe('DefaultContextInitializer', () => {
  let initializer: DefaultContextInitializer;

  beforeEach(() => {
    initializer = new DefaultContextInitializer();
  });

  describe('buildWorkerContext', () => {
    it('should include task description', () => {
      const state = createTestRalphLoopState({
        config: createTestRalphLoopConfig({
          taskDescription: 'Build a REST API',
        }),
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('Build a REST API');
    });

    it('should indicate first iteration when no previous work', () => {
      const state = createTestRalphLoopState({
        summaries: [],
        feedback: [],
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('No previous iterations');
    });

    it('should include previous summaries', () => {
      const state = createTestRalphLoopState({
        summaries: [
          createTestIterationSummary({
            iterationNumber: 1,
            workerOutput: 'Created initial structure',
          }),
        ],
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('Iteration 1');
      expect(context).toContain('Created initial structure');
    });

    it('should include previous feedback', () => {
      const state = createTestRalphLoopState({
        currentIteration: 2,
        feedback: [
          createTestReviewerFeedback({
            iterationNumber: 1,
            decision: 'needs_changes',
            feedback: 'Add more tests',
          }),
        ],
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('Add more tests');
      expect(context).toContain('NEEDS_CHANGES');
    });

    it('should emphasize latest feedback on subsequent iterations', () => {
      const state = createTestRalphLoopState({
        currentIteration: 2,
        feedback: [
          createTestReviewerFeedback({
            iterationNumber: 1,
            decision: 'needs_changes',
            feedback: 'Critical issue to fix',
            specificIssues: ['Bug in auth module'],
          }),
        ],
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('IMPORTANT');
      expect(context).toContain('Bug in auth module');
      expect(context).toContain('MUST address');
    });

    it('should use custom template when provided', () => {
      const customTemplate = 'Custom: ${taskDescription}';
      const customInitializer = new DefaultContextInitializer({
        workerPromptTemplate: customTemplate,
      });

      const state = createTestRalphLoopState({
        config: createTestRalphLoopConfig({
          taskDescription: 'My Task',
        }),
      });

      const context = customInitializer.buildWorkerContext(state);

      expect(context).toBe('Custom: My Task');
    });

    it('should use config template over default', () => {
      const state = createTestRalphLoopState({
        config: createTestRalphLoopConfig({
          taskDescription: 'Task',
          workerPromptTemplate: 'Config template: ${taskDescription}',
        }),
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toBe('Config template: Task');
    });

    it('should format multiple summaries with separators', () => {
      const state = createTestRalphLoopState({
        summaries: [
          createTestIterationSummary({
            iterationNumber: 1,
            workerOutput: 'First output',
          }),
          createTestIterationSummary({
            iterationNumber: 2,
            workerOutput: 'Second output',
          }),
        ],
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('Iteration 1');
      expect(context).toContain('Iteration 2');
      expect(context).toContain('First output');
      expect(context).toContain('Second output');
    });

    it('should include files modified in summary', () => {
      const state = createTestRalphLoopState({
        summaries: [
          createTestIterationSummary({
            iterationNumber: 1,
            filesModified: ['src/api.ts', 'src/utils.ts'],
          }),
        ],
      });

      const context = initializer.buildWorkerContext(state);

      expect(context).toContain('src/api.ts');
      expect(context).toContain('src/utils.ts');
    });
  });

  describe('buildReviewerContext', () => {
    it('should include task description', () => {
      const state = createTestRalphLoopState({
        config: createTestRalphLoopConfig({
          taskDescription: 'Build a REST API',
        }),
      });

      const context = initializer.buildReviewerContext(state, 'Worker output');

      expect(context).toContain('Build a REST API');
    });

    it('should include worker output', () => {
      const state = createTestRalphLoopState();
      const workerOutput = 'I created the authentication module';

      const context = initializer.buildReviewerContext(state, workerOutput);

      expect(context).toContain('I created the authentication module');
    });

    it('should include previous feedback history', () => {
      const state = createTestRalphLoopState({
        feedback: [
          createTestReviewerFeedback({
            iterationNumber: 1,
            decision: 'needs_changes',
            feedback: 'Previous review feedback',
          }),
        ],
      });

      const context = initializer.buildReviewerContext(state, 'Current output');

      expect(context).toContain('Previous review feedback');
    });

    it('should indicate first review when no previous feedback', () => {
      const state = createTestRalphLoopState({
        feedback: [],
      });

      const context = initializer.buildReviewerContext(state, 'Worker output');

      expect(context).toContain('No previous feedback');
    });

    it('should use custom template when provided', () => {
      const customTemplate = 'Review: ${workerOutput} for ${taskDescription}';
      const customInitializer = new DefaultContextInitializer({
        reviewerPromptTemplate: customTemplate,
      });

      const state = createTestRalphLoopState({
        config: createTestRalphLoopConfig({
          taskDescription: 'Task',
        }),
      });

      const context = customInitializer.buildReviewerContext(state, 'Output');

      expect(context).toBe('Review: Output for Task');
    });

    it('should use config template over default', () => {
      const state = createTestRalphLoopState({
        config: createTestRalphLoopConfig({
          taskDescription: 'Task',
          reviewerPromptTemplate: 'Config review: ${workerOutput}',
        }),
      });

      const context = initializer.buildReviewerContext(state, 'Output');

      expect(context).toBe('Config review: Output');
    });

    it('should include specific issues from feedback', () => {
      const state = createTestRalphLoopState({
        feedback: [
          createTestReviewerFeedback({
            iterationNumber: 1,
            specificIssues: ['Missing error handling', 'No input validation'],
          }),
        ],
      });

      const context = initializer.buildReviewerContext(state, 'Current output');

      expect(context).toContain('Missing error handling');
      expect(context).toContain('No input validation');
    });

    it('should include suggested improvements from feedback', () => {
      const state = createTestRalphLoopState({
        feedback: [
          createTestReviewerFeedback({
            iterationNumber: 1,
            suggestedImprovements: ['Add retry logic', 'Improve logging'],
          }),
        ],
      });

      const context = initializer.buildReviewerContext(state, 'Current output');

      expect(context).toContain('Add retry logic');
      expect(context).toContain('Improve logging');
    });
  });
});
