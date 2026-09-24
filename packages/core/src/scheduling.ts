// ─────────────────────────────────────────────────────────────────────────────
// Yielding to the event loop (launch/05).
//
// A long document's render → paginate → mount run is hundreds of milliseconds
// of main-thread work even when the pieces are individually small: the
// paginator flushes layout once per candidate node, and a 300-page document
// has thousands of them. Left uninterrupted that is a frozen tab — no paint,
// no keystrokes, no scrolling. Every long loop in the pipeline hands the
// thread back through here between batches, so the browser stays answerable
// while the work finishes in the background.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves on a fresh task, after the browser has had the chance to paint and
 * answer input.
 *
 * A MessageChannel task, deliberately — and deliberately *not*
 * `scheduler.yield()`. The yield happens once per batch, and a long document
 * is hundreds of batches: `scheduler.yield()` resumes at user-blocking
 * priority, so chaining it hundreds of times keeps the render permanently
 * ahead of every normal-priority task on the queue. Timers and animation
 * frames are normal-priority — that variant starved them for seconds at a
 * time, which is the same frozen tab wearing a different hat. A
 * MessageChannel task lands in the ordinary queue and takes its turn, so the
 * paint, the app's own timers, and the render all keep moving.
 *
 * (`setTimeout(0)` would also be ordinary, but the browser clamps it to ~4 ms
 * after a few nested calls — too expensive to pay hundreds of times.)
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
