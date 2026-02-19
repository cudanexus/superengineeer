import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../utils';

/**
 * Creates a validation middleware for request body
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        next(new ValidationError(message));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Creates a validation middleware for query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.query);
      // Use Object.assign to maintain Express query object prototype
      Object.assign(req.query, validated);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        next(new ValidationError(message));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Creates a validation middleware for route parameters
 */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.params);
      // Use Object.assign to maintain Express params object
      Object.assign(req.params, validated);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        next(new ValidationError(message));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validates numeric parameters
 */
export function validateNumericParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (value && isNaN(Number(value))) {
      next(new ValidationError(`${paramName} must be a valid number`));
    } else {
      next();
    }
  };
}

/**
 * Validates UUID parameters
 */
export function validateUuidParam(paramName: string): RequestHandler {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (value && !uuidRegex.test(value)) {
      next(new ValidationError(`${paramName} must be a valid UUID`));
    } else {
      next();
    }
  };
}