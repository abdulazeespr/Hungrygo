import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import type { JwtPayload, RefreshPayload, AuthTokens } from '../../modules/auth/auth.types.js';

/**
 * Sign a short-lived access token.
 */
export const signAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(
    { sub: payload.sub, role: payload.role, phone: payload.phone },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
};

/**
 * Sign a long-lived refresh token and return it with a unique tokenId.
 */
export const signRefreshToken = (userId: string): { token: string; tokenId: string } => {
  const tokenId = uuidv4();
  const token = jwt.sign(
    { sub: userId, tokenId },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
  return { token, tokenId };
};

/**
 * Verify and decode an access token.
 */
export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as unknown as JwtPayload;
};

/**
 * Verify and decode a refresh token.
 */
export const verifyRefreshToken = (token: string): RefreshPayload => {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as unknown as RefreshPayload;
};

/**
 * Generate both access and refresh tokens for a user.
 */
export const generateAuthTokens = (user: { id: string; role: string; phone: string }): AuthTokens => {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, phone: user.phone });
  const { token: refreshToken, tokenId } = signRefreshToken(user.id);
  return { accessToken, refreshToken, tokenId };
};
