import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { getLogger } from './logger';

export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

function formatErrorResponse(err: Error): ErrorResponse {
  if (err instanceof AppError) {
    return {
      error: err.message,
      code: err.code,
    };
  }

  return {
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
  };
}

export function createErrorHandler(): ErrorRequestHandler {
  const logger = getLogger('error-handler');

  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    const isOperational = err instanceof AppError && err.isOperational;

    if (!isOperational) {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
    } else {
      logger.warn('Operational error', {
        error: err.message,
        code: (err as AppError).code,
        path: req.path,
        method: req.method,
      });
    }

    const response = formatErrorResponse(err);
    res.status(statusCode).json(response);
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
