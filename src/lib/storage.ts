/**
 * localStorage persistence + factory defaults.
 *
 * All app data (API keys, settings, conversations, presets) lives in the
 * browser's localStorage — this app is deliberately backend-free.
 */
import { DEFAULT_MODELS, DEFAULT_PRESETS } from '@/lib/providerDefaults';
import type { AppSettings, Conversation, GenerationSettings, Preset, ProviderId } from '@/lib/types';

export const STORAGE_KEYS = {
  conversations: 'apiPlayground.conversations',
  activeConversationId: 'apiPlayground.activeConversationId',
  settings: 'apiPlayground.settings',
  presets: 'apiPlayground.presets',
  drafts: 'apiPlayground.drafts',
  dataVersion: 'apiPlayground.dataVersion',
  /** Race mode config (enabled + competitor models), G0DM0D3-inspired arena. */
  race: 'apiPlayground.race',
} as const;

/**
 * Bumped whenever persisted defaults change in a way old browsers should
 * migrate to. Version history:
 *   2 — maxTokens default raised 1024 -> 4096. Reasoning models (all current
 *       OpenRouter ":free" models) spend their chain-of-thought INSIDE
 *       max_tokens, so 1024 could be consumed entirely by thinking and the
 *       visible answer came back empty. Existing conversations carrying the
 *       old 1024 default are upgraded exactly once.
 */
export const CURRENT_DATA_VERSION = 2;

export function uid(): string {
  // crypto.randomUUID is available in all modern browsers and secure contexts.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultGenerationSettings(): GenerationSettings {
  return {
    temperature: 0.7,
    // 4096: room for reasoning models to think AND answer (see CURRENT_DATA_VERSION).
    maxTokens: 4096,
    topP: 1,
    stopSequences: [],
  };
}

/**
 * One-time migration of data saved by an older version of the app.
 * Returns the (possibly upgraded) conversation list — callers persist the
 * result and stamp CURRENT_DATA_VERSION when done.
 */
export function migrateConversations(list: Conversation[]): Conversation[] {
  const version = loadJson<number>(STORAGE_KEYS.dataVersion, 1);
  if (version >= CURRENT_DATA_VERSION) return list;
  if (version < 2) {
    list = list.map((conversation) =>
      conversation.settings?.maxTokens === 1024
        ? {
            ...conversation,
            settings: { ...conversation.settings, maxTokens: 4096 },
          }
        : conversation,
    );
  }
  saveJson(STORAGE_KEYS.dataVersion, CURRENT_DATA_VERSION);
  return list;
}

export function defaultSettings(): AppSettings {
  return {
    apiKeys: { openai: '', anthropic: '', gemini: '', openrouter: '' },
    showRawPanel: false,
    customProxyUrl: '',
    soundEnabled: true,
  };
}

export function defaultPresets(): Preset[] {
  return DEFAULT_PRESETS.map((p) => ({ ...p, id: uid() }));
}

export function createConversation(
  provider: ProviderId = 'openai',
  model?: string,
  inherit?: Partial<Pick<Conversation, 'systemPrompt' | 'settings'>>,
): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: 'New Chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    provider,
    // Fall back to the provider's default model when none is given.
    model: model ?? DEFAULT_MODELS[provider],
    systemPrompt: inherit?.systemPrompt ?? '',
    settings: inherit?.settings ? { ...inherit.settings } : defaultGenerationSettings(),
    contextLimit: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Safe JSON localStorage read/write helpers                           */
/* ------------------------------------------------------------------ */

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / private mode — nothing sensible to do, fail silently.
  }
}

/** Migration: make sure a persisted conversation has all expected fields. */
export function normalizeConversation(raw: Conversation): Conversation {
  const conv: Conversation = {
    ...createConversation(raw.provider ?? 'openai'),
    ...raw,
    settings: { ...defaultGenerationSettings(), ...(raw.settings ?? {}) },
  };
  conv.messages = (raw.messages ?? []).map((m) => ({
    id: m.id ?? uid(),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content ?? '',
    createdAt: m.createdAt ?? now(),
    // Preserve the optional rich fields (dropping any of them would silently
    // degrade persisted conversations on every reload).
    reasoning: m.reasoning,
    meta: m.meta,
    liquid: m.liquid,
  }));
  // Repair conversations saved before default models existed.
  if (!conv.model) conv.model = DEFAULT_MODELS[conv.provider] ?? 'gpt-4o-mini';
  return conv;
}

function now(): number {
  return Date.now();
}

export function loadConversations(): Conversation[] {
  const list = loadJson<Conversation[]>(STORAGE_KEYS.conversations, []);
  return Array.isArray(list) ? list.map(normalizeConversation) : [];
}

export function loadSettings(): AppSettings {
  const stored = loadJson<Partial<AppSettings>>(STORAGE_KEYS.settings, {});
  const base = defaultSettings();
  return {
    apiKeys: { ...base.apiKeys, ...(stored.apiKeys ?? {}) },
    showRawPanel: stored.showRawPanel ?? false,
  };
}

export function loadPresets(): Preset[] {
  const stored = loadJson<Preset[]>(STORAGE_KEYS.presets, []);
  return Array.isArray(stored) && stored.length > 0 ? stored : defaultPresets();
}
