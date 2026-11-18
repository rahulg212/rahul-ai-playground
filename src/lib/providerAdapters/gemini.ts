/**
 * Google Gemini adapter.
 *
 * Endpoint:  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse
 *            (alt=sse makes Gemini return SSE instead of one giant JSON array)
 * Auth:      key goes in the "x-goog-api-key" header (keeps it out of the URL).
 * System:    sent via the top-level `systemInstruction` field.
 * Roles:     Gemini uses "user" and "model" — internal "assistant" is mapped
 *            to "model" here and mapped back on the way out.
 * Streaming: SSE payloads shaped like
 *            data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}], "usageMetadata": {...}}
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

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PROVIDER: ProviderId = 'gemini';

/** Shape of one streamed GenerateContent chunk (only what we need). */
interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> | null };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

function buildChatRequest(args: BuildChatRequestArgs): BuiltRequest {
  const { apiKey, model, systemPrompt, history, settings } = args;

  // Gemini roles: "user" | "model" (NOT "assistant").
  const contents = history.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const body: Record<string, unknown> = { contents };

  // System prompt goes through systemInstruction, not a "system" role.
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const generationConfig: Record<string, unknown> = {
    temperature: settings.temperature,
    maxOutputTokens: settings.maxTokens,
    topP: settings.topP,
  };
  if (settings.stopSequences.length > 0) {
    generationConfig.stopSequences = settings.stopSequences;
  }
  body.generationConfig = generationConfig;

  // alt=sse switches the response to server-sent events.
  return {
    url: `${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    headers: authHeaders(apiKey),
    body,
  };
}

function extractDelta(json: unknown): string | null {
  const chunk = json as GeminiChunk;
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  // Join all text parts of this chunk (there is usually exactly one).
  const text = parts
    .map((part) => part.text ?? '')
    .join('');
  return text.length > 0 ? text : null;
}

function extractUsage(json: unknown): Partial<TokenUsage> | null {
  const usage = (json as GeminiChunk).usageMetadata;
  if (!usage) return null;
  // Later chunks carry cumulative totals, so overwriting is correct.
  return {
    promptTokens: usage.promptTokenCount,
    completionTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
  };
}

async function fetchModels(apiKey: string): Promise<ModelInfo[]> {
  return fetchModelsWithKey(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

async function testKey(apiKey: string): Promise<TestKeyResult> {
  return testKeyViaModels(`${BASE}/models`, authHeaders(apiKey), PROVIDER);
}

export const geminiAdapter: ProviderAdapter = {
  id: PROVIDER,
  label: 'Google Gemini',
  defaultModel: DEFAULT_MODELS.gemini,
  capabilities: { temperature: true, maxTokens: true, topP: true, stopSequences: true },
  fetchModels,
  testKey,
  buildChatRequest,
  extractDelta,
  extractUsage,
};
