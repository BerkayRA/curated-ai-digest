import { createRssProvider } from './rss-source.js';
import { createExaProvider } from './exa-source.js';
import { createRadarProvider } from './radar-source.js';
import { defaultProviders } from './providers.js';
import type { SourceProvider, Logger } from './types.js';

// ---------------------------------------------------------------------------
// Resolve source providers from the DB
// ---------------------------------------------------------------------------

/** Minimal logger used when none is provided. */
const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface ResolveProvidersOptions {
  /** Injected SourceRepository — when provided, @digest/db is NOT imported. */
  repository?: import('@digest/db').SourceRepository;
  logger?: Logger;
  /**
   * When set, only sources for this topic are resolved (`findEnabledByTopic`).
   * When absent, all enabled sources are resolved (`findEnabled`) — the
   * single-topic Phase 1a behavior.
   */
  topicId?: string;
}

/**
 * Build the list of {@link SourceProvider}s for a run.
 *
 * 1. Obtain a {@link SourceRepository}: use the injected one when provided,
 *    otherwise lazy-import `@digest/db` and call `createSourceRepository()`.
 * 2. Fetch all enabled sources via `findEnabled()`.
 * 3. Map each row to a typed provider with id `<type>:<sourceId>`.
 * 4. When no enabled sources exist, fall back to `defaultProviders()`.
 */
export async function resolveProviders(
  opts: ResolveProvidersOptions = {},
): Promise<SourceProvider[]> {
  const logger = opts.logger ?? silentLogger;

  // Obtain repository — lazy-import only when not injected.
  let repo: import('@digest/db').SourceRepository;
  if (opts.repository) {
    repo = opts.repository;
  } else {
    const db = await import('@digest/db');
    repo = db.createSourceRepository(db.prisma);
  }

  const sources =
    opts.topicId !== undefined
      ? await repo.findEnabledByTopic(opts.topicId)
      : await repo.findEnabled();

  if (sources.length === 0) {
    logger.info('resolve-providers.empty', { fallback: 'defaultProviders' });
    return defaultProviders();
  }

  const providers: SourceProvider[] = [];

  for (const source of sources) {
    const id = `${source.type}:${source.id}`;
    const config = source.config as Record<string, unknown> | null;

    if (source.type === 'rss') {
      const feeds =
        source.url != null
          ? [{ name: source.label, url: source.url }]
          : [];
      providers.push(createRssProvider(feeds, { id }));
    } else if (source.type === 'radar') {
      providers.push(
        createRadarProvider({ feedUrl: source.url ?? undefined, ...(config ?? {}) }, { id }),
      );
    } else if (source.type === 'exa') {
      const queries =
        Array.isArray(config?.['queries'])
          ? (config['queries'] as string[])
          : undefined;
      providers.push(createExaProvider({ id, queries }));
    }
  }

  return providers;
}
