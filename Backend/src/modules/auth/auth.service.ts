import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import logger from '../../config/logger.js';
import { authRepository } from './auth.repository.js';
import { generateOtp, sendOtp } from '../../shared/utils/otp.js';
import { generateAuthTokens, signAccessToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { checkRateLimit } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';

export const authService = {
  /**
   * Send OTP to a phone number.
   * Rate limited to 5 requests per hour per phone.
   * Stores OTP in Redis with 5-minute TTL.
   */
  async sendOtp(phone: string) {
    // Check rate limit: max 5 OTP requests per hour
    await checkRateLimit(phone, {
      keyPrefix: 'otp_attempts',
      maxRequests: 5,
      windowSeconds: 3600,
      errorCode: ErrorCodes.AUTH_OTP_RATE_LIMITED,
      errorMessage: 'Too many OTP requests. Try again in 1 hour.',
    });

    // Generate and store OTP
    const otp = generateOtp(config.OTP_LENGTH);
    await redis.set(`otp:${phone}`, otp, 'EX', config.OTP_EXPIRES_IN_SECONDS);

    // Send OTP (logs in dev, SMS gateway in prod)
    await sendOtp(phone, otp);

    return {
      message: 'OTP sent successfully',
      expires_in: config.OTP_EXPIRES_IN_SECONDS,
    };
  },

  /**
   * Verify OTP and issue auth tokens.
   * Upserts user in database.
   * Stores refresh token reference in Redis.
   */
  async verifyOtp(phone: string, otp: string) {
    // Get stored OTP from Redis
    const storedOtp = await redis.get(`otp:${phone}`);

    if (!storedOtp) {
      throw new HttpError(400, ErrorCodes.AUTH_OTP_EXPIRED, 'OTP has expired. Please request a new one.');
    }

    if (storedOtp !== otp) {
      throw new HttpError(400, ErrorCodes.AUTH_INVALID_OTP, 'The OTP entered is incorrect.');
    }

    // OTP valid — delete it
    await redis.del(`otp:${phone}`);

    // Upsert user
    const user = await authRepository.upsertByPhone(phone);

    // Generate tokens
    const tokens = generateAuthTokens({
      id: user.id,
      role: user.role,
      phone: user.phone,
    });

    // Store refresh token reference in Redis for revocation
    // Key: rt:{userId}:{tokenId} = "1", TTL: 30 days
    await redis.set(
      `rt:${user.id}:${tokens.tokenId}`,
      '1',
      'EX',
      2592000, // 30 days in seconds
    );

    logger.info(`[Hungrygo] User authenticated: ${user.id}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
    };
  },

  /**
   * Refresh access token using a valid refresh token.
   * Validates the refresh token exists in Redis (not revoked).
   */
  async refreshToken(refreshTokenValue: string) {
    // Verify the refresh token JWT
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenValue);
    } catch {
      throw new HttpError(401, ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid or expired refresh token.');
    }

    // Check if refresh token exists in Redis (not revoked)
    const exists = await redis.exists(`rt:${decoded.sub}:${decoded.tokenId}`);
    if (!exists) {
      throw new HttpError(401, ErrorCodes.AUTH_INVALID_TOKEN, 'Refresh token has been revoked.');
    }

    // Look up user to get current role and phone
    const user = await authRepository.findById(decoded.sub);
    if (!user) {
      throw new HttpError(401, ErrorCodes.AUTH_INVALID_TOKEN, 'User not found.');
    }

    // Sign a new access token
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      phone: user.phone,
    });

    return { accessToken };
  },

  /**
   * Logout: revoke refresh token from Redis.
   */
  async logout(userId: string, refreshTokenValue: string) {
    try {
      const decoded = verifyRefreshToken(refreshTokenValue);
      // Delete the specific refresh token from Redis
      await redis.del(`rt:${decoded.sub}:${decoded.tokenId}`);
    } catch {
      // Token may be invalid/expired, still proceed with logout
    }

    logger.info(`[Hungrygo] User logged out: ${userId}`);

    return { message: 'Logged out successfully' };
  },
};
