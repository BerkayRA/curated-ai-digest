import { rssProvider } from './rss-source.js';
import { exaProvider } from './exa-source.js';
import type { SourceProvider } from './types.js';

// ---------------------------------------------------------------------------
// Default source-provider registry (ADR-0003, decision 1)
// ---------------------------------------------------------------------------

/**
 * The built-in providers used by `runIngest()` when no explicit list is given.
 *
 * Adding a new source = implement a {@link SourceProvider} and append it here;
 * no orchestrator changes are required. The forthcoming `radar` provider will
 * be added to this array.
 */
export function defaultProviders(): SourceProvider[] {
  return [rssProvider, exaProvider];
}
