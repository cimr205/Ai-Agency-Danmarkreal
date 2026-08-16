import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ ok: true, data });
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      details,
    },
  });
}
