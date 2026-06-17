/**
 * Rate-limiter and retry/backoff wrapper for email provider sendBatch.
 *
 * Design:
 *   - p-limit controls per-batch concurrency (max inflight requests).
 *   - A per-minute cap is enforced via a sliding window counter.
 *   - Transient errors (HTTP 429 / 5xx) are retried with exponential
 *     backoff + full jitter (prevents thundering herd on shared queues).
 *   - Permanent failures (4xx except 429) surface immediately.
 *
 * Usage:
 *   const limited = createRateLimitedSender(send, { concurrency: 5, perMinute: 100 });
 *   const results = await sendBatchWithLimits(msgs, limited, opts);
 */

import pLimit from 'p-limit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /**
   * Maximum number of concurrent in-flight requests.
   * @default 5
   */
  concurrency?: number;
  /**
   * Maximum messages sent per 60 000 ms sliding window.
   * Set to 0 to disable the per-minute cap.
   * @default 50
   */
  perMinute?: number;
}

export interface RetryOptions {
  /**
   * Maximum number of retry attempts after the initial failure.
   * @default 3
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds before the first retry.
   * Actual delay = baseDelayMs * 2^attempt + jitter.
   * @default 500
   */
  baseDelayMs?: number;
  /**
   * Upper bound on computed delay before jitter, in milliseconds.
   * @default 16000
   */
  maxDelayMs?: number;
}

/** HTTP status codes treated as transient (worth retrying). */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extracts an HTTP status code from a thrown error, if present. */
function extractStatusCode(err: unknown): number | undefined {
  if (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as Record<string, unknown>)['statusCode'] === 'number'
  ) {
    return (err as Record<string, number>)['statusCode'];
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as Record<string, unknown>)['status'] === 'number'
  ) {
    return (err as Record<string, number>)['status'];
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>)['code'] === 'number'
  ) {
    return (err as Record<string, number>)['code'];
  }
  return undefined;
}

/** True when the error is a network hiccup or explicitly throttled. */
function isTransient(err: unknown): boolean {
  const code = extractStatusCode(err);
  if (code !== undefined) return TRANSIENT_STATUS_CODES.has(code);
  // Also treat connection-reset / timeout network errors as transient.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('throttl') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests')
    );
  }
  return false;
}

/**
 * Exponential backoff with full jitter.
 * delay = random(0, min(maxDelayMs, baseDelayMs * 2^attempt))
 */
function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  return Math.random() * exponential;
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Per-minute sliding-window rate limiter
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;

/**
 * Creates a stateful sliding-window rate-limiter closure.
 * Call `acquire()` before each send; it resolves when a slot is available.
 */
export function createPerMinuteLimiter(perMinute: number): () => Promise<void> {
  if (perMinute <= 0) return () => Promise.resolve();

  const timestamps: number[] = [];

  return async function acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      // Evict entries older than 1 minute.
      while (timestamps.length > 0 && (timestamps[0] ?? 0) <= now - WINDOW_MS) {
        timestamps.shift();
      }
      if (timestamps.length < perMinute) {
        timestamps.push(now);
        return;
      }
      // Wait until the oldest timestamp expires.
      const oldestTs = timestamps[0] ?? now;
      const waitMs = oldestTs + WINDOW_MS - now + 10; // +10ms padding
      await sleep(waitMs);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BatchSendOptions extends RateLimitOptions, RetryOptions {}

/**
 * Executes `sendOne` for each message in `msgs`, applying:
 *   1. Per-minute sliding-window throttle.
 *   2. Concurrency limit (p-limit).
 *   3. Exponential backoff + jitter retry for transient errors.
 *
 * Results are returned in the same order as `msgs`.
 */
export async function sendBatchWithLimits<T>(
  msgs: readonly unknown[],
  sendOne: (msg: unknown) => Promise<T>,
  opts: BatchSendOptions = {},
): Promise<T[]> {
  const concurrency = opts.concurrency ?? 5;
  const perMinute = opts.perMinute ?? 50;
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 16_000;

  const limit = pLimit(concurrency);
  const acquireSlot = createPerMinuteLimiter(perMinute);

  async function sendWithRetry(msg: unknown): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await acquireSlot();
        return await sendOne(msg);
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === maxRetries) {
          throw err;
        }
        const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
        await sleep(delay);
      }
    }
    // unreachable — loop always throws or returns, but satisfies TS
    throw lastErr;
  }

  return Promise.all(msgs.map((msg) => limit(() => sendWithRetry(msg))));
}
