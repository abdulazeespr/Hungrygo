import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { config } from '../../config/index.js';
import { success } from '../../shared/utils/response.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';

export const authController = {
  /**
   * POST /auth/send-otp
   */
  async sendOtp(req: Request, res: Response) {
    const { phone } = req.body;
    const data = await authService.sendOtp(phone);
    return success(res, data);
  },

  /**
   * POST /auth/verify-otp
   * Sets HttpOnly refresh token cookie on success.
   */
  async verifyOtp(req: Request, res: Response) {
    const { phone, otp } = req.body;
    const data = await authService.verifyOtp(phone, otp);

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
      path: '/',
    });

    // Don't send refreshToken in response body — it's in the cookie
    return success(res, {
      access_token: data.accessToken,
      user: data.user,
    });
  },

  /**
   * POST /auth/refresh-token
   * Reads refreshToken from HttpOnly cookie.
   */
  async refreshToken(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new HttpError(401, ErrorCodes.AUTH_MISSING_TOKEN, 'Refresh token is required.');
    }

    const data = await authService.refreshToken(refreshToken);
    return success(res, { access_token: data.accessToken });
  },

  /**
   * POST /auth/logout
   * Requires Bearer auth. Clears refresh token cookie.
   */
  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken || '';
    const userId = req.user!.id;

    const data = await authService.logout(userId, refreshToken);

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return success(res, data);
  },
};
