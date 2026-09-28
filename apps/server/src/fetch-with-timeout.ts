// ─────────────────────────────────────────────────────────────────────────────
// The outbound-request mechanics shared by the four HTTP clients (the AI
// provider, the Resend mailer, the Google token exchange, the LTC rate
// provider).
//
// Each client keeps its own error class, error vocabulary, and response
// reader — email/01 recorded why those do not merge — and this file owns only
// the mechanics they had all copied: the AbortController + timer dance under
// a per-request deadline, the abort test, and the bounded error-body read.
// ─────────────────────────────────────────────────────────────────────────────

/** Bound on what an upstream error body can hold (debugging detail). */
const MAX_DETAIL_LENGTH = 2_000;

/**
 * True when a failure is the deadline firing. Every client maps an abort onto
 * its own timeout error — a deadline is not a transport fault, and the
 * refusal each surface shows says which.
 */
export function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** How a request maps failures onto the client's own error vocabulary. */
export interface TimeoutFetchErrors {
  /** The client's own errors (http, invalid_response, …) pass through. */
  isOwnError: (error: unknown) => boolean;
  /** What the deadline firing becomes. */
  timeout: () => Error;
  /** What any other failure — DNS, refusal, a reset socket — becomes. */
  transport: () => Error;
}

/**
 * One request under a deadline: the fetch and the body read both run while an
 * AbortController armed for `timeoutMs` guards them, so a provider that
 * stalls mid-body times out exactly like one that never answered. The timer
 * is released when the request settles; `read` sees the Response and applies
 * the client's own parsing and HTTP-error shape.
 */
export async function fetchWithTimeout<T>(options: {
  url: string;
  init: Omit<RequestInit, 'signal'>;
  timeoutMs: number;
  read: (response: Response) => Promise<T>;
  errors: TimeoutFetchErrors;
}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(options.url, {
      ...options.init,
      signal: controller.signal,
    });
    return await options.read(response);
  } catch (error) {
    if (options.errors.isOwnError(error)) throw error;
    if (isAbortError(error)) throw options.errors.timeout();
    throw options.errors.transport();
  } finally {
    clearTimeout(timer);
  }
}

/** The upstream body, bounded and best-effort — it is debugging detail. */
export async function readDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, MAX_DETAIL_LENGTH) || null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}
