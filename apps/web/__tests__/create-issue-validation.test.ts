import { describe, it, expect } from 'vitest';
import { CreateIssueDraftSchema } from '../app/api/issues/schema';

// ---------------------------------------------------------------------------
// CreateIssueDraftSchema — boundary validation for the New Issue draft flow.
// ---------------------------------------------------------------------------

const validItem = {
  titleTr: 'Yeni model duyuruldu',
  summaryTr: 'Bu hafta öne çıkan gelişme.',
  sourceUrl: 'https://example.com/haber',
  sourceName: 'Example',
};

function buildPayload(itemCount: number) {
  return {
    isoWeek: '2026-W24',
    subject: 'Bu hafta yapay zekâ',
    preheader: 'Haftanın özeti',
    items: Array.from({ length: itemCount }, (_, i) => ({
      ...validItem,
      titleTr: `${validItem.titleTr} ${i + 1}`,
    })),
  };
}

describe('CreateIssueDraftSchema', () => {
  it('accepts a draft with 1 item', () => {
    expect(CreateIssueDraftSchema.safeParse(buildPayload(1)).success).toBe(true);
  });

  it('accepts a draft with 3 items', () => {
    expect(CreateIssueDraftSchema.safeParse(buildPayload(3)).success).toBe(true);
  });

  it('accepts a draft without a preheader', () => {
    const { preheader, ...rest } = buildPayload(1);
    void preheader;
    expect(CreateIssueDraftSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects a draft with 0 items', () => {
    expect(CreateIssueDraftSchema.safeParse(buildPayload(0)).success).toBe(false);
  });

  it('rejects a draft with 4 items', () => {
    expect(CreateIssueDraftSchema.safeParse(buildPayload(4)).success).toBe(false);
  });

  it('rejects a bad isoWeek', () => {
    const payload = { ...buildPayload(1), isoWeek: '2026-24' };
    expect(CreateIssueDraftSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an empty subject', () => {
    const payload = { ...buildPayload(1), subject: '   ' };
    expect(CreateIssueDraftSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an item with a bad sourceUrl', () => {
    const payload = buildPayload(1);
    payload.items[0]!.sourceUrl = 'not-a-url';
    expect(CreateIssueDraftSchema.safeParse(payload).success).toBe(false);
  });
});
