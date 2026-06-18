import { rssProvider } from './rss-source.js';
import { exaProvider } from './exa-source.js';
import { radarProvider } from './radar-source.js';
import type { SourceProvider } from './types.js';

// ---------------------------------------------------------------------------
// Default source-provider registry (ADR-0003, decision 1)
// ---------------------------------------------------------------------------

/**
 * Whether the radar provider should be part of the default registry.
 *
 * Gated OFF by default so existing runs/tests don't suddenly hit the radar
 * feed over the network. Opt in either explicitly via `RADAR_ENABLED=true`, or
 * implicitly by configuring a feed URL (`RADAR_FEED_URL`) — the latter signals
 * the operator has wired the radar into this deployment.
 *
 * `radarProvider` / `createRadarProvider` remain exported for explicit use
 * regardless of this gate (e.g. a worker can inject it via `runIngest({ providers })`).
 */
export function isRadarEnabled(): boolean {
  return process.env['RADAR_ENABLED'] === 'true' || Boolean(process.env['RADAR_FEED_URL']);
}

/**
 * The built-in providers used by `runIngest()` when no explicit list is given.
 *
 * Adding a new source = implement a {@link SourceProvider} and append it here;
 * no orchestrator changes are required. The radar provider is appended only
 * when {@link isRadarEnabled} is true (see its docs for the gating rules).
 */
export function defaultProviders(): SourceProvider[] {
  const providers: SourceProvider[] = [rssProvider, exaProvider];
  if (isRadarEnabled()) {
    providers.push(radarProvider);
  }
  return providers;
}
