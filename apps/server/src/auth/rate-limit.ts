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
}

/** Conservative defaults; tests/ops may tighten per route. */
const DEFAULT_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };
export const DEFAULT_AUTH_RATE_LIMITS: Required<AuthRateLimitConfig> = {
  login: DEFAULT_RULE,
  register: DEFAULT_RULE,
  changePassword: DEFAULT_RULE,
};
