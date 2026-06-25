/**
 * A/B subject-line split — pure, deterministic helpers (no I/O).
 *
 * `assignVariant` decides, for a recipient at a given position in the list,
 * which subject variant they receive — or `null` when they fall outside the
 * test fraction (the "remainder", sent the winning subject after the holdout).
 *
 * `selectWinner` picks the variant with the highest open rate from collected
 * per-variant counts.
 */

/** Per-variant tallies used to pick a winner. */
export interface VariantStats {
  readonly variantIndex: number;
  readonly sentCount: number;
  readonly openCount: number;
}

/**
 * Deterministic variant assignment by recipient position.
 *
 * @param recipientIndex 0-based position in the ordered recipient list.
 * @param totalRecipients total recipient count (the split denominator).
 * @param testFraction    share of the list that participates in the test (0..1).
 * @param variantCount    number of variants (>= 1).
 * @returns the assigned variant index, or `null` for remainder recipients.
 */
export function assignVariant(
  recipientIndex: number,
  totalRecipients: number,
  testFraction: number,
  variantCount: number,
): number | null {
  if (variantCount < 1 || totalRecipients < 1) return null;
  const clampedFraction = Math.min(Math.max(testFraction, 0), 1);
  const testGroupSize = Math.floor(totalRecipients * clampedFraction);
  if (recipientIndex >= testGroupSize) return null; // remainder
  return recipientIndex % variantCount;
}

/**
 * Pick the winning variant by open rate (openCount / sentCount). Variants with
 * zero sends are treated as 0 rate. Ties resolve to the lowest variantIndex so
 * selection is deterministic.
 */
export function selectWinner(variants: readonly VariantStats[]): number {
  if (variants.length === 0) {
    throw new Error('selectWinner: no variants provided');
  }
  const rate = (v: VariantStats): number =>
    v.sentCount > 0 ? v.openCount / v.sentCount : 0;

  return [...variants]
    .sort((a, b) => {
      const diff = rate(b) - rate(a);
      return diff !== 0 ? diff : a.variantIndex - b.variantIndex;
    })[0]!.variantIndex;
}
