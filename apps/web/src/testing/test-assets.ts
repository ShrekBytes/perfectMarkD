import type { IDBPDatabase } from 'idb';

/** A minimal PNG-typed test file of `size` bytes (ingest only sniffs the
 *  type, so the payload need not be a real image). */
export function pngFile(name = 'photo.png', size = 8): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

/** Lets fake-indexeddb's pending auto-commit steps finish before the connection
 *  closes; closing mid-commit surfaces as an unhandled transaction AbortError
 *  rejection. Waits on `setImmediate` rather than `setTimeout` because that is
 *  what fake-indexeddb's `queueTask` schedules transaction steps on — a timeout
 *  tick sits in an earlier event-loop phase, so the close can still win the race
 *  and flake under load. */
export async function closeAfterSettle(db: IDBPDatabase): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  db.close();
}
