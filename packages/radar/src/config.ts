// ---------------------------------------------------------------------------
// @digest/radar — config schema (radar.config.yaml)
//
// Mirrors the reference radar's `config/seed-sources.yaml` (see
// docs/RADAR-DATA-CONTRACT.md) and extends it with a topic, category quotas,
// the 7 scoring-dimension weights, ring gates/promotion, and an OPTIONAL,
// OFF-BY-DEFAULT LLM second pass. See docs/RFC-001-mega-radar.md §2.
//
// The whole document is validated STRICTLY: unknown keys are rejected (the
// reference radar's `extra: forbid`). This file owns config parsing only; YAML
// → object decoding happens in the caller (the loader, a later phase).
// ---------------------------------------------------------------------------

import { z } from 'zod';
import {
  CATEGORIES,
  DIMENSIONS,
  SOURCE_TYPES,
  type Category,
  type Dimension,
  type DimensionWeights,
} from './types';

// ---- Leaf schemas ----------------------------------------------------------

const categorySchema = z.enum(CATEGORIES);
const sourceTypeSchema = z.enum(SOURCE_TYPES);

const packagePointerSchema = z
  .object({
    ecosystem: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

const backerSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['big_tech', 'startup', 'community', 'individual', 'academic']),
  })
  .strict();

// ---- Source entry (mirror of one seed-sources.yaml item) -------------------

export const sourceConfigSchema = z
  .object({
    id: z.string().min(1),
    type: sourceTypeSchema,
    enabled: z.boolean().default(true),
    project: z.string().min(1),
    category: categorySchema,
    url: z.string().url(),
    tags: z.array(z.string()).default([]),
    package: packagePointerSchema.optional(),
    backer: backerSchema.optional(),
    firehose: z.boolean().default(false),
    aliases: z.array(z.string()).default([]),
  })
  .strict();

// ---- Quotas ----------------------------------------------------------------

export const quotasConfigSchema = z
  .object({
    defaultQuota: z.number().int().positive().default(8),
    byCategory: z.record(categorySchema, z.number().int().positive()).default({}),
  })
  .strict();

// ---- Scoring weights (the 7 dimensions) ------------------------------------

/**
 * Weights for the 7 scoring dimensions. Authors may supply any positive numbers;
 * they are normalized (sum → 1) by {@link normalizeWeights} at load time. All 7
 * keys are required so a missing dimension fails validation loudly.
 */
const weightsShape = Object.fromEntries(
  DIMENSIONS.map((d) => [d, z.number().positive()] as const),
) as Record<Dimension, z.ZodNumber>;

export const weightsConfigSchema = z.object(weightsShape).strict();

export const scoringConfigSchema = z
  .object({
    weights: weightsConfigSchema,
  })
  .strict();

// ---- Ring gates + relative promotion ---------------------------------------

const ringGateSchema = z
  .object({
    minScore: z.number().min(0).max(1),
    minOpenSourceMaturity: z.number().min(0).max(1).optional(),
    minSecurityPosture: z.number().min(0).max(1).optional(),
  })
  .strict();

const ringsConfigSchema = z
  .object({
    gates: z
      .object({
        adopt: ringGateSchema,
        pilot: ringGateSchema,
        watch: ringGateSchema,
      })
      .strict(),
    promotion: z
      .object({
        band: z.number().min(0).max(1).default(0.04),
        topFraction: z.number().min(0).max(1).default(0.25),
      })
      .strict()
      .default({ band: 0.04, topFraction: 0.25 }),
  })
  .strict();

// ---- Optional LLM second pass (OFF by default) -----------------------------

export const llmConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(['tiebreak_only', 'rescore_tail']).default('tiebreak_only'),
    ambiguityBand: z.number().min(0).max(1).default(0.03),
    maxCalls: z.number().int().positive().default(20),
  })
  .strict()
  .default({
    enabled: false,
    mode: 'tiebreak_only',
    ambiguityBand: 0.03,
    maxCalls: 20,
  });

// ---- Top-level config ------------------------------------------------------

export const radarConfigSchema = z
  .object({
    version: z.literal('1.0'),
    topic: z.string().min(1),
    sources: z.array(sourceConfigSchema).min(1),
    quotas: quotasConfigSchema.default({ defaultQuota: 8, byCategory: {} }),
    scoring: scoringConfigSchema,
    rings: ringsConfigSchema,
    llm: llmConfigSchema,
  })
  .strict();

// ---- Inferred types --------------------------------------------------------

export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type QuotasConfig = z.infer<typeof quotasConfigSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type LlmConfig = z.infer<typeof llmConfigSchema>;
export type RadarConfig = z.infer<typeof radarConfigSchema>;

// ---- Helpers ---------------------------------------------------------------

/**
 * Parse and validate an already-decoded config object (YAML → object decoding
 * is the caller's job). Throws a ZodError on invalid input. Unknown keys are
 * rejected by the strict schemas.
 */
export function parseRadarConfig(input: unknown): RadarConfig {
  return radarConfigSchema.parse(input);
}

/**
 * Normalize the 7 raw weights so they sum to 1, preserving their relative
 * proportions. Pure; used by the scorer so weights can be authored as any
 * positive numbers.
 */
export function normalizeWeights(weights: DimensionWeights): DimensionWeights {
  const total = DIMENSIONS.reduce((sum, d) => sum + weights[d], 0);
  if (total <= 0) {
    throw new Error('scoring.weights must sum to a positive number');
  }
  const normalized = Object.fromEntries(
    DIMENSIONS.map((d) => [d, weights[d] / total] as const),
  ) as DimensionWeights;
  return normalized;
}

/** Resolve the quota for a category, falling back to `defaultQuota`. */
export function quotaForCategory(quotas: QuotasConfig, category: Category): number {
  return quotas.byCategory[category] ?? quotas.defaultQuota;
}
