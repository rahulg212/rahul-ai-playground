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
import { getAdapter } from '@/lib/providerAdapters';
import { runChatStream } from '@/lib/streaming';
import {
  STORAGE_KEYS,
  createConversation,
  defaultGenerationSettings,
  defaultSettings,
  loadConversations,
  loadPresets,
  loadSettings,
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
  ChatMessage,
  Conversation,
  GenerationSettings,
  ModelInfo,
  Preset,
  ProviderId,
  RawDebug,
  TestKeyResult,
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
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => void;
  regenerate: () => Promise<void>;
  chatError: string | null;
  dismissChatError: () => void;

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

  /* ---------------- in-memory state ---------------- */
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [rawDebug, setRawDebug] = useState<RawDebug | null>(null);
  const [testingKey, setTestingKey] = useState<ProviderId | null>(null);
  const [keyTestResults, setKeyTestResults] = useState<Partial<Record<ProviderId, TestKeyResult>>>({});
  const [models, setModels] = useState<Record<ProviderId, ModelsState>>(EMPTY_MODELS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [mobileDrawer, setMobileDrawer] = useState<'sidebar' | 'settings' | null>(null);

  /* ---------------- refs for async flows ---------------- */
  const conversationsRef = useRef(conversations);
  const settingsRef = useRef(settings);
  const presetsRef = useRef(presets);
  const activeIdRef = useRef(activeId);
  const modelsRef = useRef(models);
  const abortRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef('');
  const isStreamingRef = useRef(false);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { presetsRef.current = presets; }, [presets]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

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

  const runCompletion = useCallback(
    async (conversationId: string, history: ChatMessage[]) => {
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

      const controller = new AbortController();
      abortRef.current = controller;
      isStreamingRef.current = true;
      streamingTextRef.current = '';
      setStreamingText('');
      setStreamingConvId(conversationId);
      setIsStreaming(true);
      setChatError(null);
      setRawDebug(null);

      const appendAssistant = (content: string, extra?: Partial<AssistantMeta>) => {
        const message: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
          meta: {
            provider: conversation.provider,
            model: conversation.model,
            ...extra,
          },
        };
        updateConversationById(conversationId, (c) => ({
          messages: [...c.messages, message],
        }));
      };

      try {
        // The adapter turns our internal format into the provider request and
        // parses the streamed response back — see src/lib/providerAdapters.
        const outcome = await runChatStream({
          adapter,
          apiKey,
          model: conversation.model || adapter.defaultModel,
          systemPrompt: conversation.systemPrompt,
          history: limited,
          settings: conversation.settings,
          signal: controller.signal,
          onDelta: (delta) => {
            streamingTextRef.current += delta;
            setStreamingText(streamingTextRef.current);
          },
        });
        appendAssistant(outcome.text || '*(empty response)*', {
          responseTimeMs: outcome.responseTimeMs,
          usage: outcome.usage,
        });
        setRawDebug({
          request: outcome.rawRequest,
          response: outcome.rawResponse,
          status: outcome.status,
          responseTimeMs: outcome.responseTimeMs,
        });
      } catch (error) {
        const playgroundError = toPlaygroundError(error);
        const partial = streamingTextRef.current;
        if (playgroundError.kind === 'abort') {
          // "Stop" pressed: keep whatever text already arrived.
          if (partial) {
            appendAssistant(partial, { stopped: true });
          }
          toast.info('Generation stopped.');
        } else {
          if (partial) {
            appendAssistant(partial, { stopped: true, error: playgroundError.message });
          }
          setChatError(playgroundError.message);
          toast.error(playgroundError.message);
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
        setIsStreaming(false);
        setStreamingConvId(null);
        setStreamingText('');
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
      await runCompletion(conversation.id, history);
    },
    [runCompletion, updateConversationById],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
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
    await runCompletion(conversation.id, messages);
  }, [runCompletion, updateConversationById]);

  const dismissChatError = useCallback(() => setChatError(null), []);

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

  const testApiKey = useCallback(async (provider: ProviderId) => {
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
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
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
  }, []);

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
    editMessage,
    deleteMessage,
    regenerate,
    chatError,
    dismissChatError,
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
