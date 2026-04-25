import { z } from 'zod/v4';

const envSchema = z.object({
  NODE_ENV:               z.enum(['development', 'production', 'test']).default('development'),
  PORT:                   z.coerce.number().default(4000),
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string().url(),
  JWT_ACCESS_SECRET:      z.string().min(32),
  JWT_REFRESH_SECRET:     z.string().min(32),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  OTP_EXPIRES_IN_SECONDS: z.coerce.number().default(300),
  OTP_LENGTH:             z.coerce.number().default(6),
  LOG_LEVEL:              z.string().default('info'),
  RAZORPAY_KEY_ID:        z.string().default('rzp_test_mock123'),
  RAZORPAY_KEY_SECRET:    z.string().default('rzp_secret_mock456'),
  RAZORPAY_WEBHOOK_SECRET:z.string().default('webhook_secret'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[Hungrygo] Invalid environment variables:', parsed.error.flatten());
  process.exit(1);
}

export const config = parsed.data;
