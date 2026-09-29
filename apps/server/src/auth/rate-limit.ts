import type { Clock } from './sessions.js';

interface RateLimitRule {
  /** Allowed requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets; only meaningful when not allowed. */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter per key. In-memory and per-process — correct for the
 * single API container this project runs (PLAN.md §Infra); a multi-process
 * deployment would move this to SQLite or a shared store.
 */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  /** Opportunistic sweep so spoofed/one-off keys can't grow the map forever. */
  private lastSweep = 0;

  constructor(private readonly rule: RateLimitRule) {}

  /** Records a request for `key` and reports whether it may proceed. */
  check(key: string): RateLimitDecision {
    const current = Date.now();
    this.sweep(current);
    const entry = this.hits.get(key);
    if (!entry || current >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: current + this.rule.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= this.rule.limit) {
      const remainingMs = Math.max(0, entry.resetAt - current);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      };
    }
    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.rule.windowMs) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }
}

/** The window both burst gates run on: one rolling minute. */
const ROLLING_WINDOW_MS = 60_000;

/**
 * Rolling one-minute window per user: at most `max` events, so a runaway
 * client cannot flood a shared resource — the render queue (spec §Security
 * posture) and the provider the AI Actions reach. Only accepted events consume
 * the window — callers acquire after the other gates — and expired windows are
 * dropped on touch, so the map never holds more than the users who acted
 * within the last minute. In-memory and per-process, like the fixed-window
 * limiter above.
 */
export class RollingWindowRateLimiter {
  private readonly hits = new Map<number, number[]>();

  constructor(private readonly now: Clock) {}

  /**
   * Records an event for `key` and reports whether it may proceed. `max` is
   * read at acquire time rather than held: the AI routes' ceiling is a live
   * Admin setting, and the export routes' is a fixed option — both fit here.
   */
  tryAcquire(key: number, max: number): boolean {
    const at = this.now().getTime();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => t > at - ROLLING_WINDOW_MS,
    );
    if (recent.length === 0) this.hits.delete(key);
    if (recent.length >= max) return false;
    recent.push(at);
    this.hits.set(key, recent);
    return true;
  }
}

export interface AuthRateLimitConfig {
  login?: RateLimitRule;
  register?: RateLimitRule;
  changePassword?: RateLimitRule;
  /**
   * The Google Sign-In flow (google-signin/01). One rule for the two legs, two
   * budgets drawn on it — a sign-in spends a start and a callback, and sharing
   * one window would halve the limit for everyone behind a single address,
   * which behind a Cloudflare Tunnel (ADR-0010) is every visitor.
   */
  googleSignIn?: RateLimitRule;
  /**
   * The budget for one email this instance sends, on both of its keys. Every
   * route that can mail a user shares it — registration, the resends, the reset
   * requests, the email changes, and the admin panel's two (email/02, email/05).
   * The panel draws on the same counters because its messages drain the
   * provider's cap exactly as a customer's own do; a meter of its own would be a
   * second way to drain it that nothing bounds.
   */
  emailSend?: SendRateLimitConfig;
}

/** The two keys a send endpoint is limited on. */
interface SendRateLimitConfig {
  /** The recipient — the key that protects a real inbox. */
  perAddress: RateLimitRule;
  /** The caller's address as our proxy saw it. */
  perIp: RateLimitRule;
}

/** One shared budget, held as its two keys. */
export interface SendLimiter {
  perAddress: FixedWindowRateLimiter;
  perIp: FixedWindowRateLimiter;
}

/**
 * Builds the send budget. Called once, at the composition root, and the same
 * object is handed to every route that can send — so "one budget for all of
 * them" (spec §Rate limits) is a fact about the wiring rather than a convention
 * each router has to remember.
 *
 * The keys merge shallowly, the way `authRoutes` always has: a config that
 * names `emailSend` replaces it whole.
 */
export function createSendLimiter(
  limits: AuthRateLimitConfig = {},
): SendLimiter {
  const merged = { ...DEFAULT_AUTH_RATE_LIMITS, ...limits };
  return {
    perAddress: new FixedWindowRateLimiter(merged.emailSend.perAddress),
    perIp: new FixedWindowRateLimiter(merged.emailSend.perIp),
  };
}

/** Conservative defaults; tests/ops may tighten per route. */
const DEFAULT_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };
export const DEFAULT_AUTH_RATE_LIMITS: Required<AuthRateLimitConfig> = {
  login: DEFAULT_RULE,
  register: DEFAULT_RULE,
  changePassword: DEFAULT_RULE,
  // The sign-in redirect is a full-page trip to a provider, so ten a minute is
  // far above how often a person starts one and far below a loop that would
  // spend Google's own rate limits for us. Per leg, not per flow (see above).
  googleSignIn: DEFAULT_RULE,
  // Sized against the mail provider's free tier (Resend: 100 messages a day,
  // 3,000 a month), which is a cap on the whole account, not on one key — so
  // what these buy is that a single key cannot drain it in an afternoon.
  //
  // Per address is the sharp one: three links an hour is generous to a person
  // who lost one (story 5) and nothing to a flood aimed at one inbox. Per IP is
  // deliberately looser than that arithmetic suggests, because behind a
  // Cloudflare Tunnel (ADR-0010) every visitor can share one key: an office, a
  // carrier's CGNAT, or the tunnel itself. Ten an hour is far above any real
  // user's mail and far below the 600 an hour an unthrottled registration loop
  // would send.
  emailSend: {
    perAddress: { limit: 3, windowMs: 60 * 60 * 1000 },
    perIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  },
};
