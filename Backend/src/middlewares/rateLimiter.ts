import redis from '../config/redis.js';
import { HttpError } from '../shared/errors/HttpError.js';
import { ErrorCodes } from '../shared/errors/errorCodes.js';

interface RateLimitOptions {
  /** Redis key prefix */
  keyPrefix: string;
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Error code to use when rate limit is exceeded */
  errorCode?: string;
  /** Error message when rate limit is exceeded */
  errorMessage?: string;
}

/**
 * Redis-based sliding window rate limiter.
 * Uses INCR + EXPIRE pattern.
 *
 * @param identifier - unique key (e.g., phone number or IP)
 * @param options - rate limit configuration
 * @throws HttpError with 429 status if rate limit exceeded
 */
export const checkRateLimit = async (
  identifier: string,
  options: RateLimitOptions,
): Promise<void> => {
  const key = `${options.keyPrefix}:${identifier}`;
  const current = await redis.incr(key);

  if (current === 1) {
    // First request — set TTL
    await redis.expire(key, options.windowSeconds);
  }

  if (current > options.maxRequests) {
    throw new HttpError(
      429,
      options.errorCode || ErrorCodes.AUTH_OTP_RATE_LIMITED,
      options.errorMessage || 'Too many requests. Please try again later.',
    );
  }
};
