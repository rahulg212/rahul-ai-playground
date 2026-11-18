/**
 * Server-side pass-through proxy for LLM provider APIs.
 *
 * WHY THIS EXISTS:
 *   The playground talks to providers whose endpoints live on other origins.
 *   Direct browser calls depend on each provider's CORS policy (Anthropic even
 *   needs a special "dangerous direct browser access" header) and fail outright
 *   in sandboxed preview environments or restricted networks. Routing through
 *   this local route removes all of that: the adapters still build the exact
 *   same provider request (see src/lib/providerAdapters) — this route simply
 *   forwards it and streams the provider's response back untouched, including
 *   SSE streams.
 *
 * SECURITY:
 *   Only the four allowlisted provider origins below are reachable, so the
 *   proxy can never be abused as an open relay. It is intended for local
 *   testing only.
 *
 * HOW THE CLIENT USES IT:
 *   src/lib/transport.ts rewrites  https://host/...  into
 *   /api/proxy?target=<encoded-url> for every provider call. Method, headers
 *   (Authorization / x-api-key / x-goog-api-key / anthropic-* ...) and the JSON
 *   body pass through unchanged.
 */

export const runtime = 'nodejs';
// Never cache a proxy response; streams and auth endpoints must always be live.
export const dynamic = 'force-dynamic';

/** Exact provider origins the proxy is allowed to talk to. */
const ALLOWED_ORIGINS = new Set([
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com',
  'https://openrouter.ai',
]);

/** Hop-by-hop / managed headers that must NOT be forwarded upstream. */
const BLOCKED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-connection',
  // Compression is negotiated by the server-side fetch itself.
  'accept-encoding',
  'content-length',
  // Browser context headers — the adapters set their own attribution headers.
  'origin',
  'referer',
  'cookie',
  'user-agent',
]);

/** Response headers we never copy back to the browser. */
const BLOCKED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'set-cookie',
]);

function forwardHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers.entries()) {
    if (!BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }
  return headers;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleProxy(request: Request): Promise<Response> {
  const rawTarget = new URL(request.url).searchParams.get('target') ?? '';
  let targetUrl: URL;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return jsonError('Missing or invalid "target" query parameter.', 400);
  }

  if (!ALLOWED_ORIGINS.has(targetUrl.origin)) {
    return jsonError(
      `Blocked: ${targetUrl.origin} is not an allowlisted provider origin. ` +
        'Allowed: ' + [...ALLOWED_ORIGINS].join(', '),
      403,
    );
  }

  const headers = forwardHeaders(request);

  // Only forward a body for methods that carry one.
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.text() : undefined;

  // Relay client aborts (the chat "Stop" button) to the upstream request.
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return jsonError(
      `The proxy could not reach ${targetUrl.origin}: ${(error as Error).message}`,
      502,
    );
  }

  // Copy the upstream headers back, minus hop-by-hop / framing ones.
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!BLOCKED_RESPONSE_HEADERS.has(name.toLowerCase())) {
      responseHeaders.set(name, value);
    }
  });
  // Make sure SSE and JSON never get cached anywhere in between.
  responseHeaders.set('Cache-Control', 'no-store');

  // Stream the body straight through — this is what makes SSE "typing" work.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleProxy(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleProxy(request);
}

export async function OPTIONS(): Promise<Response> {
  // Same-origin only in practice; respond permissively for completeness.
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
