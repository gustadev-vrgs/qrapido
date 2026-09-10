import assert from "node:assert/strict";

// A fetch body is a stream: consume it once, then reuse the parsed value.
export async function expectJson(response, expectedStatus, context = "HTTP response") {
  const text = await response.text();
  let data;
  let parseError;
  try {
    data = JSON.parse(text);
  } catch (error) {
    parseError = error;
  }
  // Report API errors without dumping successful payloads containing credentials.
  const detail = typeof data?.error === "string" ? data.error : data?.error?.message;
  assert.equal(response.status, expectedStatus,
    `${context}: expected HTTP ${expectedStatus}, received ${response.status}${detail ? ` (${detail})` : ""}`);
  assert.ok(!parseError, `${context}: HTTP ${response.status} returned invalid JSON`);
  return data;
}

export function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(15_000) });
}
