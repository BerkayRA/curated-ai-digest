import { describe, it, expect } from 'vitest';
import { MODEL_MAP, PRICING, calcCostUsd, MAX_QA_RETRIES } from '../pipeline/config';

describe('pipeline config', () => {
  it('MODEL_MAP has all required stages', () => {
    expect(MODEL_MAP['rank']).toBe('claude-sonnet-4-6');
    expect(MODEL_MAP['curate']).toBe('claude-opus-4-8');
    expect(MODEL_MAP['copywrite']).toBe('claude-opus-4-8');
    expect(MODEL_MAP['editor_qa']).toBe('claude-opus-4-8');
    expect(MODEL_MAP['render']).toBe('none');
  });

  it('PRICING contains entries for all LLM models', () => {
    expect(PRICING['claude-sonnet-4-6']).toBeDefined();
    expect(PRICING['claude-opus-4-8']).toBeDefined();
  });

  it('calcCostUsd computes correctly for known model', () => {
    // 1M input + 1M output tokens at sonnet rates
    const cost = calcCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000);
    const expected =
      (1_000_000 * (PRICING['claude-sonnet-4-6']?.inputPerMillion ?? 0) +
        1_000_000 * (PRICING['claude-sonnet-4-6']?.outputPerMillion ?? 0)) /
      1_000_000;
    expect(cost).toBeCloseTo(expected);
  });

  it('calcCostUsd returns 0 for zero tokens', () => {
    expect(calcCostUsd('claude-opus-4-8', 0, 0)).toBe(0);
  });

  it('calcCostUsd returns 0 for unknown model', () => {
    expect(calcCostUsd('unknown-model-xyz', 1000, 1000)).toBe(0);
  });

  it('MAX_QA_RETRIES is a positive integer', () => {
    expect(MAX_QA_RETRIES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_QA_RETRIES)).toBe(true);
  });
});
