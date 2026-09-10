import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id (the library's default parameters: 19 MiB
 * memory, 2 iterations). Hashing is deliberately async — the native binding
 * frees the event loop while it works.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/**
 * Hash of a throwaway string, argon2id with the same parameters as real
 * hashes. Login verifies against it when the account doesn't exist so the
 * response time doesn't reveal whether an email is registered. Never a
 * password anyone can hold: it hashes an internal constant, not user input.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$uMikMpzluMyuz+k5gKLQKQ$AltWy2UgeIJ6liim1l7zNZpUXMYEVsnYUdM9Rw+64O4';

/**
 * Verifies a password against a stored hash. A malformed/legacy hash is a
 * failed match, never a thrown error — callers only care whether it matched.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
