/**
 * OpenRouter adapter.
 *
 * Endpoint:  POST https://openrouter.ai/api/v1/chat/completions
 * Format:    OpenAI-compatible (same request/response shapes).
 * Headers:   "Authorization: Bearer <KEY>"
 *            "HTTP-Referer"  (optional, app attribution — shown on leaderboards)
 *            "X-Title"       (optional, app name)
 * Streaming: identical SSE format to OpenAI, EXCEPT the keep-alive comment
 *            lines (": OPENROUTER PROCESSING") which the SSE parser ignores.
 * Usage:     `usage: { include: true }` makes the final chunk carry totals.
 *
 * Bonus: the models endpoint (GET /api/v1/models) is PUBLIC — it works
 * without a key, which makes OpenRouter great for exploring models.
 */
import { fetchJsonOrThrow } from '@/lib/errors';
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

const BASE = 'https://openrouter.ai/api/v1';
const PROVIDER: ProviderId = 'openrouter';

/** Same shape as the OpenAI chunk; typed separately for clarity. */
interface OpenRouterChunk {
  choices?: Array<{ delta?: { content?: string | null; reasoning?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // OpenRouter accepts keyless calls for public endpoints, so only attach the
  // Authorization header when a key exists.
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  // Optional attribution headers (custom names, so browsers allow setting them).
  if (typeof window !== 'undefined') {
    headers['HTTP-Referer'] = window.location.origin;
  }
  headers['X-Title'] = 'API Playground';
  return headers;
}

function buildChatRequest(args: BuildChatRequestArgs): BuiltRequest {
  const { apiKey, model, systemPrompt, history, settings } = args;

  const messages: Array<{ role: string; content: string }> = [];
  // OpenRouter is OpenAI-compatible: system prompt as first message.
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const message of history) messages.push({ role: message.role, content: message.content });

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    top_p: settings.topP,
    // OpenRouter-specific: include token usage in the final stream chunk.
    usage: { include: true },
  };
  if (settings.stopSequences.length > 0) body.stop = settings.stopSequences;

  return { url: `${BASE}/chat/completions`, headers: authHeaders(apiKey), body };
}

function extractDelta(json: unknown): string | null {
  const chunk = json as OpenRouterChunk;
  const content = chunk.choices?.[0]?.delta?.content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

/**
 * Reasoning support — IMPORTANT for OpenRouter in practice: essentially all
 * currently available ":free" models (ling, north, ernie, nemotron, gemma,
 * dots, ...) are reasoning models. They stream hundreds of tokens of
 * chain-of-thought in `delta.reasoning` BEFORE any `delta.content`, so this
 * hook is what keeps the chat UI responsive instead of looking frozen.
 */
function extractReasoningDelta(json: unknown): string | null {
  const chunk = json as OpenRouterChunk;
  const reasoning = chunk.choices?.[0]?.delta?.reasoning;
  return typeof reasoning === 'string' && reasoning.length > 0 ? reasoning : null;
}

function extractUsage(json: unknown): Partial<TokenUsage> | null {
  const usage = (json as OpenRouterChunk).usage;
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function isFinalPayload(payload: string): boolean {
  return payload.trim() === '[DONE]';
}

async function fetchModels(apiKey: string): Promise<ModelInfo[]> {
  return fetchModelsWithKey(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

/**
 * The models endpoint is public, so listing models does not prove a key
 * works. Use GET /api/v1/auth/key instead — it validates the key and returns
 * its limits/usage.
 */
async function testKey(apiKey: string): Promise<TestKeyResult> {
  const json = await fetchJsonOrThrow(
    `${BASE}/auth/key`,
    { method: 'GET', headers: authHeaders(apiKey) },
    PROVIDER,
  );
  const data = (
    json as { data?: { label?: string; limit?: number | null; usage?: number; is_free_tier?: boolean } }
  ).data;
  const parts: string[] = ['Key is valid.'];
  if (data?.label) parts.push(`Label: ${data.label}.`);
  if (typeof data?.usage === 'number') parts.push(`Used: $${data.usage.toFixed(4)}.`);
  if (data?.limit != null) parts.push(`Limit: $${data.limit}.`);
  return { ok: true, message: parts.join(' ') };
}

export const openrouterAdapter: ProviderAdapter = {
  id: PROVIDER,
  label: 'OpenRouter',
  defaultModel: DEFAULT_MODELS.openrouter,
  capabilities: { temperature: true, maxTokens: true, topP: true, stopSequences: true },
  fetchModels,
  testKey,
  buildChatRequest,
  extractDelta,
  extractReasoningDelta,
  extractUsage,
  isFinalPayload,
};
