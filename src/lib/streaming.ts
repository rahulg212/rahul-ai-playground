/**
 * The streaming chat executor.
 *
 * This is the only place that actually performs a chat request. It:
 *   1. Asks the adapter to build the provider-specific request.
 *   2. POSTs it with fetch() + AbortController (so the UI can "Stop").
 *   3. Streams the SSE response through the shared parser, feeding each JSON
 *      payload to the adapter's extractDelta/extractUsage.
 *   4. Records the masked request + raw response chunks for the debug panel.
 *
 * The adapter layer keeps provider differences OUT of this file — it never
 * needs to know whether we are talking to OpenAI, Anthropic, Gemini or
 * OpenRouter.
 */
import { iterateSSE } from '@/lib/sse';
import { providerLabel, raiseForStatus, toPlaygroundError } from '@/lib/errors';
import type {
  BuiltRequest,
  ChatMessage,
  GenerationSettings,
  PlaygroundError,
  ProviderAdapter,
  StreamOutcome,
  TokenUsage,
} from '@/lib/types';

/** Mask every header that could contain the API key, for display in the Raw panel. */
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    masked[key] = /authorization|api-key|x-goog/i.test(key) ? '***MASKED***' : value;
  }
  return masked;
}

function mergeUsage(
  current: Partial<TokenUsage> | undefined,
  incoming: Partial<TokenUsage> | null,
): Partial<TokenUsage> | undefined {
  if (!incoming) return current;
  return { ...(current ?? {}), ...incoming };
}

function prettyRequest(request: BuiltRequest): string {
  return JSON.stringify(
    {
      url: request.url,
      headers: maskHeaders(request.headers),
      body: request.body,
    },
    null,
    2,
  );
}

export interface RunChatStreamParams {
  adapter: ProviderAdapter;
  apiKey: string;
  model: string;
  systemPrompt: string;
  /** Context-limited history in internal format. */
  history: ChatMessage[];
  settings: GenerationSettings;
  signal: AbortSignal;
  /** Called with every text delta as it arrives. */
  onDelta: (delta: string) => void;
}

/** Hard cap on stored raw chunks so huge responses cannot blow up memory. */
const MAX_RAW_CHUNKS = 400;

export async function runChatStream(params: RunChatStreamParams): Promise<StreamOutcome> {
  const { adapter, apiKey, model, systemPrompt, history, settings, signal, onDelta } = params;

  const request = adapter.buildChatRequest({ apiKey, model, systemPrompt, history, settings });
  const rawRequest = prettyRequest(request);

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal,
    });
  } catch (error) {
    const normalized = toPlaygroundError(error, adapter.id);
    // Attach the request so the Raw panel can show what failed.
    normalized.rawRequest = rawRequest;
    throw normalized;
  }

  if (!response.ok) {
    try {
      await raiseForStatus(response, adapter.id);
    } catch (error) {
      if (error instanceof PlaygroundError) error.rawRequest = rawRequest;
      throw error;
    }
  }

  let text = '';
  let usage: Partial<TokenUsage> | undefined;
  const rawChunks: string[] = [];

  try {
    // Stream of `data:` payloads -> per-provider parsing below.
    for await (const payload of iterateSSE(response)) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Provider-specific end markers (OpenAI: [DONE], Anthropic: message_stop).
      if (adapter.isFinalPayload?.(payload)) break;
      if (payload.trim() === '[DONE]') break;

      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        // Not JSON (keep-alive or unexpected line) — skip it.
        continue;
      }

      if (rawChunks.length < MAX_RAW_CHUNKS) rawChunks.push(JSON.stringify(json, null, 2));

      const delta = adapter.extractDelta(json);
      if (delta) {
        text += delta;
        onDelta(delta);
      }
      usage = mergeUsage(usage, adapter.extractUsage(json));
    }
  } catch (error) {
    // Re-throw aborts so callers can keep the partial text; normalize the rest.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const normalized = toPlaygroundError(error, adapter.id);
    normalized.rawRequest = rawRequest;
    throw normalized;
  }

  return {
    text,
    usage: usage as TokenUsage | undefined,
    responseTimeMs: Math.round(performance.now() - startedAt),
    rawRequest,
    rawResponse: rawChunks.join('\n\n'),
    status: response.status,
  };
}

/** Build the error message shown under the chat input / in toasts. */
export function formatError(error: PlaygroundError, provider: ProviderAdapter['id']): string {
  const label = providerLabel(provider);
  const prefix = `${label}: `;
  if (error.kind === 'cors') return error.message;
  return `${prefix}${error.message}`;
}
