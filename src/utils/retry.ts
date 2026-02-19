import { getLogger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const transientPatterns = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'socket hang up',
    'network',
    'timeout',
    'temporarily unavailable',
    'service unavailable',
    'too many requests',
    'rate limit',
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, options: RetryOptions): number {
  const { delayMs, backoffMultiplier = 2, maxDelayMs = 30000 } = options;
  const calculatedDelay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
  return Math.min(calculatedDelay, maxDelayMs);
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  const logger = getLogger('retry');
  const shouldRetry = opts.shouldRetry || isTransientError;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const waitMs = calculateDelay(attempt, opts);

      logger.warn('Retrying after transient failure', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: waitMs,
        error: lastError.message,
      });

      await delay(waitMs);
    }
  }

  throw lastError || new Error('Retry failed with no error');
}

export function withRetry<T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return (...args: Parameters<T>) => retry(() => fn(...args), options);
}
