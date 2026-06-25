/**
 * Shared helpers for provider delivery webhook signature verification.
 * Secrets are read from env by the routes; this module stays free of any
 * payload/PII handling so it can be unit tested in isolation.
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison. Returns false on any length mismatch
 * (length is not itself secret here, and timingSafeEqual throws on unequal
 * buffer lengths) and on byte mismatch.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
