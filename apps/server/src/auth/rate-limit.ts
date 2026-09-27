export interface RateLimitRule {
  /** Allowed requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
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

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a request for `key` and reports whether it may proceed. */
  check(key: string): RateLimitDecision {
    const current = this.now();
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

export interface AuthRateLimitConfig {
  login?: RateLimitRule;
  register?: RateLimitRule;
  changePassword?: RateLimitRule;
  /**
   * The budget for one email this instance sends, on both of its keys. The
   * registration link and the resend are the same kind of act, so they share
   * one budget rather than each getting their own (email/02).
   */
  emailSend?: SendRateLimitConfig;
}

/** The two keys a send endpoint is limited on. */
export interface SendRateLimitConfig {
  /** The recipient — the key that protects a real inbox. */
  perAddress: RateLimitRule;
  /** The caller's address as our proxy saw it. */
  perIp: RateLimitRule;
}

/** Conservative defaults; tests/ops may tighten per route. */
const DEFAULT_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };
export const DEFAULT_AUTH_RATE_LIMITS: Required<AuthRateLimitConfig> = {
  login: DEFAULT_RULE,
  register: DEFAULT_RULE,
  changePassword: DEFAULT_RULE,
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
