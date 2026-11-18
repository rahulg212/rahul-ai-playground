/**
 * Transport layer — the single choke point for every HTTP call to a provider.
 *
 * All requests are relayed through the local Next.js route /api/proxy (see
 * src/app/api/proxy/route.ts):
 *
 *   - It works in every environment: no dependence on the browser's ability to
 *     reach api.openai.com / api.anthropic.com / ... directly (CORS policies,
 *     sandboxed previews and corporate networks all break direct calls).
 *   - It streams: SSE responses from the provider flow through the route
 *     handler unchanged, so chat "typing" and the Stop button behave exactly
 *     like a direct call.
 *   - It is allowlisted to the four supported provider origins only.
 *
 * The provider adapters still build the REAL provider URL and headers — they
 * are shown (with the key masked) in the Raw debug panel — only the transport
 * is swapped here.
 */

/** Rewrite an absolute provider URL into a same-origin proxied URL. */
export function toProxyUrl(url: string): string {
  return `/api/proxy?target=${encodeURIComponent(url)}`;
}

/**
 * Drop-in fetch replacement used by the adapters' helpers and the streaming
 * executor. `init` (method / headers / body / signal) is forwarded verbatim.
 */
export function providerFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(toProxyUrl(url), init);
}
