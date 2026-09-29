// ─────────────────────────────────────────────────────────────────────────────
// The outbound-HTTP boundary, scoped to the four HTTP clients that use it (the
// AI provider, the Resend mailer, Google Sign-In's identity exchange, the LTC
// rate provider).
//
// What is shared: the failure vocabulary — one error type and one code set —
// the JSON-body reader, the bounded error-body read, and the AbortController +
// timer dance under a per-request deadline. What is not: each client writes
// its own message strings at its own throw sites, and each parses its own
// successful payload.
//
// The boundary is email/01's, drawn one level in. It held for two clients
// whose error vocabularies could plausibly diverge, and stopped holding when
// the Google and rate clients landed carrying the same four code strings by
// copy-paste — at which point the seam takes two strings and one parser, not
// the five knobs keeping the copies apart was argued to need. The full
// argument is in .scratch/ponytail-2/issues/01-one-upstream-error-vocabulary.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Bound on what an upstream error body can hold (debugging detail). */
const MAX_DETAIL_LENGTH = 2_000;

/**
 * The four ways a request at this boundary can fail. Fixed here because the
 * answer to "what happened out there" must not depend on which client asked.
 */
type UpstreamErrorCode = 'transport' | 'timeout' | 'http' | 'invalid_response';

/**
 * Every failure at this boundary, in one shape. `message` is the writing
 * client's own sentence — safe to surface or log, and never naming a provider,
 * a key, or a payload. `status` is set when the failure was an HTTP one;
 * `detail` carries the upstream body excerpt for the caller's own logging, and
 * stays null where a client deliberately does not read the body.
 */
export class UpstreamError extends Error {
  constructor(
    readonly code: UpstreamErrorCode,
    message: string,
    /** HTTP status, when the failure was an HTTP one. */
    readonly status: number | null = null,
    /** Upstream body excerpt; debugging detail only. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * True when a failure is the deadline firing. A deadline is not a transport
 * fault, and the refusal each surface shows says which.
 */
function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** The two failures a request cannot classify for itself, in the client's words. */
interface TimeoutFetchErrors {
  /** What the deadline firing becomes. */
  timeout: () => UpstreamError;
  /** What any other failure — DNS, refusal, a reset socket — becomes. */
  transport: () => UpstreamError;
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
    if (error instanceof UpstreamError) throw error;
    if (isAbortError(error)) throw options.errors.timeout();
    throw options.errors.transport();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The upstream body as JSON, or the caller's own `invalid_response` sentence for
 * a body that is not. An aborted read is rethrown rather than mapped: the
 * deadline owns that verdict, not the reader.
 */
export async function readJson(
  response: Response,
  message: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new UpstreamError('invalid_response', message);
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
