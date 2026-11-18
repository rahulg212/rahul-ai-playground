/**
 * OpenRouter OAuth (PKCE) — one-click key onboarding, inspired by G0DM0D3.
 *
 * Flow (100% client-side, no server secrets involved):
 *   1. Generate a random code_verifier + its S256 code_challenge.
 *   2. Redirect to https://openrouter.ai/auth?callback_url=<this app>&...
 *   3. OpenRouter signs the user in and redirects back with ?code=...
 *   4. POST the code + verifier to /api/v1/auth/keys → { key }.
 *   5. The returned key is stored like a manually pasted one.
 *
 * This runs in the browser only; crypto.subtle requires a secure context
 * (https or localhost), which the app already targets.
 */

const OR_AUTH_URL = 'https://openrouter.ai/auth';
const OR_KEY_EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';

const VERIFIER_STORAGE_KEY = 'apiPlayground.orCodeVerifier';

const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function generateCodeVerifier(length = 96): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => PKCE_CHARSET[b % PKCE_CHARSET.length]).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  // base64url per RFC 7636.
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Kick off the browser redirect flow. Call from a user gesture. */
export async function startOpenRouterLogin(): Promise<void> {
  const verifier = generateCodeVerifier();
  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  const challenge = await generateCodeChallenge(verifier);
  // The exact current URL is the callback target (works locally and in previews).
  const callbackUrl = window.location.origin + window.location.pathname;
  const url =
    `${OR_AUTH_URL}?callback_url=${encodeURIComponent(callbackUrl)}` +
    `&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
  window.location.href = url;
}

export interface OAuthExchangeResult {
  key?: string;
  error?: string;
}

/**
 * Detect an OAuth callback (?code=...) in the URL, exchange it for an API key
 * and clean the address bar. Returns { key } on success, { error } on failure,
 * and null when this page load is not an OAuth callback.
 */
export async function consumeOpenRouterOAuthCallback(): Promise<OAuthExchangeResult | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;

  // Clean the URL immediately so a reload / share never replays the code.
  window.history.replaceState({}, '', window.location.origin + window.location.pathname);

  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
  if (!verifier) {
    return { error: 'OpenRouter login session expired — please try again.' };
  }

  try {
    const response = await fetch(OR_KEY_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { error: `OpenRouter login failed (HTTP ${response.status}). ${detail.slice(0, 140)}` };
    }
    const data = (await response.json()) as { key?: string };
    if (!data.key) return { error: 'OpenRouter did not return an API key.' };
    return { key: data.key };
  } catch (error) {
    return { error: `OpenRouter login failed: ${error instanceof Error ? error.message : 'network error'}` };
  }
}
