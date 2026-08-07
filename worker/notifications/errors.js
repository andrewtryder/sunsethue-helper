export class NotificationError extends Error {
  constructor(code, { retryable = false, cause, metadata = {} } = {}) {
    super(code, { cause });
    this.code = code;
    this.retryable = retryable;
    this.metadata = metadata;
  }
}

export function asNotificationError(error) {
  if (error instanceof NotificationError) return error;
  return new NotificationError("PROVIDER_UNAVAILABLE", { retryable: true, cause: error });
}
