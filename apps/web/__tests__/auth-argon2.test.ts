/**
 * argon2 password verify helper tests.
 * Verifies that argon2.hash + argon2.verify work correctly for the local
 * credentials fallback without needing a full Next.js environment.
 */

import { describe, it, expect } from 'vitest';
import argon2 from 'argon2';

describe('argon2 password hashing and verification', () => {
  const KNOWN_PASSWORD = 'SecureAdminPassword!99';

  it('verifies the correct password against its own hash', async () => {
    const hash = await argon2.hash(KNOWN_PASSWORD);
    const result = await argon2.verify(hash, KNOWN_PASSWORD);
    expect(result).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await argon2.hash(KNOWN_PASSWORD);
    const result = await argon2.verify(hash, 'WrongPassword');
    expect(result).toBe(false);
  });

  it('rejects an empty string password', async () => {
    const hash = await argon2.hash(KNOWN_PASSWORD);
    const result = await argon2.verify(hash, '');
    expect(result).toBe(false);
  });

  it('produces a different hash on each call (salt randomness)', async () => {
    const hash1 = await argon2.hash(KNOWN_PASSWORD);
    const hash2 = await argon2.hash(KNOWN_PASSWORD);
    expect(hash1).not.toBe(hash2);
    // Both hashes should still verify correctly
    expect(await argon2.verify(hash1, KNOWN_PASSWORD)).toBe(true);
    expect(await argon2.verify(hash2, KNOWN_PASSWORD)).toBe(true);
  });

  it('produces an argon2id hash (recommended variant)', async () => {
    const hash = await argon2.hash(KNOWN_PASSWORD, { type: argon2.argon2id });
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('throws on a malformed hash string', async () => {
    await expect(argon2.verify('not-a-valid-hash', KNOWN_PASSWORD)).rejects.toThrow();
  });
});
