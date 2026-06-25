/**
 * Topic resolution for request handlers.
 *
 * Multi-topic surfaces carry the active topic as a `?topic=<slug>` query param
 * (or a `topicSlug` field in a mutation body). These helpers turn that slug
 * into a topicId, falling back to the default topic when the slug is absent or
 * unknown — so a missing/stale param degrades to current single-topic behavior
 * instead of failing the request.
 */

import { prisma, createTopicRepository, getDefaultTopicId } from '@digest/db';

/** Resolve a topicId from an optional slug, falling back to the default topic. */
export async function resolveTopicIdBySlug(
  slug: string | null | undefined,
): Promise<string> {
  if (slug) {
    const topic = await createTopicRepository(prisma).findBySlug(slug);
    if (topic) return topic.id;
  }
  return getDefaultTopicId(prisma);
}

/** Resolve a topicId from a request's `?topic=<slug>` query param. */
export async function resolveTopicIdFromRequest(request: Request): Promise<string> {
  const slug = new URL(request.url).searchParams.get('topic');
  return resolveTopicIdBySlug(slug);
}
