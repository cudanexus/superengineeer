import {
  ContextInitializer,
  RalphLoopState,
  IterationSummary,
  ReviewerFeedback,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  DEFAULT_REVIEWER_PROMPT_TEMPLATE,
} from './types';

/**
 * Interpolate template variables in a string
 */
function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Format iteration summaries for inclusion in prompts
 */
function formatSummaries(summaries: IterationSummary[]): string {
  if (summaries.length === 0) {
    return 'No previous iterations yet. This is the first iteration.';
  }

  return summaries
    .map((s) => formatSingleSummary(s))
    .join('\n\n---\n\n');
}

/**
 * Format a single iteration summary
 */
function formatSingleSummary(summary: IterationSummary): string {
  const lines = [
    `### Iteration ${summary.iterationNumber}`,
    `**Timestamp:** ${summary.timestamp}`,
    `**Duration:** ${Math.round(summary.durationMs / 1000)}s`,
    `**Tokens Used:** ${summary.tokensUsed}`,
  ];

  if (summary.filesModified.length > 0) {
    lines.push(`**Files Modified:** ${summary.filesModified.join(', ')}`);
  }

  lines.push('', '**Output:**', summary.workerOutput);

  return lines.join('\n');
}

/**
 * Format reviewer feedback for inclusion in prompts
 */
function formatFeedback(feedback: ReviewerFeedback[]): string {
  if (feedback.length === 0) {
    return 'No previous feedback yet. This is the first iteration.';
  }

  return feedback
    .map((f) => formatSingleFeedback(f))
    .join('\n\n---\n\n');
}

/**
 * Format a single feedback entry
 */
function formatSingleFeedback(feedback: ReviewerFeedback): string {
  const lines = [
    `### Iteration ${feedback.iterationNumber} Review`,
    `**Decision:** ${feedback.decision.toUpperCase()}`,
    `**Timestamp:** ${feedback.timestamp}`,
    '',
    '**Feedback:**',
    feedback.feedback,
  ];

  if (feedback.specificIssues.length > 0) {
    lines.push('', '**Specific Issues:**');
    feedback.specificIssues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
  }

  if (feedback.suggestedImprovements.length > 0) {
    lines.push('', '**Suggested Improvements:**');
    feedback.suggestedImprovements.forEach((improvement) => {
      lines.push(`- ${improvement}`);
    });
  }

  return lines.join('\n');
}

/**
 * Get the most recent feedback if available
 */
function getLatestFeedback(state: RalphLoopState): ReviewerFeedback | null {
  if (state.feedback.length === 0) {
    return null;
  }

  const lastFeedback = state.feedback[state.feedback.length - 1];
  return lastFeedback ?? null;
}

export interface ContextInitializerConfig {
  workerPromptTemplate?: string;
  reviewerPromptTemplate?: string;
}

/**
 * Default implementation of ContextInitializer
 *
 * Builds fresh context for each iteration by incorporating
 * previous summaries and feedback.
 */
export class DefaultContextInitializer implements ContextInitializer {
  private readonly workerTemplate: string;
  private readonly reviewerTemplate: string;

  constructor(config: ContextInitializerConfig = {}) {
    this.workerTemplate = config.workerPromptTemplate || DEFAULT_WORKER_PROMPT_TEMPLATE;
    this.reviewerTemplate = config.reviewerPromptTemplate || DEFAULT_REVIEWER_PROMPT_TEMPLATE;
  }

  /**
   * Build context for a worker iteration
   *
   * Includes the task description, previous summaries, and reviewer feedback.
   */
  buildWorkerContext(state: RalphLoopState): string {
    const template = state.config.workerPromptTemplate || this.workerTemplate;
    const latestFeedback = getLatestFeedback(state);

    let feedbackSection = formatFeedback(state.feedback);

    // Emphasize the most recent feedback if this isn't the first iteration
    if (latestFeedback && state.currentIteration > 1) {
      feedbackSection = this.emphasizeLatestFeedback(latestFeedback, feedbackSection);
    }

    return interpolateTemplate(template, {
      taskDescription: state.config.taskDescription,
      previousSummaries: formatSummaries(state.summaries),
      previousFeedback: feedbackSection,
    });
  }

  /**
   * Add emphasis to the latest feedback for the worker
   */
  private emphasizeLatestFeedback(
    latest: ReviewerFeedback,
    fullFeedback: string
  ): string {
    const emphasis = [
      '## ⚠️ IMPORTANT: Address This Feedback First',
      '',
      `The reviewer's decision was: **${latest.decision.toUpperCase()}**`,
      '',
      latest.feedback,
    ];

    if (latest.specificIssues.length > 0) {
      emphasis.push('', '**You MUST address these issues:**');
      latest.specificIssues.forEach((issue, i) => {
        emphasis.push(`${i + 1}. ${issue}`);
      });
    }

    emphasis.push('', '---', '', '## Full Feedback History', '', fullFeedback);

    return emphasis.join('\n');
  }

  /**
   * Build context for a reviewer iteration
   *
   * Includes the task description, worker output, and previous feedback history.
   */
  buildReviewerContext(state: RalphLoopState, workerOutput: string): string {
    const template = state.config.reviewerPromptTemplate || this.reviewerTemplate;

    return interpolateTemplate(template, {
      taskDescription: state.config.taskDescription,
      workerOutput: workerOutput,
      previousFeedback: formatFeedback(state.feedback),
    });
  }
}
