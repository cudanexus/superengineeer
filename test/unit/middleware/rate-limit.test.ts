import { Request, Response, NextFunction } from 'express';
import { createRateLimiter, createProjectRateLimiter } from '../../../src/middleware/rate-limit';

describe('Rate Limiting Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      statusCode: 200,
    };
    next = jest.fn();

    // Clear all timers
    jest.clearAllTimers();
  });

  describe('createRateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 3,
      });

      // First request
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '3');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '2');

      // Second request
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');

      // Third request
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });

    it('should block requests exceeding limit', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
        message: 'Too many requests',
      });

      // First two requests should pass
      limiter(req as Request, res as Response, next);
      limiter(req as Request, res as Response, next);

      // Third request should be blocked
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        retryAfter: expect.any(Number),
      });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should reset counter after window expires', () => {
      jest.useFakeTimers();

      const limiter = createRateLimiter({
        windowMs: 1000, // 1 second window
        maxRequests: 1,
      });

      // First request should pass
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();

      // Second request should be blocked
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();

      // Advance time past the window
      jest.advanceTimersByTime(1100);

      // Third request should pass (new window)
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle missing IP address', () => {
      req = {
        ...req,
        ip: undefined as any,
      };

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip counting successful requests when configured', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
        skipSuccessfulRequests: true,
      });

      // First request - successful
      limiter(req as Request, res as Response, next);
      res.statusCode = 200;
      (res.send as jest.Mock)('success');
      expect(next).toHaveBeenCalled();

      // Second request - successful (should not count)
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      res.statusCode = 200;
      (res.send as jest.Mock)('success');
      expect(next).toHaveBeenCalled();

      // Third request - failed (should count)
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      res.statusCode = 400;
      (res.send as jest.Mock)('error');

      // Fourth request - failed (should count and hit limit)
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      res.statusCode = 400;
      (res.send as jest.Mock)('error');

      // Fifth request should be blocked
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('createProjectRateLimiter', () => {
    it('should rate limit per project', () => {
      const limiter = createProjectRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      // Project 1 - two requests should pass
      req.params = { id: 'project-1' };
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();

      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();

      // Project 1 - third request should be blocked
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);

      // Project 2 - should have its own counter
      req.params = { id: 'project-2' };
      (next as jest.Mock).mockClear();
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle missing project ID', () => {
      const limiter = createProjectRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      req.params = {};
      limiter(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });
});