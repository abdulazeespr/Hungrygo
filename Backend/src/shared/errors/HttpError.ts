import { AppError } from './AppError.js';

export class HttpError extends AppError {
  constructor(statusCode: number, code: string, message: string) {
    super(statusCode, code, message, true);
  }
}
