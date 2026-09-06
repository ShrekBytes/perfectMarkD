import { HTTPException } from 'hono/http-exception';
import type { MiddlewareHandler } from 'hono';

export type LogSink = (line: string) => void;

export const consoleSink: LogSink = (line) => console.log(line);

/**
 * Request logging with the project's privacy posture baked in: request
 * bodies carry document content (Server Export) and query strings can carry
 * user data — neither is ever logged. Line format: `METHOD /path STATUS Xms`.
 */
export function requestLogger(sink: LogSink = consoleSink): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    // Definite assignment: finally only runs after the try tail or the catch
    // body, both of which assign before reaching it.
    let status!: number;
    try {
      await next();
      status = c.res.status;
    } catch (error) {
      // Hono turns an HTTPException into its own status after the middleware
      // unwinds; anything else becomes the default 500.
      status = error instanceof HTTPException ? error.status : 500;
      throw error;
    } finally {
      const ms = Math.round(performance.now() - start);
      sink(`${c.req.method} ${c.req.path} ${status} ${ms}ms`);
    }
  };
}
