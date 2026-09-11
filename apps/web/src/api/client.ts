// ─────────────────────────────────────────────────────────────────────────────
// The fetch plumbing shared by the server API clients (auth, billing):
// same-origin POSTs with credentials, and errors crossing the boundary as
// ApiError carrying the server's `{ error }` message for display.
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  const message =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'Something went wrong.';
  return new ApiError(message, res.status);
}
