import type { NextFunction, Request, Response } from 'express';

export type ApiErrorCode = 'not_found' | 'validation_error' | 'server_error';

export class ApiError extends Error {
  code: ApiErrorCode;
  field?: string;
  status: number;

  constructor(code: ApiErrorCode, message: string, field?: string, status?: number) {
    super(message);
    this.code = code;
    this.field = field;
    this.status =
      status ??
      (code === 'not_found' ? 404 : code === 'validation_error' ? 422 : 500);
  }
}

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    const payload: { error: { code: ApiErrorCode; message: string; field?: string } } = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.field) {
      payload.error.field = err.field;
    }
    res.status(err.status).json(payload);
    return;
  }

  console.error('[vigil-api] Unexpected error:', err);
  res.status(500).json({
    error: {
      code: 'server_error',
      message: err instanceof Error ? err.message : 'Internal server error',
    },
  });
}
