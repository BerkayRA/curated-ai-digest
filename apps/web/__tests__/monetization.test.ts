import { describe, it, expect } from 'vitest';
import { checkSponsoredItems } from '../lib/monetization';

describe('checkSponsoredItems — sponsored-slot gate', () => {
  const active = new Set(['sp-1', 'sp-2']);

  it('passes when there are no sponsored items (any consent mode)', () => {
    expect(checkSponsoredItems('business', [{ kind: 'editorial' }], active).ok).toBe(true);
    expect(checkSponsoredItems('public', [{ kind: 'editorial' }], active).ok).toBe(true);
  });

  it('rejects sponsored items on a business topic', () => {
    const r = checkSponsoredItems('business', [{ kind: 'sponsored', sponsorId: 'sp-1' }], active);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/herkese açık/);
  });

  it('rejects a sponsored item with no sponsor selected', () => {
    const r = checkSponsoredItems('public', [{ kind: 'sponsored', sponsorId: null }], active);
    expect(r.ok).toBe(false);
  });

  it('rejects a sponsored item referencing an unknown/inactive sponsor', () => {
    const r = checkSponsoredItems('public', [{ kind: 'sponsored', sponsorId: 'ghost' }], active);
    expect(r.ok).toBe(false);
  });

  it('passes a valid sponsored item on a public topic with an active sponsor', () => {
    const r = checkSponsoredItems('public', [{ kind: 'sponsored', sponsorId: 'sp-2' }], active);
    expect(r.ok).toBe(true);
  });
});
