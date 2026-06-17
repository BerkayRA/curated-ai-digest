/**
 * Reorder helper for IssueItem arrays.
 *
 * Moves an item from one position to another and reindexes all orders
 * to maintain a gapless 0-based sequence (required by the @@unique([issueId, order])
 * constraint).
 *
 * Pure function — returns a new array without mutating the input.
 */

export interface OrderedItem {
  readonly id: string;
  readonly order: number;
}

/**
 * Returns a new array where the item at `fromIndex` has been moved to `toIndex`,
 * with orders reassigned 0..n-1.
 *
 * @param items      - Items sorted by their current `order` field.
 * @param fromIndex  - Current array index of the item to move.
 * @param toIndex    - Destination array index.
 * @returns          New array with updated `order` fields.
 */
export function reorderItems<T extends OrderedItem>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): Array<T & { order: number }> {
  if (fromIndex === toIndex) {
    return items.map((item, i) => ({ ...item, order: i }));
  }

  const mutable = [...items];
  const [moved] = mutable.splice(fromIndex, 1);

  if (!moved) {
    throw new Error(`reorderItems: fromIndex ${fromIndex} is out of bounds (length ${items.length})`);
  }

  mutable.splice(toIndex, 0, moved);

  return mutable.map((item, i) => ({ ...item, order: i }));
}
