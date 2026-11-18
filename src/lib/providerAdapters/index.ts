/**
 * Provider registry — the single place that maps a ProviderId to its adapter.
 *
 * Adding a new provider:
 *   1. Create src/lib/providerAdapters/<name>.ts implementing ProviderAdapter.
 *   2. Register it in ADAPTERS below.
 *   3. Add the id to ProviderId in src/lib/types.ts and to PROVIDER_IDS /
 *      DEFAULT_MODELS in src/lib/providerDefaults.ts and to defaultSettings()
 *      in src/lib/storage.ts (for the empty API key).
 *   4. Add its label to PROVIDER_LABELS in src/lib/errors.ts.
 *   The UI (dropdowns, key manager, model selector) picks it up automatically.
 */
import { anthropicAdapter } from '@/lib/providerAdapters/anthropic';
import { geminiAdapter } from '@/lib/providerAdapters/gemini';
import { openaiAdapter } from '@/lib/providerAdapters/openai';
import { openrouterAdapter } from '@/lib/providerAdapters/openrouter';
import type { ProviderAdapter, ProviderId } from '@/lib/types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  openrouter: openrouterAdapter,
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id];
}

export function listProviders(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

// Re-exported for convenience (single import site for most UI code).
export { DEFAULT_PRESETS, PROVIDER_IDS } from '@/lib/providerDefaults';
