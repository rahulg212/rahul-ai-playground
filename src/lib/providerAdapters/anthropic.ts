/**
 * Anthropic (Claude) adapter.
 *
 * Endpoint:  POST https://api.anthropic.com/v1/messages
 * Headers:   "x-api-key: <KEY>"
 *            "anthropic-version: 2023-06-01"
 *            "anthropic-dangerous-direct-browser-access: true"
 *            (the last one is REQUIRED for direct browser calls — without it
 *             Anthropic rejects requests that expose the key in the browser)
 * System:    goes in the TOP-LEVEL `system` field, NOT as a message.
 * max_tokens: REQUIRED by the Messages API.
 * Streaming: SSE events, each with a typed JSON payload:
 *            message_start        -> usage.input_tokens
 *            content_block_delta  -> delta.type === "text_delta" -> delta.text
 *            message_delta        -> usage.output_tokens (cumulative)
 *            message_stop         -> end of stream
 */
import { DEFAULT_MODELS } from '@/lib/providerDefaults';
import { fetchModelsWithKey, testKeyViaModels } from '@/lib/providerAdapters/shared';
import type {
  BuildChatRequestArgs,
  BuiltRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderId,
  TestKeyResult,
  TokenUsage,
} from '@/lib/types';

const BASE = 'https://api.anthropic.com/v1';
const PROVIDER: ProviderId = 'anthropic';

/** Shape of one streamed Messages-API event (only what we need). */
interface AnthropicEvent {
  type?: string;
  delta?: { type?: string; text?: string };
  message?: { usage?: { input_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Mandatory when calling the API straight from the browser.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function buildChatRequest(args: BuildChatRequestArgs): BuiltRequest {
  const { apiKey, model, systemPrompt, history, settings } = args;

  const body: Record<string, unknown> = {
    model,
    // Anthropic requires max_tokens on every request.
    max_tokens: settings.maxTokens,
    stream: true,
    messages: history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };

  // The system prompt is a top-level field here, not a "system" message.
  if (systemPrompt) body.system = systemPrompt;

  body.temperature = settings.temperature;
  body.top_p = settings.topP;
  if (settings.stopSequences.length > 0) body.stop_sequences = settings.stopSequences;

  return { url: `${BASE}/messages`, headers: authHeaders(apiKey), body };
}

function extractDelta(json: unknown): string | null {
  const event = json as AnthropicEvent;
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    const text = event.delta.text;
    return typeof text === 'string' && text.length > 0 ? text : null;
  }
  return null;
}

function extractUsage(json: unknown): Partial<TokenUsage> | null {
  const event = json as AnthropicEvent;
  if (event.type === 'message_start' && event.message?.usage?.input_tokens !== undefined) {
    return { promptTokens: event.message.usage.input_tokens };
  }
  if (event.type === 'message_delta' && event.usage?.output_tokens !== undefined) {
    return { completionTokens: event.usage.output_tokens };
  }
  return null;
}

/** The Messages API ends the stream with a `message_stop` event. */
function isFinalJson(json: unknown): boolean {
  return (json as AnthropicEvent).type === 'message_stop';
}

function isFinalPayload(payload: string): boolean {
  try {
    return isFinalJson(JSON.parse(payload));
  } catch {
    return false;
  }
}

async function fetchModels(apiKey: string): Promise<ModelInfo[]> {
  return fetchModelsWithKey(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

async function testKey(apiKey: string): Promise<TestKeyResult> {
  return testKeyViaModels(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

export const anthropicAdapter: ProviderAdapter = {
  id: PROVIDER,
  label: 'Anthropic (Claude)',
  defaultModel: DEFAULT_MODELS.anthropic,
  capabilities: { temperature: true, maxTokens: true, topP: true, stopSequences: true },
  fetchModels,
  testKey,
  buildChatRequest,
  extractDelta,
  extractUsage,
  isFinalPayload,
};
