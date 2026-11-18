/**
 * Shared helpers used by the individual provider adapters.
 */
import { fetchJsonOrThrow } from '@/lib/errors';
import type { ModelInfo, ProviderId, TestKeyResult } from '@/lib/types';

/** Loose shape of a "list models" JSON response. */
interface ModelsListPayload {
  data?: Array<{
    id?: string;
    name?: string;
    display_name?: string;
    displayName?: string;
    // OpenRouter-specific metadata (absent on other providers):
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
  }>;
  models?: Array<{
    name?: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
  }>;
}

/** Parse an OpenRouter pricing string ("0", "0.0000015", ...) into USD/token. */
function parsePricing(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
      .map((m) => {
        const info: ModelInfo = { id: m.id, label: m.display_name || m.name || undefined };

        // OpenRouter reports pricing + context length per model; the other
        // OpenAI-style providers leave these fields undefined.
        const promptPrice = parsePricing(m.pricing?.prompt);
        const completionPrice = parsePricing(m.pricing?.completion);
        if (promptPrice !== undefined && completionPrice !== undefined) {
          info.free = m.id.endsWith(':free') || (promptPrice === 0 && completionPrice === 0);
          info.costPerMillion = {
            input: Math.round(promptPrice * 1_000_000 * 1000) / 1000,
            output: Math.round(completionPrice * 1_000_000 * 1000) / 1000,
          };
        }
        if (typeof m.context_length === 'number' && m.context_length > 0) {
          info.contextLength = m.context_length;
        }
        return info;
      });
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
