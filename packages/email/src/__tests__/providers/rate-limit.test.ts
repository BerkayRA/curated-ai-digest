import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendBatchWithLimits, createPerMinuteLimiter } from '../../providers/rate-limit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock sender that resolves after `delayMs`. */
function makeSender(delayMs = 0): { fn: (msg: unknown) => Promise<string>; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn = async (msg: unknown): Promise<string> => {
    calls.push(msg);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return `sent:${String(msg)}`;
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// sendBatchWithLimits
// ---------------------------------------------------------------------------

describe('sendBatchWithLimits', () => {
  it('returns results in the same order as the input array', async () => {
    const { fn } = makeSender();
    const msgs = ['a', 'b', 'c'];
    const results = await sendBatchWithLimits(msgs, fn, { concurrency: 5, perMinute: 0 });
    expect(results).toEqual(['sent:a', 'sent:b', 'sent:c']);
  });

  it('never exceeds the concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const fn = async (msg: unknown): Promise<string> => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return `sent:${String(msg)}`;
    };

    await sendBatchWithLimits(Array.from({ length: 10 }, (_, i) => i), fn, {
      concurrency: 3,
      perMinute: 0,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('retries on a simulated 429 then succeeds', async () => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls++;
      if (calls < 3) {
        const err = Object.assign(new Error('Rate limited'), { statusCode: 429 });
        throw err;
      }
      return 'ok';
    };

    const result = await sendBatchWithLimits(['msg'], fn, {
      maxRetries: 3,
      baseDelayMs: 1, // tiny delay to keep tests fast
      maxDelayMs: 5,
      perMinute: 0,
    });

    expect(result[0]).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after max retries are exhausted', async () => {
    const fn = async (): Promise<string> => {
      const err = Object.assign(new Error('Server error'), { statusCode: 500 });
      throw err;
    };

    await expect(
      sendBatchWithLimits(['msg'], fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        perMinute: 0,
      }),
    ).rejects.toThrow('Server error');
  });

  it('does NOT retry on a permanent 4xx error (except 429)', async () => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls++;
      const err = Object.assign(new Error('Not found'), { statusCode: 404 });
      throw err;
    };

    await expect(
      sendBatchWithLimits(['msg'], fn, { maxRetries: 3, baseDelayMs: 1, perMinute: 0 }),
    ).rejects.toThrow('Not found');

    // Should only attempt once — 404 is not transient.
    expect(calls).toBe(1);
  });

  it('handles an empty messages array without error', async () => {
    const { fn } = makeSender();
    const results = await sendBatchWithLimits([], fn, { perMinute: 0 });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createPerMinuteLimiter
// ---------------------------------------------------------------------------

describe('createPerMinuteLimiter', () => {
  it('immediately resolves when perMinute is 0 (disabled)', async () => {
    const acquire = createPerMinuteLimiter(0);
    // Should resolve without hanging
    await expect(acquire()).resolves.toBeUndefined();
  });

  it('allows up to perMinute calls within a window without blocking', async () => {
    const acquire = createPerMinuteLimiter(5);
    // 5 calls should all resolve immediately
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      await acquire();
    }
    // Should have taken much less than 60 seconds
    expect(Date.now() - start).toBeLessThan(500);
  });
});
