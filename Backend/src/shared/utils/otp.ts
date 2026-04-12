import crypto from 'node:crypto';
import logger from '../../config/logger.js';

/**
 * Generate a cryptographically random OTP of the given length.
 */
export const generateOtp = (length: number = 6): string => {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const otp = crypto.randomInt(min, max);
  return otp.toString();
};

/**
 * Send OTP to phone number.
 * In development, logs the OTP to console.
 * In production, this would integrate with an SMS gateway (e.g., Twilio, MSG91).
 */
export const sendOtp = async (phone: string, otp: string): Promise<void> => {
  // TODO: Integrate SMS gateway for production
  if (process.env.NODE_ENV === 'production') {
    // await smsGateway.send(phone, `Your Hungrygo OTP is: ${otp}`);
    logger.info(`[Hungrygo] OTP sent to ${phone.slice(0, 3)}****${phone.slice(-3)}`);
  } else {
    logger.info(`[Hungrygo] OTP for ${phone}: ${otp}`);
  }
};
