/** A JSON Response for tests that stub the fetch-based API clients — one
 *  shared shape so the stubs can't drift.
 *
 *  A real `Response`, so a body is readable exactly once. A stub that answers
 *  the same call more than once — a poller, or anything under
 *  `mockResolvedValue` in a loop — must mint a fresh one per call
 *  (`vi.fn(() => Promise.resolve(jsonResponse(200, body)))`) or the second
 *  read rejects with "Body is unusable". */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
