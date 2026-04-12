export const ErrorCodes = {
  VALIDATION_ERROR:       'VALIDATION_ERROR',
  AUTH_INVALID_OTP:       'AUTH_INVALID_OTP',
  AUTH_OTP_EXPIRED:       'AUTH_OTP_EXPIRED',
  AUTH_OTP_RATE_LIMITED:  'AUTH_OTP_RATE_LIMITED',
  AUTH_MISSING_TOKEN:     'AUTH_MISSING_TOKEN',
  AUTH_INVALID_TOKEN:     'AUTH_INVALID_TOKEN',
  AUTH_FORBIDDEN:         'AUTH_FORBIDDEN',
  CONFLICT:              'CONFLICT',
  NOT_FOUND:             'NOT_FOUND',
  INTERNAL_ERROR:        'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
