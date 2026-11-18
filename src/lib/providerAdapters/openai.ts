/**
 * OpenAI adapter.
 *
 * Endpoint:  POST https://api.openai.com/v1/chat/completions
 * Auth:      "Authorization: Bearer <KEY>"
 * System:    sent as a message with role "system" at the start of `messages`.
 * Streaming: SSE chunks shaped like
 *            data: {"choices":[{"delta":{"content":"..."}}]}  ...  data: [DONE]
 *
 * Quirk handled here: the newer "reasoning" models (o1/o3/o4 and gpt-5
 * families) reject the classic `max_tokens`, `temperature`, `top_p` and
 * `stop` parameters — they use `max_completion_tokens` and only accept
 * default sampling values. The adapter detects those models and builds a
 * compatible body, which is visible in the Raw debug panel.
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

const BASE = 'https://api.openai.com/v1';
const PROVIDER: ProviderId = 'openai';

/** Shape of one streamed chat-completion chunk (only what we need). */
interface OpenAIChunk {
  choices?: Array<{
    delta?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/** Detect OpenAI reasoning models that need the newer parameter names. */
function isReasoningModel(model: string): boolean {
  return /^(o[134]|gpt-5)/i.test(model.trim());
}

function buildChatRequest(args: BuildChatRequestArgs): BuiltRequest {
  const { apiKey, model, systemPrompt, history, settings } = args;
  const reasoning = isReasoningModel(model);

  const messages: Array<{ role: string; content: string }> = [];
  // OpenAI takes the system prompt as the first message in the array.
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const message of history) messages.push({ role: message.role, content: message.content });

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    // Ask the API to include a final chunk with token usage totals.
    stream_options: { include_usage: true },
  };

  if (reasoning) {
    // Reasoning models: only max_completion_tokens is accepted; sampling
    // parameters and stop sequences must be omitted.
    body.max_completion_tokens = settings.maxTokens;
  } else {
    body.temperature = settings.temperature;
    body.max_tokens = settings.maxTokens;
    body.top_p = settings.topP;
    if (settings.stopSequences.length > 0) body.stop = settings.stopSequences;
  }

  return { url: `${BASE}/chat/completions`, headers: authHeaders(apiKey), body };
}

function extractDelta(json: unknown): string | null {
  const chunk = json as OpenAIChunk;
  const content = chunk.choices?.[0]?.delta?.content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

function extractUsage(json: unknown): Partial<TokenUsage> | null {
  const usage = (json as OpenAIChunk).usage;
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

/** OpenAI terminates the stream with a bare `data: [DONE]` payload. */
function isFinalPayload(payload: string): boolean {
  return payload.trim() === '[DONE]';
}

async function fetchModels(apiKey: string): Promise<ModelInfo[]> {
  return fetchModelsWithKey(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

async function testKey(apiKey: string): Promise<TestKeyResult> {
  return testKeyViaModels(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

export const openaiAdapter: ProviderAdapter = {
  id: PROVIDER,
  label: 'OpenAI',
  defaultModel: DEFAULT_MODELS.openai,
  capabilities: { temperature: true, maxTokens: true, topP: true, stopSequences: true },
  fetchModels,
  testKey,
  buildChatRequest,
  extractDelta,
  extractUsage,
  isFinalPayload,
};
