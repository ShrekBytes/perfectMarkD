/** A JSON Response for tests that stub the fetch-based API clients — one
 *  shared shape so the stubs can't drift. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
