// ---------------------------------------------------------------------------
// Pipeline model routing + pricing config
// ---------------------------------------------------------------------------
// Edit MODEL_MAP to re-point any stage without touching stage logic.
// Edit PRICING to reflect current Anthropic rates (per million tokens).
// ---------------------------------------------------------------------------

/** Stage identifiers used throughout the pipeline. */
export type PipelineStage = 'rank' | 'curate' | 'copywrite' | 'editor_qa' | 'render';

/** Cost-routed model IDs per stage. Change here to re-route any stage. */
export const MODEL_MAP: Record<PipelineStage, string> = {
  rank: 'claude-sonnet-4-6',
  curate: 'claude-opus-4-8',
  copywrite: 'claude-opus-4-8',
  editor_qa: 'claude-opus-4-8',
  render: 'none', // no LLM in render stage
};

/**
 * Per-model USD pricing (per million tokens).
 * TODO: Confirm exact rates from https://www.anthropic.com/pricing before production.
 * These are approximate values for wiring/observability purposes.
 */
export const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  'claude-opus-4-8': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
  },
  // Fallback for unknown models
  unknown: {
    inputPerMillion: 0,
    outputPerMillion: 0,
  },
};

/** Maximum QA→copywrite retry iterations before giving up. */
export const MAX_QA_RETRIES = 2;

/**
 * Calculate cost in USD from token counts.
 * Returns 0 if the model is not in the PRICING map (uses 'unknown' fallback).
 */
export function calcCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rates = PRICING[model] ?? PRICING['unknown'];
  // rates is always defined because 'unknown' is a fallback above
  const { inputPerMillion, outputPerMillion } = rates!;
  return (tokensIn * inputPerMillion + tokensOut * outputPerMillion) / 1_000_000;
}
