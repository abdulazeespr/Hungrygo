import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../shared/errors/HttpError.js';
import { ErrorCodes } from '../shared/errors/errorCodes.js';

/**
 * Authorization middleware factory.
 * Checks if the authenticated user has one of the allowed roles.
 *
 * Usage: authorize('admin', 'mess_owner')
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, ErrorCodes.AUTH_MISSING_TOKEN, 'Authentication required.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new HttpError(403, ErrorCodes.AUTH_FORBIDDEN, 'You do not have permission to access this resource.'),
      );
    }

    next();
  };
};
