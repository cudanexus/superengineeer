import { retry, withRetry } from '../../../src/utils/retry';

// Mock logger to suppress output during tests
jest.mock('../../../src/utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('retry utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retry function', () => {
    describe('successful operations', () => {
      it('should return result on first successful attempt', async () => {
        const fn = jest.fn().mockResolvedValue('success');

        const result = await retry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should return result after retry on eventual success', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockResolvedValueOnce('success');

        const result = await retry(fn, { maxAttempts: 3, delayMs: 10 });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should handle complex return values', async () => {
        const complexValue = { data: [1, 2, 3], nested: { key: 'value' } };
        const fn = jest.fn().mockResolvedValue(complexValue);

        const result = await retry(fn);

        expect(result).toEqual(complexValue);
      });
    });

    describe('failure scenarios', () => {
      it('should throw after max attempts exceeded', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

        await expect(retry(fn, { maxAttempts: 3, delayMs: 10 })).rejects.toThrow('ECONNRESET');
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should throw immediately for non-retryable errors', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('Validation failed'));

        await expect(retry(fn, { maxAttempts: 3, delayMs: 10 })).rejects.toThrow('Validation failed');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should convert non-Error throws to Error', async () => {
        const fn = jest.fn().mockRejectedValue('string error');

        await expect(retry(fn, { maxAttempts: 1, delayMs: 10 })).rejects.toThrow('string error');
      });
    });

    describe('transient error detection', () => {
      const transientErrors = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'socket hang up',
        'network error',
        'timeout occurred',
        'temporarily unavailable',
        'service unavailable',
        'too many requests',
        'rate limit exceeded',
      ];

      it.each(transientErrors)('should retry on transient error: %s', async (errorMessage) => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error(errorMessage))
          .mockResolvedValueOnce('success');

        const result = await retry(fn, { maxAttempts: 3, delayMs: 10 });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should detect transient errors case-insensitively', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockResolvedValueOnce('success');

        const result = await retry(fn, { maxAttempts: 3, delayMs: 10 });

        expect(result).toBe('success');
      });
    });

    describe('custom shouldRetry predicate', () => {
      it('should use custom shouldRetry function', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('custom-retryable'))
          .mockResolvedValueOnce('success');

        const shouldRetry = (error: Error) => error.message.includes('custom-retryable');

        const result = await retry(fn, { maxAttempts: 3, delayMs: 10, shouldRetry });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should not retry when custom shouldRetry returns false', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('do-not-retry'));

        const shouldRetry = () => false;

        await expect(retry(fn, { maxAttempts: 3, delayMs: 10, shouldRetry })).rejects.toThrow(
          'do-not-retry'
        );
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('delay and backoff', () => {
      it('should use exponential backoff', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
        const delays: number[] = [];

        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((callback, ms) => {
          if (ms && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(callback, 0);
        });

        try {
          await retry(fn, {
            maxAttempts: 4,
            delayMs: 100,
            backoffMultiplier: 2,
          });
        } catch {
          // Expected to fail
        }

        // Should have delays: 100, 200, 400 (3 retries after first attempt)
        expect(delays).toHaveLength(3);
        expect(delays[0]).toBe(100);
        expect(delays[1]).toBe(200);
        expect(delays[2]).toBe(400);

        jest.restoreAllMocks();
      });

      it('should respect maxDelayMs', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
        const delays: number[] = [];

        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((callback, ms) => {
          if (ms && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(callback, 0);
        });

        try {
          await retry(fn, {
            maxAttempts: 5,
            delayMs: 1000,
            backoffMultiplier: 10,
            maxDelayMs: 5000,
          });
        } catch {
          // Expected to fail
        }

        // All delays after the first should be capped at 5000
        delays.forEach((d) => {
          expect(d).toBeLessThanOrEqual(5000);
        });

        jest.restoreAllMocks();
      });

      it('should use default backoff multiplier of 2', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockResolvedValueOnce('success');

        const delays: number[] = [];
        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((callback, ms) => {
          if (ms && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(callback, 0);
        });

        await retry(fn, { maxAttempts: 3, delayMs: 100 });

        expect(delays[0]).toBe(100);
        expect(delays[1]).toBe(200);

        jest.restoreAllMocks();
      });
    });

    describe('maxAttempts configuration', () => {
      it('should respect maxAttempts = 1 (no retries)', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

        await expect(retry(fn, { maxAttempts: 1, delayMs: 10 })).rejects.toThrow('ECONNRESET');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should use default maxAttempts of 3', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

        await expect(retry(fn, { delayMs: 10 })).rejects.toThrow('ECONNRESET');
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('withRetry wrapper', () => {
    it('should wrap a function with retry logic', async () => {
      const originalFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce('success');

      const wrappedFn = withRetry(originalFn, { maxAttempts: 3, delayMs: 10 });

      const result = await wrappedFn();

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments through to wrapped function', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');

      const wrappedFn = withRetry(originalFn, { maxAttempts: 2 });

      await wrappedFn('arg1', 42, { key: 'value' });

      expect(originalFn).toHaveBeenCalledWith('arg1', 42, { key: 'value' });
    });

    it('should preserve function return type', async () => {
      interface User {
        id: number;
        name: string;
      }
      const getUser = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const wrappedGetUser = withRetry(getUser);

      const result: User = await wrappedGetUser();

      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should throw after max retries in wrapped function', async () => {
      const originalFn = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      const wrappedFn = withRetry(originalFn, { maxAttempts: 2, delayMs: 10 });

      await expect(wrappedFn()).rejects.toThrow('ETIMEDOUT');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle async function that resolves to undefined', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);

      const result = await retry(fn);

      expect(result).toBeUndefined();
    });

    it('should handle async function that resolves to null', async () => {
      const fn = jest.fn().mockResolvedValue(null);

      const result = await retry(fn);

      expect(result).toBeNull();
    });

    it('should handle async function that resolves to false', async () => {
      const fn = jest.fn().mockResolvedValue(false);

      const result = await retry(fn);

      expect(result).toBe(false);
    });

    it('should handle async function that resolves to 0', async () => {
      const fn = jest.fn().mockResolvedValue(0);

      const result = await retry(fn);

      expect(result).toBe(0);
    });

    it('should handle empty options object', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await retry(fn, {});

      expect(result).toBe('result');
    });
  });
});
