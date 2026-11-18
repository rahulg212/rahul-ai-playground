'use client';

/**
 * PlaygroundProvider — the single source of truth for the whole app.
 *
 * It owns:
 *   - conversations (persisted), the active conversation and its config
 *   - global settings incl. API keys (persisted)
 *   - system-prompt presets (persisted)
 *   - streaming state + abort handling
 *   - fetched model lists, key test results (in-memory)
 *   - UI layout state (panel toggles, mobile drawers)
 *
 * Components consume everything through usePlayground().
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { providerLabel, toPlaygroundError } from '@/lib/errors';
import {
  exportAllData,
  exportConversationAsJson,
  exportConversationAsMarkdown,
  parseFullBackup,
  parseImportedConversation,
} from '@/lib/exportUtils';
import { consumeOpenRouterOAuthCallback } from '@/lib/openrouterOAuth';
import { resolveMessageView } from '@/lib/messageView';
import { getAdapter } from '@/lib/providerAdapters';
import { DEFAULT_MODELS, PROVIDER_IDS } from '@/lib/providerDefaults';
import { scoreResponse } from '@/lib/score';
import { runChatStream } from '@/lib/streaming';
import {
  STORAGE_KEYS,
  createConversation,
  defaultGenerationSettings,
  defaultSettings,
  loadConversations,
  loadPresets,
  loadSettings,
  migrateConversations,
  uid,
} from '@/lib/storage';
import {
  applyContextLimit,
  autoTitle,
  estimateConversationTokens,
} from '@/lib/tokens';
import type {
  AppSettings,
  AssistantMeta,
  ChatErrorAction,
  ChatMessage,
  Conversation,
  GenerationSettings,
  ModelInfo,
  Preset,
  ProviderId,
  QualityScore,
  RaceCandidate,
  RaceConfig,
  RawDebug,
  StreamOutcome,
  TestKeyResult,
  TokenUsage,
} from '@/lib/types';

export interface ModelsState {
  loading: boolean;
  error: string | null;
  models: ModelInfo[];
}

const EMPTY_MODELS: Record<ProviderId, ModelsState> = {
  openai: { loading: false, error: null, models: [] },
  anthropic: { loading: false, error: null, models: [] },
  gemini: { loading: false, error: null, models: [] },
  openrouter: { loading: false, error: null, models: [] },
};

/**
 * Pick the best free model from a fetched list (OpenRouter only).
 * Prefers the app's default free model, then the first available one.
 * Returns null when the list has no free models (or is not loaded yet).
 */
function pickFreeModel(models: ModelInfo[]): string | null {
  const free = models.filter((m) => m.free);
  if (free.length === 0) return null;
  const preferred = free.find((m) => m.id === DEFAULT_MODELS.openrouter) ?? free[0];
  return preferred.id;
}

/**
 * How many times a chat request is retried automatically when the provider
 * returns a transient failure (429 rate limit / 5xx) BEFORE any text has been
 * streamed. Mirrors what NextChat / ChatBox do; makes free-tier models feel
 * reliable instead of failing on the first rate-limit window.
 */
const MAX_AUTO_RETRIES = 2;

/** Hard cap on Race competitors (parallel streams get expensive fast). */
const MAX_RACE_MODELS = 3;

/**
 * The final user turn of a "Refine" request (G0DM0D3's liquid mode, adapted).
 * The draft being improved is sent as the preceding assistant message.
 */
const REFINE_INSTRUCTION =
  'Your answer above is a draft. Rewrite it so it is genuinely better: fix inaccuracies, add important missing details, tighten the structure (markdown headings/bullets where they help), cut hedging and filler, and make it more concrete with examples, numbers or code where relevant. Keep the same language and roughly the same scope as the original question. Output ONLY the improved answer — no preamble, no commentary about the rewrite.';

/** One live competitor while a Race is running. */
export interface RaceLiveCandidate {
  provider: ProviderId;
  model: string;
  text: string;
  reasoning?: string;
  done: boolean;
  error?: string;
  responseTimeMs?: number;
  usage?: TokenUsage;
}

export interface RaceLiveState {
  conversationId: string;
  candidates: RaceLiveCandidate[];
}

export interface PlaygroundContextValue {
  /** True once the active conversation exists (localStorage loaded synchronously). */
  ready: boolean;

  // Conversations
  conversations: Conversation[];
  activeConversation: Conversation | null;
  selectConversation: (id: string) => void;
  createNewChat: () => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearActiveChat: () => void;

  // Active conversation configuration
  setProvider: (provider: ProviderId) => void;
  setModel: (model: string) => void;
  setSystemPrompt: (prompt: string) => void;
  setGenerationSettings: (patch: Partial<GenerationSettings>) => void;
  resetGenerationSettings: () => void;
  setContextLimit: (limit: number) => void;

  // Messaging
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => void;
  isStreaming: boolean;
  streamingConvId: string | null;
  streamingText: string;
  /** Live "thinking" text while a reasoning model streams its chain-of-thought. */
  streamingReasoning: string;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => void;
  regenerate: () => Promise<void>;
  chatError: string | null;
  /** Optional one-click recovery attached to the current chat error. */
  chatErrorAction: ChatErrorAction | null;
  dismissChatError: () => void;

  // Race mode (multi-model arena, G0DM0D3-inspired)
  raceConfig: RaceConfig;
  toggleRace: () => void;
  /** Add/remove a competitor; silently capped at three. */
  toggleRaceModel: (spec: { provider: ProviderId; model: string }) => void;
  removeRaceModel: (spec: { provider: ProviderId; model: string }) => void;
  /** Live race progress (null while idle). */
  raceLive: RaceLiveState | null;
  /** Flip which race candidate an assistant message displays. */
  setActiveRaceCandidate: (messageId: string, index: number) => void;

  // Refine (liquid) — iterative answer improvement
  refineMessage: (messageId: string) => Promise<void>;
  isRefining: boolean;
  refiningMessageId: string | null;
  refiningText: string;
  /** Flip which liquid version an assistant message displays. */
  setLiquidVersion: (messageId: string, index: number) => void;

  // API keys
  settings: AppSettings;
  saveApiKey: (provider: ProviderId, key: string) => void;
  removeApiKey: (provider: ProviderId) => void;
  testApiKey: (provider: ProviderId) => Promise<void>;
  testingKey: ProviderId | null;
  keyTestResults: Partial<Record<ProviderId, TestKeyResult>>;

  // Models
  models: Record<ProviderId, ModelsState>;
  loadModels: (provider: ProviderId, force?: boolean) => Promise<void>;

  // Presets
  presets: Preset[];
  savePreset: (name: string, prompt: string) => void;
  applyPreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;

  // Debug
  showRawPanel: boolean;
  setShowRawPanel: (value: boolean) => void;
  rawDebug: RawDebug | null;

  // UI layout
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  settingsOpen: boolean;
  toggleSettings: () => void;
  mobileDrawer: 'sidebar' | 'settings' | null;
  setMobileDrawer: (drawer: 'sidebar' | 'settings' | null) => void;

  // Derived helpers
  nextRequestTokens: number;

  // Import / export
  exportConversation: (format: 'json' | 'md') => void;
  importConversation: (file: File) => Promise<void>;
  exportAll: (includeKeys: boolean) => void;
  importAll: (file: File) => Promise<void>;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export function usePlayground(): PlaygroundContextValue {
  const context = useContext(PlaygroundContext);
  if (!context) {
    throw new Error('usePlayground must be used within a PlaygroundProvider');
  }
  return context;
}

export function PlaygroundProvider({ children }: { children: React.ReactNode }) {
  /* ---------------- persisted state ---------------- */
  const {
    value: conversations,
    setValue: setConversations,
  } = useLocalStorage<Conversation[]>(STORAGE_KEYS.conversations, [], loadConversations);
  const { value: activeId, setValue: setActiveId } = useLocalStorage<string | null>(
    STORAGE_KEYS.activeConversationId,
    null,
  );
  const { value: settings, setValue: setSettings } = useLocalStorage<AppSettings>(
    STORAGE_KEYS.settings,
    defaultSettings(),
    loadSettings,
  );
  const { value: presets, setValue: setPresets } = useLocalStorage<Preset[]>(
    STORAGE_KEYS.presets,
    [],
    loadPresets,
  );
  // Race configuration (enabled + competitor list) — persisted separately so
  // AppSettings keeps its simple shape.
  const { value: raceConfig, setValue: setRaceConfig } = useLocalStorage<RaceConfig>(
    STORAGE_KEYS.race,
    { enabled: false, models: [] },
  );

  /* ---------------- in-memory state ---------------- */
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  /** Live chain-of-thought for reasoning models (rendered in a Thinking block). */
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatErrorAction, setChatErrorAction] = useState<ChatErrorAction | null>(null);
  const [rawDebug, setRawDebug] = useState<RawDebug | null>(null);
  const [testingKey, setTestingKey] = useState<ProviderId | null>(null);
  const [keyTestResults, setKeyTestResults] = useState<Partial<Record<ProviderId, TestKeyResult>>>({});
  const [models, setModels] = useState<Record<ProviderId, ModelsState>>(EMPTY_MODELS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [mobileDrawer, setMobileDrawer] = useState<'sidebar' | 'settings' | null>(null);
  const [raceLive, setRaceLive] = useState<RaceLiveState | null>(null);
  const [refiningMessageId, setRefiningMessageId] = useState<string | null>(null);
  const [refiningText, setRefiningText] = useState('');

  /* ---------------- refs for async flows ---------------- */
  const conversationsRef = useRef(conversations);
  const settingsRef = useRef(settings);
  const presetsRef = useRef(presets);
  const activeIdRef = useRef(activeId);
  const modelsRef = useRef(models);
  const abortRef = useRef<AbortController | null>(null);
  /** One controller per Race competitor — Stop aborts all of them. */
  const raceAbortRefs = useRef<AbortController[]>([]);
  const raceConfigRef = useRef(raceConfig);
  const isRefiningRef = useRef(false);
  const streamingTextRef = useRef('');
  const streamingReasoningRef = useRef('');
  const isStreamingRef = useRef(false);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { presetsRef.current = presets; }, [presets]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { raceConfigRef.current = raceConfig; }, [raceConfig]);

  const activeConversation = useMemo(() => {
    if (conversations.length === 0) return null;
    return conversations.find((c) => c.id === activeId) ?? conversations[0];
  }, [conversations, activeId]);

  const activeConversationRef = useRef(activeConversation);
  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

  // Ensure there is always at least one conversation. Values load
  // synchronously from localStorage, so an empty list means a fresh browser.
  useEffect(() => {
    if (conversations.length === 0) {
      const fresh = createConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    } else if (!conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId, setConversations, setActiveId]);

  // One-time migration of data written by older versions of the app
  // (e.g. raising maxTokens so reasoning models can think AND answer).
  useEffect(() => {
    setConversations((previous) => migrateConversations(previous));
  }, [setConversations]);

  // OpenRouter OAuth (PKCE) callback: if the page just came back from
  // openrouter.ai with ?code=..., exchange it for an API key and store it
  // like a manually pasted one. No-op on every other load.
  useEffect(() => {
    void (async () => {
      const result = await consumeOpenRouterOAuthCallback();
      if (!result) return;
      if (result.key) {
        setSettings((previous) => ({
          ...previous,
          apiKeys: { ...previous.apiKeys, openrouter: result.key as string },
        }));
        toast.success('Connected via OpenRouter OAuth — key saved.');
        void loadModels('openrouter', true);
        void testApiKey('openrouter');
      } else if (result.error) {
        toast.error(result.error);
      }
    })();
  }, []);

  const ready = activeConversation !== null;

  /* ---------------- conversation mutations ---------------- */

  const updateConversationById = useCallback(
    (
      id: string,
      patch: Partial<Conversation> | ((conversation: Conversation) => Partial<Conversation>),
    ) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === id
            ? {
                ...conversation,
                ...(typeof patch === 'function' ? patch(conversation) : patch),
                updatedAt: Date.now(),
              }
            : conversation,
        ),
      );
    },
    [setConversations],
  );

  const updateActive = useCallback(
    (patch: Partial<Conversation>) => {
      const id = activeConversationRef.current?.id;
      if (id) updateConversationById(id, patch);
    },
    [updateConversationById],
  );

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setMobileDrawer(null);
  }, [setActiveId]);

  const createNewChat = useCallback(() => {
    // New chats inherit the current provider/model/prompt/settings so the
    // user keeps testing without reconfiguration.
    const current = activeConversationRef.current;
    const fresh = createConversation(
      current?.provider ?? 'openai',
      current?.model,
      {
        systemPrompt: current?.systemPrompt ?? '',
        settings: current?.settings,
      },
    );
    setConversations((previous) => [fresh, ...previous]);
    setActiveId(fresh.id);
    setMobileDrawer(null);
    setChatError(null);
    setChatErrorAction(null);
  }, [setConversations, setActiveId]);

  const deleteConversation = useCallback(
    (id: string) => {
      const previous = conversationsRef.current;
      const remaining = previous.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = createConversation();
        setConversations([fresh]);
        setActiveId(fresh.id);
      } else {
        setConversations(remaining);
        if (id === activeIdRef.current) setActiveId(remaining[0].id);
      }
      toast.success('Conversation deleted.');
    },
    [setConversations, setActiveId],
  );

  const renameConversation = useCallback(
    (id: string, title: string) => {
      updateConversationById(id, { title: title.trim() || 'Untitled' });
    },
    [updateConversationById],
  );

  const clearActiveChat = useCallback(() => {
    updateActive({ messages: [] });
    setChatError(null);
    setChatErrorAction(null);
    toast.success('Chat cleared.');
  }, [updateActive]);

  /* ---------------- active conversation config ---------------- */

  const setProvider = useCallback(
    (provider: ProviderId) => {
      // Switching provider keeps the chat but resets the model to a sensible
      // default (models differ across providers).
      updateActive({ provider, model: getAdapter(provider).defaultModel });
    },
    [updateActive],
  );

  const setModel = useCallback((model: string) => updateActive({ model }), [updateActive]);

  const setSystemPrompt = useCallback(
    (prompt: string) => updateActive({ systemPrompt: prompt }),
    [updateActive],
  );

  const setGenerationSettings = useCallback(
    (patch: Partial<GenerationSettings>) => {
      updateActive((conversation) => ({
        settings: { ...conversation.settings, ...patch },
      }));
    },
    [updateActive],
  );

  const resetGenerationSettings = useCallback(() => {
    updateActive({ settings: defaultGenerationSettings() });
    toast.success('Generation settings reset to defaults.');
  }, [updateActive]);

  const setContextLimit = useCallback((limit: number) => updateActive({ contextLimit: limit }), [updateActive]);

  /* ---------------- streaming ---------------- */

  /**
   * Run one streamed completion and append the assistant message.
   * opts.temperatureBoost: temporary sampling boost WITHOUT persisting — used
   * by Regenerate so a retry explores a slightly different answer (the trick
   * G0DM0D3 uses for its "try again" strategies).
   */
  const runCompletion = useCallback(
    async (
      conversationId: string,
      history: ChatMessage[],
      opts?: { temperatureBoost?: number },
    ) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation || history.length === 0) return;

      const adapter = getAdapter(conversation.provider);
      const apiKey = settingsRef.current.apiKeys[conversation.provider];
      if (!apiKey) {
        setChatError(
          `No API key saved for ${providerLabel(conversation.provider)}. ` +
            'Open the settings panel on the right, paste your key and press Save.',
        );
        return;
      }

      const limited = applyContextLimit(history, conversation.contextLimit);
      // The last user turn is what the quality scorer measures against.
      const lastUser = [...limited].reverse().find((m) => m.role === 'user');
      const boost = opts?.temperatureBoost ?? 0;
      const effectiveSettings: GenerationSettings =
        boost > 0
          ? {
              ...conversation.settings,
              temperature: Math.min(2, Math.round((conversation.settings.temperature + boost) * 100) / 100),
            }
          : conversation.settings;

      const controller = new AbortController();
      abortRef.current = controller;
      isStreamingRef.current = true;
      streamingTextRef.current = '';
      streamingReasoningRef.current = '';
      setStreamingText('');
      setStreamingReasoning('');
      setStreamingConvId(conversationId);
      setIsStreaming(true);
      setChatError(null);
      setChatErrorAction(null);
      setRawDebug(null);

      const appendAssistant = (content: string, extra?: Partial<AssistantMeta>, reasoning?: string) => {
        const isPlaceholder = content.startsWith('*(');
        // G0DM0D3-style quality score, computed once and stored on the message
        // (score chip + tooltip in the UI). Placeholders stay unscored.
        const quality: QualityScore | undefined =
          !isPlaceholder && content.trim().length > 0
            ? scoreResponse(content, lastUser?.content ?? '', extra?.responseTimeMs, extra?.usage)
            : undefined;
        const message: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
          reasoning: reasoning && reasoning.length > 0 ? reasoning : undefined,
          meta: {
            provider: conversation.provider,
            model: conversation.model,
            ...extra,
            quality,
          },
        };
        updateConversationById(conversationId, (c) => ({
          messages: [...c.messages, message],
        }));
      };

      try {
        // The adapter turns our internal format into the provider request and
        // parses the streamed response back — see src/lib/providerAdapters.
        // Transient provider failures (429 / 5xx) are retried automatically
        // as long as NOTHING has streamed yet — otherwise the partial text
        // would be duplicated in the conversation.
        let outcome: StreamOutcome | null = null;
        for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt += 1) {
          try {
            outcome = await runChatStream({
              adapter,
              apiKey,
              model: conversation.model || adapter.defaultModel,
              systemPrompt: conversation.systemPrompt,
              history: limited,
              settings: effectiveSettings,
              signal: controller.signal,
              onDelta: (delta) => {
                streamingTextRef.current += delta;
                setStreamingText(streamingTextRef.current);
              },
              onReasoning: (delta) => {
                streamingReasoningRef.current += delta;
                setStreamingReasoning(streamingReasoningRef.current);
              },
            });
            break;
          } catch (retryError) {
            const retryPlaygroundError = toPlaygroundError(retryError, adapter.id);
            const nothingStreamed =
              streamingTextRef.current === '' && streamingReasoningRef.current === '';
            const transient =
              retryPlaygroundError.kind === 'rate_limit' || retryPlaygroundError.kind === 'server';
            if (!transient || !nothingStreamed || retryPlaygroundError.kind === 'abort') {
              throw retryError; // permanent failure or user abort — handle below
            }
            if (attempt < MAX_AUTO_RETRIES) {
              toast.info(
                `${providerLabel(conversation.provider)} ${
                  retryPlaygroundError.kind === 'rate_limit' ? 'rate limit' : 'server error'
                } — retrying (attempt ${attempt + 2} of ${MAX_AUTO_RETRIES + 1})…`,
              );
              await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
            } else {
              throw retryError; // retries exhausted — handle below
            }
          }
        }
        if (!outcome) throw new Error('Chat failed without a response.');
        appendAssistant(
          outcome.text || '*(empty response)*',
          {
            responseTimeMs: outcome.responseTimeMs,
            usage: outcome.usage,
          },
          outcome.reasoning,
        );
        setRawDebug({
          request: outcome.rawRequest,
          response: outcome.rawResponse,
          status: outcome.status,
          responseTimeMs: outcome.responseTimeMs,
        });
      } catch (error) {
        const playgroundError = toPlaygroundError(error);
        const partial = streamingTextRef.current;
        const partialReasoning = streamingReasoningRef.current;
        if (playgroundError.kind === 'abort') {
          // "Stop" pressed: keep whatever text already arrived.
          if (partial || partialReasoning) {
            appendAssistant(partial || '*(stopped before any text arrived)*', { stopped: true }, partialReasoning);
          }
          toast.info('Generation stopped.');
        } else {
          if (partial || partialReasoning) {
            appendAssistant(
              partial || '*(error before any text arrived)*',
              { stopped: true, error: playgroundError.message },
              partialReasoning,
            );
          }
          setChatError(playgroundError.message);
          setChatErrorAction(null);
          toast.error(playgroundError.message);
          // One-click recovery for the most common OpenRouter failure modes:
          // no credits (402) or a model ID the key cannot use (400/404). A
          // free model is ALWAYS available on free-tier keys, so offer to
          // switch and re-send in a single click.
          if (
            conversation.provider === 'openrouter' &&
            (playgroundError.status === 402 ||
              playgroundError.status === 404 ||
              playgroundError.status === 400)
          ) {
            const freeModel =
              pickFreeModel(modelsRef.current.openrouter.models) ?? DEFAULT_MODELS.openrouter;
            if (freeModel !== conversation.model) {
              setChatErrorAction({
                label: `Retry with ${freeModel}`,
                run: async () => {
                  updateConversationById(conversationId, { model: freeModel });
                  await runCompletion(conversationId, history);
                },
              });
            }
          }
          // Even failed attempts are useful in the Raw panel.
          if (playgroundError.rawRequest) {
            setRawDebug({
              request: playgroundError.rawRequest,
              response: `// Error: ${playgroundError.message}`,
              status: playgroundError.status,
            });
          }
        }
      } finally {
        abortRef.current = null;
        isStreamingRef.current = false;
        streamingTextRef.current = '';
        streamingReasoningRef.current = '';
        setIsStreaming(false);
        setStreamingConvId(null);
        setStreamingText('');
        setStreamingReasoning('');
      }
    },
    [updateConversationById],
  );

  /* ---------------- race mode (multi-model arena) ---------------- */

  /**
   * G0DM0D3-inspired Race: fire the SAME prompt at up to MAX_RACE_MODELS
   * models in parallel, stream the current leader into the chat bubble, then
   * store every candidate on the resulting assistant message. The auto-winner
   * is the highest quality score; the user can flip through all candidates
   * with the navigator under the bubble. Only the winner enters the context.
   */
  const runRace = useCallback(
    async (conversationId: string, history: ChatMessage[]) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation) return;

      const specs = raceConfigRef.current.models;
      const lastUser = [...history].reverse().find((m) => m.role === 'user');
      const limited = applyContextLimit(history, conversation.contextLimit);

      isStreamingRef.current = true;
      streamingTextRef.current = '';
      streamingReasoningRef.current = '';
      setStreamingText('');
      setStreamingReasoning('');
      setStreamingConvId(conversationId);
      setIsStreaming(true);
      setChatError(null);
      setChatErrorAction(null);
      setRawDebug(null);

      // Scratch candidate state (refs keep the closures cheap).
      const scratch = specs.map((spec) => ({
        spec,
        text: '',
        reasoning: '',
        done: false,
        error: undefined as string | undefined,
        responseTimeMs: undefined as number | undefined,
        usage: undefined as TokenUsage | undefined,
        outcome: null as StreamOutcome | null,
      }));

      const publish = () => {
        setRaceLive({
          conversationId,
          candidates: scratch.map((c) => ({
            provider: c.spec.provider,
            model: c.spec.model,
            text: c.text,
            reasoning: c.reasoning || undefined,
            done: c.done,
            error: c.error,
            responseTimeMs: c.responseTimeMs,
            usage: c.usage,
          })),
        });
        // Stream the current leader (most text so far) into the main bubble.
        let leader = -1;
        let leaderLength = 0;
        scratch.forEach((c, index) => {
          if (c.text.length > leaderLength) {
            leaderLength = c.text.length;
            leader = index;
          }
        });
        streamingTextRef.current = leader >= 0 ? scratch[leader].text : '';
        setStreamingText(streamingTextRef.current);
        const leaderReasoning = leader >= 0 ? scratch[leader].reasoning : '';
        streamingReasoningRef.current = leaderReasoning;
        setStreamingReasoning(leaderReasoning);
      };

      raceAbortRefs.current = scratch.map(() => new AbortController());
      publish();

      await Promise.all(
        scratch.map(async (candidate, index) => {
          try {
            const adapter = getAdapter(candidate.spec.provider);
            const apiKey = settingsRef.current.apiKeys[candidate.spec.provider];
            if (!apiKey) {
              throw new Error(`No API key saved for ${providerLabel(candidate.spec.provider)}`);
            }
            const outcome = await runChatStream({
              adapter,
              apiKey,
              model: candidate.spec.model || adapter.defaultModel,
              systemPrompt: conversation.systemPrompt,
              history: limited,
              settings: conversation.settings,
              signal: raceAbortRefs.current[index].signal,
              onDelta: (delta) => {
                candidate.text += delta;
                publish();
              },
              onReasoning: (delta) => {
                candidate.reasoning += delta;
                publish();
              },
            });
            candidate.outcome = outcome;
            candidate.responseTimeMs = outcome.responseTimeMs;
            candidate.usage = outcome.usage;
          } catch (error) {
            const playgroundError = toPlaygroundError(error, candidate.spec.provider);
            candidate.error =
              playgroundError.kind === 'abort' ? 'stopped' : playgroundError.message;
          } finally {
            candidate.done = true;
            publish();
          }
        }),
      );

      // Score everything that produced text; the highest score wins.
      const scored: RaceCandidate[] = scratch.map((candidate) => ({
        provider: candidate.spec.provider,
        model: candidate.spec.model,
        text: candidate.text,
        reasoning: candidate.reasoning || undefined,
        responseTimeMs: candidate.responseTimeMs,
        usage: candidate.usage,
        error: candidate.error,
        score:
          candidate.text.trim().length > 0
            ? scoreResponse(candidate.text, lastUser?.content ?? '', candidate.responseTimeMs, candidate.usage).overall
            : undefined,
      }));
      let winnerIndex = -1;
      let winnerScore = -1;
      scored.forEach((candidate, index) => {
        if ((candidate.score ?? -1) > winnerScore) {
          winnerScore = candidate.score ?? -1;
          winnerIndex = index;
        }
      });

      raceAbortRefs.current = [];
      setRaceLive(null);
      isStreamingRef.current = false;
      streamingTextRef.current = '';
      streamingReasoningRef.current = '';
      setIsStreaming(false);
      setStreamingConvId(null);
      setStreamingText('');
      setStreamingReasoning('');

      if (winnerIndex < 0) {
        // Every candidate failed (or was stopped before any text).
        const stoppedAll = scored.every((c) => c.error === 'stopped');
        if (!stoppedAll) {
          const firstError = scored.find((c) => c.error && c.error !== 'stopped');
          const summary =
            `Race failed — all ${scored.length} model${scored.length === 1 ? '' : 's'} errored.` +
            (firstError ? ` First error: ${firstError.error}` : '');
          setChatError(summary);
          toast.error(summary);
        }
        return;
      }

      const winner = scored[winnerIndex];
      const quality = scoreResponse(winner.text, lastUser?.content ?? '', winner.responseTimeMs, winner.usage);
      const message: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: winner.text,
        createdAt: Date.now(),
        reasoning: winner.reasoning,
        meta: {
          provider: winner.provider,
          model: winner.model,
          responseTimeMs: winner.responseTimeMs,
          usage: winner.usage,
          quality,
          race: { candidates: scored, activeIndex: winnerIndex },
        },
      };
      updateConversationById(conversationId, (c) => ({
        messages: [...c.messages, message],
      }));
      const winnerOutcome = scratch[winnerIndex].outcome;
      if (winnerOutcome) {
        setRawDebug({
          request: winnerOutcome.rawRequest,
          response: winnerOutcome.rawResponse,
          status: winnerOutcome.status,
          responseTimeMs: winnerOutcome.responseTimeMs,
        });
      }
      const loserCount = scored.filter((c) => c.error).length;
      toast.success(
        `Race finished — winner: ${winner.model} (score ${quality.overall})` +
          (loserCount > 0 ? ` · ${loserCount} candidate${loserCount === 1 ? '' : 's'} failed` : ''),
      );
    },
    [updateConversationById],
  );

  const toggleRace = useCallback(() => {
    setRaceConfig((previous) => ({ ...previous, enabled: !previous.enabled }));
  }, [setRaceConfig]);

  const toggleRaceModel = useCallback(
    (spec: { provider: ProviderId; model: string }) => {
      setRaceConfig((previous) => {
        const exists = previous.models.some((m) => m.provider === spec.provider && m.model === spec.model);
        if (exists) {
          return { ...previous, models: previous.models.filter((m) => !(m.provider === spec.provider && m.model === spec.model)) };
        }
        if (previous.models.length >= MAX_RACE_MODELS) {
          toast.error(`Race supports up to ${MAX_RACE_MODELS} models — remove one first.`);
          return previous;
        }
        return { ...previous, models: [...previous.models, spec] };
      });
    },
    [setRaceConfig],
  );

  const removeRaceModel = useCallback(
    (spec: { provider: ProviderId; model: string }) => {
      setRaceConfig((previous) => ({
        ...previous,
        models: previous.models.filter((m) => !(m.provider === spec.provider && m.model === spec.model)),
      }));
    },
    [setRaceConfig],
  );

  /** Flip which race candidate an assistant message displays. */
  const setActiveRaceCandidate = useCallback(
    (messageId: string, index: number) => {
      const conversation = activeConversationRef.current;
      if (!conversation) return;
      updateConversationById(conversation.id, (c) => ({
        messages: c.messages.map((m) =>
          m.id === messageId && m.meta?.race
            ? { ...m, meta: { ...m.meta, race: { ...m.meta.race, activeIndex: index } } }
            : m,
        ),
      }));
    },
    [updateConversationById],
  );

  /** Flip which liquid (refine) version an assistant message displays. */
  const setLiquidVersion = useCallback(
    (messageId: string, index: number) => {
      const conversation = activeConversationRef.current;
      if (!conversation) return;
      updateConversationById(conversation.id, (c) => ({
        messages: c.messages.map((m) =>
          m.id === messageId && m.liquid
            ? { ...m, liquid: { ...m.liquid, activeIndex: index } }
            : m,
        ),
      }));
    },
    [updateConversationById],
  );

  /* ---------------- refine (liquid) ---------------- */

  /**
   * One-click "Refine" (G0DM0D3's liquid mode, adapted): re-asks the SAME
   * model that wrote the answer to improve it, streaming the rewrite into the
   * bubble. Every revision is kept as a version; v0 is always the original.
   */
  const refineMessage = useCallback(
    async (messageId: string) => {
      const conversation = activeConversationRef.current;
      if (!conversation || isStreamingRef.current || isRefiningRef.current) return;
      const index = conversation.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      const message = conversation.messages[index];
      const view = resolveMessageView(message);
      const lastUser = [...conversation.messages.slice(0, index)].reverse().find((m) => m.role === 'user');
      if (!lastUser) {
        toast.error('Nothing to refine against — send a question first.');
        return;
      }
      // Refine with the model that PRODUCED the answer (falls back to current).
      const provider = message.meta?.provider ?? conversation.provider;
      const model = message.meta?.model ?? conversation.model;
      const apiKey = settingsRef.current.apiKeys[provider];
      if (!apiKey) {
        toast.error(`Refine needs the ${providerLabel(provider)} key — add it in settings.`);
        return;
      }

      // First refine seeds version 0 with the answer as originally displayed.
      const existingVersions = message.liquid?.versions ?? [
        {
          content: view.content,
          reasoning: message.reasoning,
          score: message.meta?.quality?.overall,
          responseTimeMs: message.meta?.responseTimeMs,
          usage: message.meta?.usage,
          createdAt: message.createdAt,
        },
      ];

      isRefiningRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setRefiningMessageId(messageId);
      setRefiningText('');

      let text = '';
      let reasoning = '';
      try {
        const adapter = getAdapter(provider);
        const outcome = await runChatStream({
          adapter,
          apiKey,
          model,
          systemPrompt: conversation.systemPrompt,
          history: [
            { id: `${messageId}-q`, role: 'user', content: lastUser.content, createdAt: message.createdAt },
            { id: `${messageId}-a`, role: 'assistant', content: view.content, createdAt: message.createdAt },
            { id: `${messageId}-i`, role: 'user', content: REFINE_INSTRUCTION, createdAt: Date.now() },
          ],
          settings: conversation.settings,
          signal: controller.signal,
          onDelta: (delta) => {
            text += delta;
            setRefiningText(text);
          },
          onReasoning: (delta) => {
            reasoning += delta;
          },
        });
        const improved = text.trim() || view.content;
        const quality = scoreResponse(improved, lastUser.content, outcome.responseTimeMs, outcome.usage);
        updateConversationById(conversation.id, (c) => ({
          messages: c.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  liquid: {
                    versions: [
                      ...existingVersions,
                      {
                        content: improved,
                        reasoning: reasoning || undefined,
                        score: quality.overall,
                        responseTimeMs: outcome.responseTimeMs,
                        usage: outcome.usage,
                        createdAt: Date.now(),
                      },
                    ],
                    activeIndex: existingVersions.length, // show the new version
                  },
                }
              : m,
          ),
        }));
        setRawDebug({
          request: outcome.rawRequest,
          response: outcome.rawResponse,
          status: outcome.status,
          responseTimeMs: outcome.responseTimeMs,
        });
        toast.success(`Refined — v${existingVersions.length + 1} scored ${quality.overall}/100.`);
      } catch (error) {
        const playgroundError = toPlaygroundError(error, provider);
        if (playgroundError.kind === 'abort') {
          // Keep a meaningful partial rewrite as a version (better than losing it).
          if (text.trim().length > 20) {
            const quality = scoreResponse(text, lastUser.content);
            updateConversationById(conversation.id, (c) => ({
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      liquid: {
                        versions: [
                          ...existingVersions,
                          {
                            content: text.trim(),
                            reasoning: reasoning || undefined,
                            score: quality.overall,
                            createdAt: Date.now(),
                          },
                        ],
                        activeIndex: existingVersions.length,
                      },
                    }
                  : m,
              ),
            }));
            toast.info('Refine stopped — kept the partial rewrite as a version.');
          } else {
            toast.info('Refine cancelled.');
          }
        } else {
          toast.error(`Refine failed: ${playgroundError.message}`);
        }
      } finally {
        abortRef.current = null;
        isRefiningRef.current = false;
        setRefiningMessageId(null);
        setRefiningText('');
      }
    },
    [updateConversationById],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const conversation = activeConversationRef.current;
      if (!conversation || isStreamingRef.current) return;
      const userMessage: ChatMessage = {
        id: uid(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      const history = [...conversation.messages, userMessage];
      // Auto-title the conversation from its first user message.
      const patch: Partial<Conversation> = { messages: history };
      if (conversation.messages.length === 0) patch.title = autoTitle(text);
      updateConversationById(conversation.id, patch);
      // Race mode sends the same prompt to several models in parallel.
      const race = raceConfigRef.current;
      if (race.enabled && race.models.length >= 2) {
        await runRace(conversation.id, history);
      } else {
        await runCompletion(conversation.id, history);
      }
    },
    [runCompletion, runRace, updateConversationById],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    raceAbortRefs.current.forEach((controller) => controller.abort());
    raceAbortRefs.current = [];
  }, []);

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const conversation = activeConversationRef.current;
      if (!conversation || isStreamingRef.current) return;
      const index = conversation.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      // Editing a message truncates everything after it, then re-asks the model.
      const history: ChatMessage[] = [
        ...conversation.messages.slice(0, index),
        { ...conversation.messages[index], content: newContent },
      ];
      updateConversationById(conversation.id, { messages: history });
      await runCompletion(conversation.id, history);
    },
    [runCompletion, updateConversationById],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      const conversation = activeConversationRef.current;
      if (!conversation) return;
      updateConversationById(conversation.id, (c) => ({
        messages: c.messages.filter((m) => m.id !== messageId),
      }));
    },
    [updateConversationById],
  );

  const regenerate = useCallback(async () => {
    const conversation = activeConversationRef.current;
    if (!conversation || isStreamingRef.current) return;
    // Drop trailing assistant message(s) and ask again.
    let messages = conversation.messages;
    while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      messages = messages.slice(0, -1);
    }
    if (messages.length === 0) return;
    updateConversationById(conversation.id, { messages });
    // A retry should say something DIFFERENT: bump the temperature for this
    // request only (not persisted) — G0DM0D3's escalating-retry idea, toned
    // down for everyday use.
    await runCompletion(conversation.id, messages, { temperatureBoost: 0.15 });
  }, [runCompletion, updateConversationById]);

  const dismissChatError = useCallback(() => {
    setChatError(null);
    setChatErrorAction(null);
  }, []);

  /* ---------------- API keys ---------------- */

  const saveApiKey = useCallback(
    (provider: ProviderId, key: string) => {
      setSettings((previous) => ({
        ...previous,
        apiKeys: { ...previous.apiKeys, [provider]: key },
      }));
      toast.success(`${providerLabel(provider)} API key saved.`);
    },
    [setSettings],
  );

  const removeApiKey = useCallback(
    (provider: ProviderId) => {
      setSettings((previous) => ({
        ...previous,
        apiKeys: { ...previous.apiKeys, [provider]: '' },
      }));
      setKeyTestResults((previous) => ({ ...previous, [provider]: undefined }));
      toast.success(`${providerLabel(provider)} API key removed.`);
    },
    [setSettings],
  );

  /* ---------------- models ---------------- */

  const loadModels = useCallback(async (provider: ProviderId, force = false) => {
    const cached = modelsRef.current[provider];
    if (!force && (cached.loading || (cached.models.length > 0 && !cached.error))) return;

    modelsRef.current = {
      ...modelsRef.current,
      [provider]: { ...cached, loading: true, error: null },
    };
    setModels(modelsRef.current);

    try {
      const apiKey = settingsRef.current.apiKeys[provider];
      const list = await getAdapter(provider).fetchModels(apiKey);
      modelsRef.current = {
        ...modelsRef.current,
        [provider]: { loading: false, error: null, models: list },
      };
    } catch (error) {
      const playgroundError = toPlaygroundError(error);
      modelsRef.current = {
        ...modelsRef.current,
        [provider]: { loading: false, error: playgroundError.message, models: [] },
      };
    }
    setModels(modelsRef.current);
  }, []);

  // BYOK-bootstrapping convenience: populate the model pickers as soon as the
  // app opens for every provider that either has a saved key or — like
  // OpenRouter — exposes a public models endpoint. Users of mainstream BYOK
  // clients expect the model list to be there WITHOUT having to visit
  // settings first. loadModels() deduplicates, so this is safe.
  useEffect(() => {
    if (!ready) return;
    for (const provider of PROVIDER_IDS) {
      if (provider === 'openrouter' || settingsRef.current.apiKeys[provider]) {
        void loadModels(provider);
      }
    }
    // Intentionally runs once, when storage has hydrated.
  }, [ready]);

  const testApiKey = useCallback(
    async (provider: ProviderId) => {
      const key = settingsRef.current.apiKeys[provider];
      if (!key) {
        setKeyTestResults((previous) => ({
          ...previous,
          [provider]: { ok: false, message: 'No key entered — type one first.' },
        }));
        return;
      }
      setTestingKey(provider);
      try {
        const result = await getAdapter(provider).testKey(key);
        setKeyTestResults((previous) => ({ ...previous, [provider]: result }));
        if (result.ok) {
          toast.success(result.message);
          // A valid key means the models endpoint is usable too — (re)load the
          // list right away so the Model section shows available models
          // immediately after a successful test.
          void loadModels(provider, true);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        const playgroundError = toPlaygroundError(error);
        setKeyTestResults((previous) => ({
          ...previous,
          [provider]: { ok: false, message: playgroundError.message },
        }));
        toast.error(playgroundError.message);
      } finally {
        setTestingKey(null);
      }
    },
    [loadModels],
  );

  /* ---------------- presets ---------------- */

  const savePreset = useCallback(
    (name: string, prompt: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        toast.error('Give the preset a name first.');
        return;
      }
      setPresets((previous) => {
        const existing = previous.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) {
          toast.success(`Preset "${trimmed}" updated.`);
          return previous.map((p) => (p.id === existing.id ? { ...p, prompt } : p));
        }
        toast.success(`Preset "${trimmed}" saved.`);
        return [...previous, { id: uid(), name: trimmed, prompt }];
      });
    },
    [setPresets],
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = presetsRef.current.find((p) => p.id === id);
      if (!preset) return;
      updateActive({ systemPrompt: preset.prompt });
      toast.success(`Preset "${preset.name}" applied.`);
    },
    [updateActive],
  );

  const renamePreset = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setPresets((previous) => previous.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
      toast.success('Preset renamed.');
    },
    [setPresets],
  );

  const deletePreset = useCallback(
    (id: string) => {
      setPresets((previous) => previous.filter((p) => p.id !== id));
      toast.success('Preset deleted.');
    },
    [setPresets],
  );

  /* ---------------- debug panel ---------------- */

  const showRawPanel = settings.showRawPanel;
  const setShowRawPanel = useCallback(
    (value: boolean) => setSettings((previous) => ({ ...previous, showRawPanel: value })),
    [setSettings],
  );

  /* ---------------- derived helpers ---------------- */

  const nextRequestTokens = useMemo(() => {
    if (!activeConversation) return 0;
    return estimateConversationTokens(
      activeConversation,
      applyContextLimit(activeConversation.messages, activeConversation.contextLimit),
    );
  }, [activeConversation]);

  /* ---------------- import / export ---------------- */

  const exportConversation = useCallback((format: 'json' | 'md') => {
    const conversation = activeConversationRef.current;
    if (!conversation) return;
    if (conversation.messages.length === 0) {
      toast.error('Nothing to export yet — send a message first.');
      return;
    }
    if (format === 'json') exportConversationAsJson(conversation);
    else exportConversationAsMarkdown(conversation);
    toast.success(`Conversation exported as ${format.toUpperCase()}.`);
  }, []);

  const importConversation = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const conversation = parseImportedConversation(text);
        setConversations((previous) => [...previous, conversation]);
        setActiveId(conversation.id);
        toast.success(`Imported "${conversation.title}".`);
      } catch (error) {
        toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
      }
    },
    [setConversations, setActiveId],
  );

  const exportAll = useCallback((includeKeys: boolean) => {
    exportAllData(settingsRef.current, presetsRef.current, conversationsRef.current, includeKeys);
    toast.success(includeKeys ? 'Full backup exported (keys included).' : 'Backup exported (keys excluded).');
  }, []);

  const importAll = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = parseFullBackup(text);
        if (!parsed) {
          toast.error('That file is not an API Playground backup.');
          return;
        }
        if (parsed.settings) {
          const imported = parsed.settings;
          setSettings((previous) => ({
            ...previous,
            ...imported,
            apiKeys: { ...previous.apiKeys, ...(imported.apiKeys ?? {}) },
          }));
        }
        if (parsed.presets) setPresets(parsed.presets);
        setConversations((previous) => {
          const ids = new Set(previous.map((c) => c.id));
          return [...previous, ...parsed.conversations.filter((c) => !ids.has(c.id))];
        });
        toast.success(`Backup imported — ${parsed.conversations.length} conversations.`);
      } catch (error) {
        toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
      }
    },
    [setConversations, setPresets, setSettings],
  );

  /* ---------------- context value ---------------- */

  const value: PlaygroundContextValue = {
    ready,
    conversations,
    activeConversation,
    selectConversation,
    createNewChat,
    deleteConversation,
    renameConversation,
    clearActiveChat,
    setProvider,
    setModel,
    setSystemPrompt,
    setGenerationSettings,
    resetGenerationSettings,
    setContextLimit,
    sendMessage,
    stopStreaming,
    isStreaming,
    streamingConvId,
    streamingText,
    streamingReasoning,
    editMessage,
    deleteMessage,
    regenerate,
    chatError,
    chatErrorAction,
    dismissChatError,
    raceConfig,
    toggleRace,
    toggleRaceModel,
    removeRaceModel,
    raceLive,
    setActiveRaceCandidate,
    refineMessage,
    isRefining: refiningMessageId !== null,
    refiningMessageId,
    refiningText,
    setLiquidVersion,
    settings,
    saveApiKey,
    removeApiKey,
    testApiKey,
    testingKey,
    keyTestResults,
    models,
    loadModels,
    presets,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
    showRawPanel,
    setShowRawPanel,
    rawDebug,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((v) => !v),
    settingsOpen,
    toggleSettings: () => setSettingsOpen((v) => !v),
    mobileDrawer,
    setMobileDrawer,
    nextRequestTokens,
    exportConversation,
    importConversation,
    exportAll,
    importAll,
  };

  return <PlaygroundContext.Provider value={value}>{children}</PlaygroundContext.Provider>;
}
