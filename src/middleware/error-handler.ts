import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils';

const logger = getLogger('error-handler');

/**
 * Express error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Request error', {
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack,
  });

  // If response was already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Send error response
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
}