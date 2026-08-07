/**
 * Promise timeout helper shared by Workers and credential-admin proxies.
 * Rejects with an Error whose `.code` is set when `code` is provided.
 */
export function withTimeout(promise, ms, code = "TIMEOUT") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(code);
      error.code = code;
      reject(error);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export const SECRETS_STORE_GET_TIMEOUT_MS = 5_000;
export const CREDENTIAL_ADMIN_RPC_TIMEOUT_MS = 5_000;
