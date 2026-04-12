import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod/v4';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../shared/errors/AppError.js';
import { ErrorCodes } from '../shared/errors/errorCodes.js';
import logger from '../config/logger.js';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/**
 * Global error handler middleware.
 * Handles errors in order:
 * 1. ZodError → 400 VALIDATION_ERROR
 * 2. Prisma P2002 → 409 CONFLICT
 * 3. Prisma P2025 → 404 NOT_FOUND
 * 4. AppError (operational) → statusCode + code
 * 5. Unknown → 500 INTERNAL_ERROR
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // 1. Zod Validation Error
  if (err instanceof z.ZodError) {
    const response: ErrorResponseBody = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed.',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
    res.status(400).json(response);
    return;
  }

  // 2. Prisma Known Request Error — unique constraint violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const response: ErrorResponseBody = {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: 'Resource already exists.',
        },
      };
      res.status(409).json(response);
      return;
    }

    // 3. Prisma Known Request Error — record not found
    if (err.code === 'P2025') {
      const response: ErrorResponseBody = {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'Record not found.',
        },
      };
      res.status(404).json(response);
      return;
    }
  }

  // 4. Operational AppError (includes HttpError)
  if (err instanceof AppError && err.isOperational) {
    const response: ErrorResponseBody = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // 5. Unknown / non-operational error — 500
  logger.error('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  const response: ErrorResponseBody = {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
    },
  };
  res.status(500).json(response);
};
