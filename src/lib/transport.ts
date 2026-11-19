/**
 * Transport layer — direct provider HTTP communication.
 *
 * Designed for local-first, zero-backend, client-side execution (perfect for
 * GitHub Pages and local usage).
 *
 * Direct browser calls:
 *   - Google Gemini: Full CORS enabled by Google API.
 *   - OpenRouter: Full CORS enabled with public models and free tier.
 *   - Anthropic: Full CORS enabled via 'anthropic-dangerous-direct-browser-access: true'.
 *   - OpenAI: Direct browser fetch or optional custom CORS proxy URL.
 */

/** Retrieve user-configured proxy if stored in settings. */
export function getCustomProxy(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('apiPlayground.settings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return (parsed.customProxyUrl || '').trim();
  } catch {
    return '';
  }
}

/**
 * Rewrites an absolute provider URL if a custom proxy is configured.
 * Otherwise returns the provider URL directly for client-side fetch.
 */
export function toProxyUrl(url: string): string {
  const customProxy = getCustomProxy();
  if (!customProxy) return url;

  if (customProxy.includes('%s')) {
    return customProxy.replace('%s', encodeURIComponent(url));
  }
  return `${customProxy.replace(/\/+$/, '')}/${encodeURIComponent(url)}`;
}

/**
 * Drop-in fetch replacement used by adapters and the streaming executor.
 */
export async function providerFetch(url: string, init?: RequestInit): Promise<Response> {
  const targetUrl = toProxyUrl(url);
  try {
    return await fetch(targetUrl, init);
  } catch (err: unknown) {
    // If direct fetch failed and it looks like a CORS or network error, provide clear diagnostics
    const isCorsOrNetwork = err instanceof TypeError && err.message.toLowerCase().includes('fetch');
    if (isCorsOrNetwork && url.includes('api.openai.com') && !getCustomProxy()) {
      throw new Error(
        'OpenAI API direct browser request blocked by browser CORS policy. ' +
        'Solutions: 1) Use OpenRouter (which proxies OpenAI models with full browser CORS and has free models), ' +
        '2) Use Google Gemini or Anthropic Claude, or 3) Set a CORS Proxy URL in Settings.',
      );
    }
    throw err;
  }
}
