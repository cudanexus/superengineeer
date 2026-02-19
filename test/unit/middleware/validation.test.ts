import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams, validateNumericParam, validateUuidParam } from '../../../src/middleware/validation';
import { ValidationError } from '../../../src/utils';

describe('Validation Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
    };
    res = {};
    next = jest.fn();
  });

  describe('validateBody', () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    it('should pass valid body', () => {
      req.body = { name: 'John', age: 25 };
      const middleware = validateBody(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({ name: 'John', age: 25 });
    });

    it('should reject invalid body', () => {
      req.body = { name: '', age: -5 };
      const middleware = validateBody(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toContain('Too small');
    });

    it('should handle missing required fields', () => {
      req.body = { name: 'John' };
      const middleware = validateBody(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toContain('age: Invalid input');
    });

    it('should forward non-ZodError errors', () => {
      const throwingSchema = {
        parse: () => { throw new TypeError('unexpected'); },
      } as unknown as z.ZodSchema;
      const middleware = validateBody(throwingSchema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(TypeError));
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({
      page: z.string().regex(/^\d+$/).transform(Number),
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    });

    it('should pass valid query', () => {
      req.query = { page: '1', limit: '10' };
      const middleware = validateQuery(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.query).toEqual({ page: 1, limit: 10 });
    });

    it('should handle optional fields', () => {
      req.query = { page: '1' };
      const middleware = validateQuery(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.query).toEqual({ page: 1 });
    });

    it('should reject invalid query', () => {
      req.query = { page: 'abc', limit: '10' };
      const middleware = validateQuery(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should forward non-ZodError errors', () => {
      const throwingSchema = {
        parse: () => { throw new RangeError('unexpected'); },
      } as unknown as z.ZodSchema;
      const middleware = validateQuery(throwingSchema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(RangeError));
    });
  });

  describe('validateParams', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    it('should pass valid params', () => {
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const middleware = validateParams(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid UUID', () => {
      req.params = { id: 'not-a-uuid' };
      const middleware = validateParams(schema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should forward non-ZodError errors', () => {
      const throwingSchema = {
        parse: () => { throw new Error('unexpected'); },
      } as unknown as z.ZodSchema;
      const middleware = validateParams(throwingSchema);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error).not.toBeInstanceOf(ValidationError);
    });
  });

  describe('validateNumericParam', () => {
    it('should pass numeric param', () => {
      req.params = { index: '42' };
      const middleware = validateNumericParam('index');

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject non-numeric param', () => {
      req.params = { index: 'abc' };
      const middleware = validateNumericParam('index');

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('index must be a valid number');
    });

    it('should handle missing param', () => {
      req.params = {};
      const middleware = validateNumericParam('index');

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('validateUuidParam', () => {
    it('should pass valid UUID', () => {
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const middleware = validateUuidParam('id');

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid UUID', () => {
      req.params = { id: 'not-a-uuid' };
      const middleware = validateUuidParam('id');

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('id must be a valid UUID');
    });

    it('should handle missing param', () => {
      req.params = {};
      const middleware = validateUuidParam('id');

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});