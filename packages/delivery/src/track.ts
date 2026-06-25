/**
 * Engagement tracking hooks for outbound digest emails.
 *
 * Pure string post-processing applied to already-rendered HTML:
 *  - rewrites item source links to click-tracking redirect URLs
 *  - appends a 1x1 open-tracking pixel before </body>
 *
 * No DOM, no mutation — returns a new string so callers stay side-effect free.
 */

/** Escapes a string for safe use inside a `new RegExp(...)` pattern. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds the 1x1 transparent open-tracking pixel `<img>` tag. */
function buildOpenPixel(trackToken: string, baseUrl: string): string {
  const src = `${baseUrl}/api/track/open/${trackToken}`;
  return (
    `<img src="${src}" width="1" height="1" alt="" ` +
    `style="display:block;border:0;max-height:1px;overflow:hidden;" />`
  );
}

/**
 * Rewrites `href="<sourceUrl>"` occurrences to click-tracking redirect URLs and
 * appends an open-tracking pixel before `</body>` (or at the end if absent).
 *
 * The click URL uses the item's `order` field as the index so the click route
 * can resolve the destination via `items.find(i => i.order === urlIndex)`.
 *
 * @param html       Rendered email HTML.
 * @param trackToken Per-Send opaque token.
 * @param items      Issue items in order; null `sourceUrl` entries are skipped.
 * @param baseUrl    Public app base URL (no trailing slash).
 * @returns A new HTML string with tracking hooks injected.
 */
export function injectTrackingHooks(
  html: string,
  trackToken: string,
  items: Array<{ sourceUrl: string | null; order: number }>,
  baseUrl: string,
): string {
  let result = items.reduce((acc, item) => {
    if (item.sourceUrl === null) {
      return acc;
    }
    const clickUrl = `${baseUrl}/api/track/click/${trackToken}/${item.order}`;
    const pattern = new RegExp(`href="${escapeRegExp(item.sourceUrl)}"`, 'g');
    return acc.replace(pattern, `href="${clickUrl}"`);
  }, html);

  const pixel = buildOpenPixel(trackToken, baseUrl);
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${pixel}</body>`);
  } else {
    result = `${result}${pixel}`;
  }

  return result;
}
