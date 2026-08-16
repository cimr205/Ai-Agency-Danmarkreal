export class ServiceUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'service_unavailable';

  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export function isServiceUnavailableError(error: unknown): error is ServiceUnavailableError {
  return error instanceof ServiceUnavailableError;
}
