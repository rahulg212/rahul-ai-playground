/**
 * Error helpers shared by all provider adapters.
 *
 * Goal: turn any failure (bad key, rate limit, CORS, unknown model, server
 * error) into a single PlaygroundError with a clear, actionable message that
 * includes the HTTP status code when one exists.
 */
import { providerFetch } from '@/lib/transport';
import { PlaygroundError, type ProviderId } from '@/lib/types';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
};

export function providerLabel(id: ProviderId): string {
  return PROVIDER_LABELS[id];
}

/** Short human-readable hint for common HTTP status codes. */
function statusHint(status: number): string {
  switch (status) {
    case 400:
      return 'Bad request — check the model ID and parameters.';
    case 401:
    case 403:
      return 'Invalid, expired or unauthorized API key.';
    case 402:
      return 'Payment required — the account is out of credits. On OpenRouter, pick a free model (IDs ending in ":free").';
    case 404:
      return 'Not found — the model ID or endpoint does not exist.';
    case 429:
      return 'Rate limit exceeded or quota used up — wait and retry.';
    case 500:
    case 502:
    case 503:
    case 529:
      return 'Provider server error — try again later.';
    default:
      return 'Request failed.';
  }
}

/** Throw a PlaygroundError when a fetch response is not OK. */
export async function raiseForStatus(response: Response, provider: ProviderId): Promise<never> {
  const label = providerLabel(provider);
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    // ignore — some errors have no body
  }

  // Try to pull the provider's own error message out of the JSON body.
  let apiMessage = '';
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string } | string;
      message?: string;
      error_description?: string;
    };
    if (typeof parsed.error === 'object' && parsed.error?.message) {
      apiMessage = parsed.error.message;
    } else if (typeof parsed.error === 'string') {
      apiMessage = parsed.error;
    } else if (parsed.message) {
      apiMessage = parsed.message;
    } else if (parsed.error_description) {
      apiMessage = parsed.error_description;
    }
  } catch {
    if (bodyText) apiMessage = bodyText.slice(0, 300);
  }

  let kind: PlaygroundError['kind'] = 'unknown';
  if (response.status === 401 || response.status === 403) kind = 'auth';
  else if (response.status === 402) kind = 'auth';
  else if (response.status === 429) kind = 'rate_limit';
  else if (response.status === 404) kind = 'not_found';
  else if (response.status === 400) kind = 'bad_request';
  else if (response.status >= 500) kind = 'server';

  const message = `${label} API error (HTTP ${response.status}): ${apiMessage || statusHint(response.status)}`;
  throw new PlaygroundError(message, kind, response.status, bodyText || undefined);
}

/** Normalize any thrown value from fetch/streaming into a PlaygroundError. */
export function toPlaygroundError(error: unknown, provider?: ProviderId): PlaygroundError {
  if (error instanceof PlaygroundError) return error;

  // The user pressed "Stop" — surface as a distinct kind so callers can keep
  // the partial response instead of showing a scary error.
  if (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return new PlaygroundError('Generation stopped by user.', 'abort');
  }

  // fetch() throws TypeError("Failed to fetch") when the local /api/proxy
  // relay itself is unreachable (dev server down, network offline, ...).
  if (error instanceof TypeError) {
    const label = provider ? providerLabel(provider) : 'the provider';
    return new PlaygroundError(
      `Network error: could not reach the local API proxy while calling ${label}. ` +
        'Make sure the app dev server is still running, then retry.',
      'cors',
    );
  }

  return new PlaygroundError(
    error instanceof Error ? error.message : 'Unknown error occurred.',
    'unknown',
  );
}

/** fetch + parse JSON, converting every failure into a PlaygroundError. */
export async function fetchJsonOrThrow(
  url: string,
  init: RequestInit | undefined,
  provider: ProviderId,
): Promise<unknown> {
  let response: Response;
  try {
    // providerFetch relays the call through /api/proxy (see src/lib/transport.ts).
    response = await providerFetch(url, init);
  } catch (error) {
    throw toPlaygroundError(error, provider);
  }
  if (!response.ok) await raiseForStatus(response, provider);
  try {
    return await response.json();
  } catch {
    throw new PlaygroundError(`${providerLabel(provider)} returned invalid JSON.`, 'server', response.status);
  }
}
