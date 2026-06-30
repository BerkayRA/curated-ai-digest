import { describe, it, expect } from 'vitest';
import {
  parseRadarConfig,
  normalizeWeights,
  quotaForCategory,
  radarConfigSchema,
} from '../config';
import { DIMENSIONS, type DimensionWeights } from '../types';

// ---------------------------------------------------------------------------
// A minimal-but-complete valid config (mirrors radar.config.yaml in RFC-001).
// ---------------------------------------------------------------------------

function validConfig(): unknown {
  return {
    version: '1.0',
    topic: 'on-prem & enterprise AI workflows',
    sources: [
      {
        id: 'github-vllm',
        type: 'github_repo',
        enabled: true,
        project: 'vLLM',
        category: 'model_serving',
        url: 'https://github.com/vllm-project/vllm',
        tags: ['model-serving', 'on-prem-relevant'],
        package: { ecosystem: 'PyPI', name: 'vllm' },
        firehose: false,
        aliases: ['vllm'],
      },
    ],
    quotas: { defaultQuota: 8, byCategory: { model_serving: 10 } },
    scoring: {
      weights: {
        workflow_impact: 0.22,
        laptop_runnability: 0.1,
        open_source_maturity: 0.16,
        on_prem_relevance: 0.2,
        security_posture: 0.12,
        demo_value: 0.08,
        setup_friction: 0.12,
      },
    },
    rings: {
      gates: {
        adopt: { minScore: 0.78, minOpenSourceMaturity: 0.6, minSecurityPosture: 0.5 },
        pilot: { minScore: 0.6 },
        watch: { minScore: 0.4 },
      },
      promotion: { band: 0.04, topFraction: 0.25 },
    },
    llm: { enabled: false, mode: 'tiebreak_only', ambiguityBand: 0.03, maxCalls: 20 },
  };
}

describe('parseRadarConfig — valid input', () => {
  it('accepts a complete valid config', () => {
    const config = parseRadarConfig(validConfig());
    expect(config.topic).toBe('on-prem & enterprise AI workflows');
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0]?.project).toBe('vLLM');
    expect(config.llm.enabled).toBe(false);
  });

  it('applies defaults for omitted optional fields', () => {
    const input = validConfig() as Record<string, unknown>;
    delete input['quotas'];
    delete input['llm'];
    const config = parseRadarConfig(input);
    // quotas + llm default; llm is OFF by default.
    expect(config.quotas.defaultQuota).toBe(8);
    expect(config.llm.enabled).toBe(false);
    expect(config.llm.mode).toBe('tiebreak_only');
  });

  it('defaults per-source enabled/firehose/tags/aliases', () => {
    const input = validConfig() as { sources: Record<string, unknown>[] };
    const source = input.sources[0];
    if (source) {
      delete source['enabled'];
      delete source['firehose'];
      delete source['tags'];
      delete source['aliases'];
    }
    const config = parseRadarConfig(input);
    expect(config.sources[0]?.enabled).toBe(true);
    expect(config.sources[0]?.firehose).toBe(false);
    expect(config.sources[0]?.tags).toEqual([]);
    expect(config.sources[0]?.aliases).toEqual([]);
  });
});

describe('parseRadarConfig — invalid input', () => {
  it('rejects an unknown top-level key (strict schema)', () => {
    const input = { ...(validConfig() as object), surprise: true };
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects an unknown key inside a source (extra: forbid)', () => {
    const input = validConfig() as { sources: Record<string, unknown>[] };
    if (input.sources[0]) input.sources[0]['notARealField'] = 1;
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects a bad category enum on a source', () => {
    const input = validConfig() as { sources: Record<string, unknown>[] };
    if (input.sources[0]) input.sources[0]['category'] = 'not_a_real_category';
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects a missing scoring dimension weight', () => {
    const input = validConfig() as { scoring: { weights: Record<string, unknown> } };
    delete input.scoring.weights['setup_friction'];
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects a non-1.0 version literal', () => {
    const input = { ...(validConfig() as object), version: '2.0' };
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects an empty sources array', () => {
    const input = { ...(validConfig() as object), sources: [] };
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects a non-URL source url', () => {
    const input = validConfig() as { sources: Record<string, unknown>[] };
    if (input.sources[0]) input.sources[0]['url'] = 'not-a-url';
    expect(() => parseRadarConfig(input)).toThrow();
  });

  it('rejects a missing required top-level field via safeParse', () => {
    const input = validConfig() as Record<string, unknown>;
    delete input['scoring'];
    const result = radarConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('normalizeWeights', () => {
  it('normalizes arbitrary positive weights to sum to 1', () => {
    const raw = Object.fromEntries(DIMENSIONS.map((d) => [d, 2])) as DimensionWeights;
    const normalized = normalizeWeights(raw);
    const total = DIMENSIONS.reduce((sum, d) => sum + normalized[d], 0);
    expect(total).toBeCloseTo(1, 10);
    // Equal inputs ⇒ equal shares.
    expect(normalized.workflow_impact).toBeCloseTo(1 / DIMENSIONS.length, 10);
  });

  it('preserves relative proportions', () => {
    const raw = {
      workflow_impact: 4,
      laptop_runnability: 1,
      open_source_maturity: 1,
      on_prem_relevance: 1,
      security_posture: 1,
      demo_value: 1,
      setup_friction: 1,
    } satisfies DimensionWeights;
    const normalized = normalizeWeights(raw);
    expect(normalized.workflow_impact).toBeCloseTo(4 * normalized.laptop_runnability, 10);
  });
});

describe('quotaForCategory', () => {
  it('returns the per-category quota when set', () => {
    const config = parseRadarConfig(validConfig());
    expect(quotaForCategory(config.quotas, 'model_serving')).toBe(10);
  });

  it('falls back to defaultQuota for unset categories', () => {
    const config = parseRadarConfig(validConfig());
    expect(quotaForCategory(config.quotas, 'coding_agents')).toBe(8);
  });
});
