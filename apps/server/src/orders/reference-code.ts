// ─────────────────────────────────────────────────────────────────────────────
// Reference Codes (ADR-0005): the short identifier shown to the user so the
// Admin can match an on-chain transaction to an Order. Five characters from an
// unambiguous alphabet — no 0/O, 1/I/L — so the code survives being read aloud
// or copied by hand. Uniqueness is the UNIQUE index's job; routes retry.
//
// The pick is `node:crypto`'s `randomInt`, which is uniform over the alphabet
// by construction: a raw byte would need rejection sampling to keep the modulo
// from biasing the early characters, and that loop was ours to maintain.
// ─────────────────────────────────────────────────────────────────────────────

import { randomInt } from 'node:crypto';

export const REFERENCE_CODE_PATTERN =
  /^PM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 5;

export function newReferenceCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `PM-${code}`;
}
