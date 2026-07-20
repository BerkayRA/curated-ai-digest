/**
 * send-helpers.ts — shared env + address helpers for the worker's one-off
 * Resend send scripts (test-send.ts, send-issue.ts).
 *
 * Secrets live in a gitignored apps/worker/.env.local (see .env.example) so they
 * never hit the command line / shell history. Explicit inline env vars still win
 * (loadEnvFile does not overwrite already-set vars).
 */

import { existsSync } from 'node:fs';

/** A parsed email recipient — bare address plus an optional display name. */
export interface Address {
  readonly email: string;
  readonly name?: string;
}

/**
 * Load apps/worker/.env.local (gitignored) if present, so RESEND_API_KEY, the
 * DATABASE_URL, and the test recipient can live in a file. No-op when the file
 * is absent or the runtime lacks process.loadEnvFile.
 */
export function loadEnvLocal(): void {
  const envPath = new URL('../.env.local', import.meta.url).pathname;
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
}

/** Read a required env var, exiting with a clear message when it is missing. */
export function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

/** Parse "Name <email@host>" or a bare "email@host" into a recipient. */
export function parseAddress(raw: string): Address {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m && m[2]) {
    return m[1] ? { email: m[2], name: m[1] } : { email: m[2] };
  }
  return { email: raw.trim() };
}
