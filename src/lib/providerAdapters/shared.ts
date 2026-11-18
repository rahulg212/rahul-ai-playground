/**
 * Shared helpers used by the individual provider adapters.
 */
import { fetchJsonOrThrow } from '@/lib/errors';
import type { ModelInfo, ProviderId, TestKeyResult } from '@/lib/types';

/** Loose shape of a "list models" JSON response. */
interface ModelsListPayload {
  data?: Array<{ id?: string; name?: string; display_name?: string; displayName?: string }>;
  models?: Array<{
    name?: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
  }>;
}

/**
 * Standard OpenAI-style list (OpenAI, OpenRouter, Anthropic all return
 * `{ data: [{ id, ... }] }`; Gemini returns `{ models: [{ name, ... }] }`).
 */
export function mapModelsResponse(json: unknown, provider: ProviderId): ModelInfo[] {
  const payload = json as ModelsListPayload;

  if (Array.isArray(payload.data)) {
    return payload.data
      .filter((m): m is { id: string } => typeof m?.id === 'string' && m.id.length > 0)
      .map((m) => ({ id: m.id, label: m.display_name || undefined }));
  }

  if (Array.isArray(payload.models)) {
    // Gemini: name is "models/gemini-2.0-flash" — strip the prefix for the ID
    // that is used in the URL of generateContent calls.
    return payload.models
      .filter(
        (m): m is { name: string } =>
          typeof m?.name === 'string' &&
          m.name.length > 0 &&
          // Only expose models that can actually run chat completions.
          (!m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')),
      )
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        label: m.displayName || undefined,
      }));
  }

  throw new Error(`${provider} returned an unexpected models list shape.`);
}

/** Run a GET-models call and map the result; used by fetchModels AND testKey. */
export async function fetchModelsWithKey(
  url: string,
  headers: Record<string, string>,
  provider: ProviderId,
): Promise<ModelInfo[]> {
  const json = await fetchJsonOrThrow(url, { method: 'GET', headers }, provider);
  return mapModelsResponse(json, provider);
}

/** Standard "Test Key" implementation: list a few models and report. */
export async function testKeyViaModels(
  url: string,
  headers: Record<string, string>,
  provider: ProviderId,
): Promise<TestKeyResult> {
  const models = await fetchModelsWithKey(url, headers, provider);
  return {
    ok: true,
    message: `Key is valid — ${models.length} models available.`,
  };
}
