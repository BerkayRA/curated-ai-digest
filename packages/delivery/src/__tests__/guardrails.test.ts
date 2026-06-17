/**
 * evaluateAutoSend guardrails — unit tests for every failure branch + happy path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evaluateAutoSend } from '../guardrails.js';
import type { AutoSendInput } from '../guardrails.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<AutoSendInput> = {}): AutoSendInput {
  return {
    items: [
      { id: 'item-1', qaFlags: null },
      { id: 'item-2', qaFlags: null },
    ],
    providerOk: true,
    providerDetail: undefined,
    activeSubscriberCount: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Kill-switch env helper
// ---------------------------------------------------------------------------

function setKillSwitch(value: string | undefined) {
  if (value === undefined) {
    delete process.env['AUTOSEND_KILL_SWITCH'];
  } else {
    process.env['AUTOSEND_KILL_SWITCH'] = value;
  }
}

function setSubscriberBounds(min?: string, max?: string) {
  if (min !== undefined) process.env['AUTOSEND_MIN_SUBSCRIBERS'] = min;
  else delete process.env['AUTOSEND_MIN_SUBSCRIBERS'];
  if (max !== undefined) process.env['AUTOSEND_MAX_SUBSCRIBERS'] = max;
  else delete process.env['AUTOSEND_MAX_SUBSCRIBERS'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateAutoSend', () => {
  beforeEach(() => {
    setKillSwitch(undefined);
    setSubscriberBounds(undefined, undefined);
  });

  afterEach(() => {
    setKillSwitch(undefined);
    setSubscriberBounds(undefined, undefined);
  });

  it('returns canSend=true on happy path', () => {
    const result = evaluateAutoSend(baseInput());
    expect(result.canSend).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  describe('kill-switch', () => {
    it('blocks when AUTOSEND_KILL_SWITCH=true', () => {
      setKillSwitch('true');
      const result = evaluateAutoSend(baseInput());
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('kill-switch'))).toBe(true);
    });

    it('does not block when AUTOSEND_KILL_SWITCH=false', () => {
      setKillSwitch('false');
      const result = evaluateAutoSend(baseInput());
      expect(result.canSend).toBe(true);
    });

    it('does not block when AUTOSEND_KILL_SWITCH is unset', () => {
      setKillSwitch(undefined);
      const result = evaluateAutoSend(baseInput());
      expect(result.canSend).toBe(true);
    });
  });

  describe('no items', () => {
    it('blocks when items array is empty', () => {
      const result = evaluateAutoSend(baseInput({ items: [] }));
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('no curated items'))).toBe(true);
    });
  });

  describe('blocking QA flags', () => {
    it('blocks when an item has a non-empty qaFlags array', () => {
      const result = evaluateAutoSend(
        baseInput({
          items: [
            { id: 'item-1', qaFlags: ['grammar_issue'] },
            { id: 'item-2', qaFlags: null },
          ],
        }),
      );
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('QA flags'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('item-1'))).toBe(true);
    });

    it('blocks when multiple items have QA flags', () => {
      const result = evaluateAutoSend(
        baseInput({
          items: [
            { id: 'item-1', qaFlags: ['fact_error'] },
            { id: 'item-2', qaFlags: ['tone_issue'] },
          ],
        }),
      );
      expect(result.canSend).toBe(false);
      const flagReason = result.reasons.find((r) => r.includes('QA flags'));
      expect(flagReason).toBeDefined();
      expect(flagReason).toMatch(/2 item/);
    });

    it('does not block when qaFlags is null', () => {
      const result = evaluateAutoSend(
        baseInput({ items: [{ id: 'item-1', qaFlags: null }] }),
      );
      expect(result.canSend).toBe(true);
    });

    it('does not block when qaFlags is an empty array', () => {
      const result = evaluateAutoSend(
        baseInput({ items: [{ id: 'item-1', qaFlags: [] }] }),
      );
      expect(result.canSend).toBe(true);
    });

    it('blocks when qaFlags is an unexpected truthy non-array value', () => {
      const result = evaluateAutoSend(
        baseInput({ items: [{ id: 'item-1', qaFlags: { someFlag: true } }] }),
      );
      expect(result.canSend).toBe(false);
    });
  });

  describe('provider not configured', () => {
    it('blocks when providerOk=false', () => {
      const result = evaluateAutoSend(baseInput({ providerOk: false }));
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('not configured'))).toBe(true);
    });

    it('includes provider detail in the reason when provided', () => {
      const result = evaluateAutoSend(
        baseInput({ providerOk: false, providerDetail: 'ACS_CONNECTION_STRING missing' }),
      );
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('ACS_CONNECTION_STRING missing'))).toBe(true);
    });
  });

  describe('subscriber bounds', () => {
    it('blocks when activeSubscriberCount is below default minimum (1)', () => {
      const result = evaluateAutoSend(baseInput({ activeSubscriberCount: 0 }));
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('below the minimum'))).toBe(true);
    });

    it('blocks when activeSubscriberCount exceeds default maximum (50000)', () => {
      const result = evaluateAutoSend(baseInput({ activeSubscriberCount: 50_001 }));
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('exceeds the maximum'))).toBe(true);
    });

    it('allows exactly at the default minimum', () => {
      const result = evaluateAutoSend(baseInput({ activeSubscriberCount: 1 }));
      expect(result.canSend).toBe(true);
    });

    it('allows exactly at the default maximum', () => {
      const result = evaluateAutoSend(baseInput({ activeSubscriberCount: 50_000 }));
      expect(result.canSend).toBe(true);
    });

    it('respects AUTOSEND_MIN_SUBSCRIBERS env override', () => {
      setSubscriberBounds('10', undefined);
      const result = evaluateAutoSend(baseInput({ activeSubscriberCount: 5 }));
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('minimum of 10'))).toBe(true);
    });

    it('respects AUTOSEND_MAX_SUBSCRIBERS env override', () => {
      setSubscriberBounds(undefined, '200');
      const result = evaluateAutoSend(baseInput({ activeSubscriberCount: 201 }));
      expect(result.canSend).toBe(false);
      expect(result.reasons.some((r) => r.includes('maximum of 200'))).toBe(true);
    });
  });

  describe('multiple failures', () => {
    it('accumulates all blocking reasons', () => {
      setKillSwitch('true');
      const result = evaluateAutoSend(
        baseInput({
          items: [],
          providerOk: false,
          activeSubscriberCount: 0,
        }),
      );
      expect(result.canSend).toBe(false);
      // kill-switch + no items + provider not configured + below minimum
      expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    });
  });
});
