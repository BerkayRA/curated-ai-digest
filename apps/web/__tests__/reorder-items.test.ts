import { describe, it, expect } from 'vitest';
import { reorderItems } from '../lib/reorder-items';

const makeItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, order: i }));

describe('reorderItems', () => {
  it('moves an item from index 0 to index 2 and reindexes', () => {
    const items = makeItems(3);
    const result = reorderItems(items, 0, 2);

    expect(result[0]!.id).toBe('item-1');
    expect(result[1]!.id).toBe('item-2');
    expect(result[2]!.id).toBe('item-0');

    expect(result[0]!.order).toBe(0);
    expect(result[1]!.order).toBe(1);
    expect(result[2]!.order).toBe(2);
  });

  it('moves an item from index 2 to index 0', () => {
    const items = makeItems(3);
    const result = reorderItems(items, 2, 0);

    expect(result[0]!.id).toBe('item-2');
    expect(result[1]!.id).toBe('item-0');
    expect(result[2]!.id).toBe('item-1');
  });

  it('no-op when fromIndex equals toIndex — still reindexes orders', () => {
    const items = [
      { id: 'a', order: 5 },
      { id: 'b', order: 10 },
    ];
    const result = reorderItems(items, 1, 1);
    expect(result[1]!.id).toBe('b');
    expect(result[1]!.order).toBe(1);
  });

  it('preserves all item ids', () => {
    const items = makeItems(3);
    const result = reorderItems(items, 0, 2);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['item-0', 'item-1', 'item-2']);
  });

  it('produces gapless 0-based order values regardless of input orders', () => {
    const items = [
      { id: 'x', order: 100 },
      { id: 'y', order: 200 },
      { id: 'z', order: 300 },
    ];
    const result = reorderItems(items, 0, 2);
    expect(result.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it('throws if fromIndex is out of bounds', () => {
    const items = makeItems(2);
    expect(() => reorderItems(items, 5, 0)).toThrow(/fromIndex/);
  });

  it('does not mutate the input array', () => {
    const items = makeItems(3);
    const copy = [...items];
    reorderItems(items, 0, 2);
    expect(items).toEqual(copy);
  });
});
