import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../shared/utils/jwt.js';
import { HttpError } from '../shared/errors/HttpError.js';
import { ErrorCodes } from '../shared/errors/errorCodes.js';

/**
 * Middleware to authenticate requests using Bearer JWT access tokens.
 * Extracts the token from the Authorization header, verifies it,
 * and attaches the decoded payload to req.user.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, ErrorCodes.AUTH_MISSING_TOKEN, 'Access token is required.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new HttpError(401, ErrorCodes.AUTH_MISSING_TOKEN, 'Access token is required.');
    }

    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      role: decoded.role,
      phone: decoded.phone,
    };

    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
    } else {
      next(new HttpError(401, ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid or expired access token.'));
    }
  }
};
