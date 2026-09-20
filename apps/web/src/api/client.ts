// ─────────────────────────────────────────────────────────────────────────────
// The fetch plumbing shared by the server API clients (auth, billing, export):
// same-origin POSTs with credentials, and errors crossing the boundary as
// ApiError carrying the server's `{ error }` message for display — plus the
// typed `code` the export route attaches to gate rejections (billing/04's
// upgrade prompts match on it). A body with no readable error carries the
// fallback message and the `fallback` code, so callers branch on the marker,
// never the display string.
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The message shown when a body carries no readable `{ error }`, and the
 *  `code` that marks it — callers branch on this code, never the display
 *  string. */
export const FALLBACK_MESSAGE = 'Something went wrong.';
export const FALLBACK_CODE = 'fallback';

export function postJson(path: string, payload: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function putJson(path: string, payload: unknown): Promise<Response> {
  return fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteJson(path: string): Promise<Response> {
  return fetch(path, { method: 'DELETE', credentials: 'include' });
}

export async function errorFrom(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const fields =
    typeof body === 'object' && body !== null
      ? (body as { error?: unknown; code?: unknown })
      : null;
  const hasError = typeof fields?.error === 'string';
  const message = hasError
    ? (fields as { error: string }).error
    : FALLBACK_MESSAGE;
  const code = hasError
    ? typeof fields?.code === 'string'
      ? (fields as { code: string }).code
      : undefined
    : // A body we couldn't read is not a shape we understand — the fallback
      // marker is ours, and it wins over a body-supplied code.
      FALLBACK_CODE;
  return new ApiError(message, res.status, code);
}

/** One message per failure, the sections all share: the server's own message
 *  when it sent one, the offline case named plainly (fetch rejects with a
 *  TypeError when the request never reaches the API — the API process is
 *  down, or the device is offline) instead of the browser's raw "Failed to
 *  fetch", and the fallback for anything else. */
export function errorToMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof TypeError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return FALLBACK_MESSAGE;
}
