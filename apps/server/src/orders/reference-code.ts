// ─────────────────────────────────────────────────────────────────────────────
// Reference Codes (ADR-0005): the short identifier shown to the user so the
// Admin can match an on-chain transaction to an Order. Five characters from an
// unambiguous alphabet — no 0/O, 1/I/L — so the code survives being read aloud
// or copied by hand. Uniqueness is the UNIQUE index's job; routes retry.
// ─────────────────────────────────────────────────────────────────────────────

export const REFERENCE_CODE_PATTERN =
  /^PM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Rejects bytes that would bias the modulo pick (31 × 8 = 248 ≤ 256). */
const BIAS_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function newReferenceCode(): string {
  const bytes = new Uint8Array(5);
  let code = '';
  while (code.length < 5) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= BIAS_LIMIT) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === 5) break;
    }
  }
  return `PM-${code}`;
}
