/**
 * @mega-bulten/email — public API
 *
 * Email rendering pipeline entry point.
 */

export { DigestEmail } from './templates/DigestEmail.js';
export { renderDigestEmail } from './render.js';
export type { DigestEmailData, DigestItem, RenderedEmail } from './types.js';
