/**
 * JSON body reader with an explicit byte limit for credential mutations.
 */

export async function readJsonBodyLimited(request, maxBytes) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { error: "UNSUPPORTED_MEDIA_TYPE" };
  }
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { error: "PAYLOAD_TOO_LARGE" };
  }
  try {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      return { error: "PAYLOAD_TOO_LARGE" };
    }
    const text = new TextDecoder().decode(buffer);
    if (!text) return { value: {} };
    return { value: JSON.parse(text) };
  } catch {
    return { error: "BAD_REQUEST" };
  }
}
