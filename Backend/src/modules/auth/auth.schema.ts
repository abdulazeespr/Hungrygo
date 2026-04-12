import { z } from 'zod/v4';

export const sendOtpSchema = {
  body: z.object({
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  }),
};

export const verifyOtpSchema = {
  body: z.object({
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
};
