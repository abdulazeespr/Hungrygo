import type { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Send a standardized success response.
 */
export const success = <T>(res: Response, data: T, statusCode = 200, meta?: Record<string, unknown>): Response => {
  const body: SuccessResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Send a standardized paginated response.
 */
export const paginated = <T>(
  res: Response,
  items: T[],
  cursor: string | null,
  hasMore: boolean,
): Response => {
  const body: PaginatedResponse<T> = {
    success: true,
    data: items,
    meta: { cursor, hasMore },
  };
  return res.status(200).json(body);
};
