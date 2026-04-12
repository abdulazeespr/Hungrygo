import { Router } from 'express';
import { authController } from './auth.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { sendOtpSchema, verifyOtpSchema } from './auth.schema.js';

const router = Router();

/**
 * @openapi
 * /auth/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send OTP to phone number
 *     description: >
 *       Generates a 6-digit OTP and stores it in Redis for 5 minutes.
 *       Rate limited to 5 requests per hour per phone number.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 pattern: '^[6-9]\d{9}$'
 *                 example: '9876543210'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:    { type: string, example: 'OTP sent successfully' }
 *                     expires_in: { type: integer, example: 300 }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'VALIDATION_ERROR', message: 'Invalid Indian mobile number' }
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'AUTH_OTP_RATE_LIMITED', message: 'Too many OTP requests. Try again in 1 hour.' }
 */
router.post('/send-otp', validate(sendOtpSchema), asyncHandler(authController.sendOtp));

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP and issue tokens
 *     description: >
 *       Verifies the OTP sent to the phone number. On success,
 *       returns a short-lived access token in the response body
 *       and sets a long-lived refresh token as an HttpOnly cookie.
 *       Creates the user account if it does not exist (upsert).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone: { type: string, example: '9876543210' }
 *               otp:   { type: string, minLength: 6, maxLength: 6, example: '482910' }
 *     responses:
 *       200:
 *         description: Authentication successful
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly refresh token cookie (refreshToken)
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token: { type: string, example: 'eyJhbGci...' }
 *                     user:         { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               invalid:
 *                 value: { success: false, error: { code: 'AUTH_INVALID_OTP', message: 'The OTP entered is incorrect.' } }
 *               expired:
 *                 value: { success: false, error: { code: 'AUTH_OTP_EXPIRED', message: 'OTP has expired. Please request a new one.' } }
 */
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(authController.verifyOtp));

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: >
 *       Reads the `refreshToken` HttpOnly cookie and returns a new
 *       short-lived access token. The refresh token is validated
 *       against Redis to support revocation.
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token: { type: string, example: 'eyJhbGci...' }
 *       401:
 *         description: Missing or invalid refresh token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/refresh-token', asyncHandler(authController.refreshToken));

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and revoke refresh token
 *     description: >
 *       Deletes the refresh token from Redis, making it immediately invalid.
 *       Clears the `refreshToken` HttpOnly cookie.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: 'Logged out successfully' }
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/logout', authenticate, asyncHandler(authController.logout));

export default router;
