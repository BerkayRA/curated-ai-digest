/**
 * Pure A/B split helper tests — assignVariant + selectWinner.
 * No I/O; deterministic.
 */

import { describe, it, expect } from 'vitest';
import { assignVariant, selectWinner } from '../ab-split.js';
import type { VariantStats } from '../ab-split.js';

describe('assignVariant', () => {
  it('assigns in-test recipients to 0/1 by modulo of position', () => {
    // 10 recipients, fraction 0.5 → testGroupSize = 5. Positions 0..4 in test.
    expect(assignVariant(0, 10, 0.5, 2)).toBe(0);
    expect(assignVariant(1, 10, 0.5, 2)).toBe(1);
    expect(assignVariant(2, 10, 0.5, 2)).toBe(0);
    expect(assignVariant(3, 10, 0.5, 2)).toBe(1);
    expect(assignVariant(4, 10, 0.5, 2)).toBe(0);
  });

  it('returns null for positions past the test group (the remainder)', () => {
    // testGroupSize = 5 → positions 5..9 are remainder.
    expect(assignVariant(5, 10, 0.5, 2)).toBeNull();
    expect(assignVariant(9, 10, 0.5, 2)).toBeNull();
  });

  it('clamps testFraction above 1 to the full list', () => {
    // fraction 2 clamps to 1 → everyone is in the test group.
    expect(assignVariant(9, 10, 2, 2)).not.toBeNull();
    expect(assignVariant(9, 10, 2, 2)).toBe(1);
  });

  it('clamps testFraction below 0 to zero (no test group)', () => {
    expect(assignVariant(0, 10, -0.5, 2)).toBeNull();
  });

  it('returns null when variantCount is below 1', () => {
    expect(assignVariant(0, 10, 0.5, 0)).toBeNull();
  });

  it('returns null when totalRecipients is below 1', () => {
    expect(assignVariant(0, 0, 0.5, 2)).toBeNull();
  });
});

describe('selectWinner', () => {
  it('picks the variant with the highest open rate', () => {
    const variants: VariantStats[] = [
      { variantIndex: 0, sentCount: 100, openCount: 20 }, // 0.20
      { variantIndex: 1, sentCount: 100, openCount: 35 }, // 0.35
    ];
    expect(selectWinner(variants)).toBe(1);
  });

  it('breaks ties by lowest variantIndex', () => {
    const variants: VariantStats[] = [
      { variantIndex: 0, sentCount: 100, openCount: 30 },
      { variantIndex: 1, sentCount: 100, openCount: 30 },
    ];
    expect(selectWinner(variants)).toBe(0);
  });

  it('treats zero-sent variants as a 0 rate', () => {
    const variants: VariantStats[] = [
      { variantIndex: 0, sentCount: 0, openCount: 0 }, // rate 0
      { variantIndex: 1, sentCount: 50, openCount: 1 }, // rate 0.02
    ];
    expect(selectWinner(variants)).toBe(1);
  });

  it('throws when no variants are provided', () => {
    expect(() => selectWinner([])).toThrow(/no variants/i);
  });
});
