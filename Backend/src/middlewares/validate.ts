import type { Request, Response, NextFunction } from 'express';
import { z, type ZodType } from 'zod/v4';

interface ValidationSchema {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  cookies?: ZodType;
}

/**
 * Middleware factory that validates request body, query, params, and cookies
 * against Zod schemas. Throws VALIDATION_ERROR on failure.
 */
export const validate = (schema: ValidationSchema) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query) as typeof req.query;
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params) as typeof req.params;
      }
      if (schema.cookies) {
        req.cookies = await schema.cookies.parseAsync(req.cookies) as typeof req.cookies;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
