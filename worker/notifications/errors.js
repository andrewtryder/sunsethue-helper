export class NotificationError extends Error {
  constructor(code, { retryable = false } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

export function asNotificationError(error) {
  if (error instanceof NotificationError) return error;
  return new NotificationError("PROVIDER_UNAVAILABLE", { retryable: true });
}
