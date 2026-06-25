import type { PrismaClient, Topic } from '@prisma/client';

// ---------------------------------------------------------------------------
// Default-topic resolution
//
// Phase 1a runs a single newsletter (slug `enterprise-ai`). Library code that
// is not yet topic-aware resolves "the topic" through these helpers so the
// behavior stays identical until multiple active topics exist.
//
// NOTE: the seed slug is intentionally duplicated as `DEFAULT_TOPIC_SLUG` in
// @digest/shared (for the web topic switcher). @digest/db has no workspace deps
// by design, so we do not import it here; keep the two values in sync.
// ---------------------------------------------------------------------------

/** The seed topic slug — preferred when several active topics exist. */
const DEFAULT_TOPIC_SLUG = 'enterprise-ai';

/**
 * Return the sole active Topic.
 *
 * - Exactly one active topic → return it.
 * - Multiple active topics → prefer the one with slug `enterprise-ai`; if that
 *   is absent, fall back to the first active topic (stable by id) so callers
 *   never silently get a different topic between runs.
 * - No active topics → throw, since the pipeline cannot proceed without one.
 */
export async function getDefaultTopic(client: PrismaClient): Promise<Topic> {
  const active = await client.topic.findMany({
    where: { status: 'active' },
    orderBy: { id: 'asc' },
  });

  if (active.length === 0) {
    throw new Error(
      'No active Topic found. Seed at least one active topic before running the pipeline.',
    );
  }

  if (active.length === 1) {
    // length === 1 guarantees index 0 exists.
    return active[0] as Topic;
  }

  const preferred = active.find((t) => t.slug === DEFAULT_TOPIC_SLUG);
  return preferred ?? (active[0] as Topic);
}

/** Convenience wrapper that returns only the default topic's id. */
export async function getDefaultTopicId(client: PrismaClient): Promise<string> {
  const topic = await getDefaultTopic(client);
  return topic.id;
}
