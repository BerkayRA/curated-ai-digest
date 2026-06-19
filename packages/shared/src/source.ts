import { z } from 'zod';

// ---------------------------------------------------------------------------
// Source type enum — values MUST match the Prisma SourceType enum exactly.
// ---------------------------------------------------------------------------

export const SourceTypeSchema = z.enum(['rss', 'radar', 'exa']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

// ---------------------------------------------------------------------------
// Type-specific config schemas
// ---------------------------------------------------------------------------

const RADAR_CATEGORIES = [
  'coding_agents',
  'general_agents',
  'mcp_tooling',
  'sandbox_governance',
  'agent_frameworks',
  'model_serving',
  'ai_infrastructure',
  'physical_ai_infrastructure',
  'fun_experimental',
] as const;

const RADAR_CHANGE_TYPES = ['new', 'promoted', 'demoted', 'updated'] as const;

export const radarConfigSchema = z.object({
  /** Allowlist of radar categories to keep. Defaults to all 9 when absent. */
  categories: z.array(z.enum(RADAR_CATEGORIES)).optional(),
  /** Change types to keep. */
  changeTypes: z.array(z.enum(RADAR_CHANGE_TYPES)).optional(),
  /** Cap on the number of most-recent events returned. */
  maxItems: z.number().int().min(1).optional(),
  /** GitHub Pages base for per-project deep links. */
  siteRoot: z.string().url().optional(),
});
export type RadarConfig = z.infer<typeof radarConfigSchema>;

export const exaConfigSchema = z.object({
  /** Neural search queries sent to Exa. */
  queries: z.array(z.string()).optional(),
});
export type ExaConfig = z.infer<typeof exaConfigSchema>;

export const rssConfigSchema = z.object({});
export type RssConfig = z.infer<typeof rssConfigSchema>;

// ---------------------------------------------------------------------------
// CreateSourceSchema — discriminated union enforcing url rules per type
// ---------------------------------------------------------------------------

const baseSourceFields = z.object({
  label: z.string().min(1),
  enabled: z.boolean().default(true),
});

const createRssSchema = baseSourceFields.extend({
  type: z.literal('rss'),
  /** Required for rss — must be a valid URL. */
  url: z.string().url(),
  config: rssConfigSchema.optional(),
});

const createRadarSchema = baseSourceFields.extend({
  type: z.literal('radar'),
  /** Required for radar — must be a valid URL. */
  url: z.string().url(),
  config: radarConfigSchema.optional(),
});

const createExaSchema = baseSourceFields.extend({
  type: z.literal('exa'),
  /** Exa has no feed URL — must be omitted. */
  url: z.undefined(),
  config: exaConfigSchema.optional(),
});

export const CreateSourceSchema = z.discriminatedUnion('type', [
  createRssSchema,
  createRadarSchema,
  createExaSchema,
]);
export type CreateSourceDto = z.infer<typeof CreateSourceSchema>;

// ---------------------------------------------------------------------------
// UpdateSourceSchema — all fields optional for partial updates
// ---------------------------------------------------------------------------

export const UpdateSourceSchema = z.object({
  type: SourceTypeSchema.optional(),
  label: z.string().min(1).optional(),
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});
export type UpdateSourceDto = z.infer<typeof UpdateSourceSchema>;
