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

/** Marks an error whose body carried no readable `{ error }` — the message is
 *  ours, so callers branch on this code, never on the display string. */
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
  const hasError =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string';
  const message = hasError
    ? (body as { error: string }).error
    : 'Something went wrong.';
  const code =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : hasError
        ? undefined
        : FALLBACK_CODE;
  return new ApiError(message, res.status, code);
}
