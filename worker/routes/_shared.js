import { errorResponse } from "../http.js";

/**
 * Map body-parse failures from readJsonBody / readJsonBodyLimited to HTTP errors.
 * @param {string} error
 * @param {string} requestId
 */
export function bodyErrorResponse(error, requestId) {
  if (error === "UNSUPPORTED_MEDIA_TYPE") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415, requestId);
  }
  if (error === "PAYLOAD_TOO_LARGE") {
    return errorResponse("PAYLOAD_TOO_LARGE", "Request body is too large.", 413, requestId);
  }
  return errorResponse("BAD_REQUEST", "Request body is not valid JSON.", 400, requestId);
}
