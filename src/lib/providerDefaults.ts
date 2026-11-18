/**
 * Pure provider metadata (no imports except types).
 *
 * Keeping this in a leaf module lets storage.ts / adapters / UI share one
 * source of truth without pulling the whole adapter registry into
 * low-level modules (avoids module-init-order issues in bundlers).
 */
import type { Preset, ProviderId } from '@/lib/types';

export const PROVIDER_IDS: ProviderId[] = ['openai', 'anthropic', 'gemini', 'openrouter'];

/** Sensible starting model per provider (users can always pick another). */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-4o-mini',
};

/** Built-in system-prompt presets (seeded into localStorage on first run). */
export const DEFAULT_PRESETS: Preset[] = [
  {
    name: 'Helpful Assistant',
    prompt:
      'You are a helpful, knowledgeable assistant. Answer clearly and concisely, structure longer answers with headings or bullet points, and admit when you are unsure.',
  },
  {
    name: 'Code Expert',
    prompt:
      'You are an expert software engineer. Provide precise, production-quality code with brief explanations. Prefer modern best practices, handle edge cases, and point out potential bugs or security issues.',
  },
  {
    name: 'Translator',
    prompt:
      "You are a professional translator. Translate the user's text faithfully while preserving tone, register and formatting. If no target language is specified, translate to English. Output only the translation, without commentary.",
  },
];
