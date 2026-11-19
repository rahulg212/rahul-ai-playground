'use client';

/**
 * The message composer, matching what mainstream BYOK clients do:
 *   - auto-growing textarea, Enter to send, Shift+Enter for a newline
 *   - Send morphs into Stop while streaming
 *   - the unsent draft is persisted per conversation (survives reloads/errors)
 *   - a nudge + shortcut to settings appears while no API key is configured
 *   - Race toggle (G0DM0D3-inspired): send one prompt to up to 3 models in
 *     parallel and keep the best answer
 */
import React, { useMemo, useRef, useState } from 'react';
import { ArrowUp, KeyRound, Mic, MicOff, Plus, Square, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePlayground } from '@/components/playground/context';
import { providerLabel } from '@/lib/errors';
import { loadJson, saveJson, STORAGE_KEYS } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ModelInfo, ProviderId } from '@/lib/types';

/** localStorage map of unsent drafts keyed by conversation id. */
type DraftMap = Record<string, string>;

function readDraft(conversationId: string): string {
  const drafts = loadJson<DraftMap>(STORAGE_KEYS.drafts, {});
  return drafts[conversationId] ?? '';
}

function writeDraft(conversationId: string, text: string): void {
  const drafts = loadJson<DraftMap>(STORAGE_KEYS.drafts, {});
  if (text) drafts[conversationId] = text;
  else delete drafts[conversationId];
  saveJson(STORAGE_KEYS.drafts, drafts);
}

/** Compact competitor chip shown above the composer when race mode is on. */
function RaceSpecChip({ provider, model }: { provider: ProviderId; model: string }) {
  const { removeRaceModel } = usePlayground();
  return (
    <Badge variant="outline" className="h-6 max-w-[240px] gap-1 pr-1 font-mono text-[11px] normal-case">
      <span className="truncate">
        <span className="text-muted-foreground">{providerLabel(provider)}:</span> {model}
      </span>
      <button
        type="button"
        onClick={() => removeRaceModel({ provider, model })}
        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-destructive"
        aria-label={`Remove ${model} from the race`}
        title="Remove from race"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

/** Model picker popover for race competitors (only providers with keys). */
function RaceModelPicker() {
  const { models, settings, raceConfig, toggleRaceModel, loadModels } = usePlayground();

  // Providers with a saved key; ensure their model lists are loaded.
  const openProviders = useMemo(
    () =>
      (Object.keys(settings.apiKeys) as ProviderId[]).filter((provider) => settings.apiKeys[provider]),
    [settings.apiKeys],
  );

  const grouped = useMemo(() => {
    return openProviders.map((provider) => ({
      provider,
      items: models[provider].models.slice(0, 400) as ModelInfo[],
      loading: models[provider].loading,
      error: models[provider].error,
    }));
  }, [openProviders, models]);

  const isSelected = (provider: ProviderId, model: string) =>
    raceConfig.models.some((m) => m.provider === provider && m.model === model);
  const full = raceConfig.models.length >= 3;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 gap-1 rounded-full px-2 text-[11px]">
          <Plus className="h-3 w-3" /> Add model
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {openProviders.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Add at least one provider API key in settings first.
            </p>
          )}
          {grouped.map((group) => (
            <div key={group.provider} className="border-b last:border-b-0">
              <p className="sticky top-0 z-10 bg-popover px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {providerLabel(group.provider)}
                {group.loading && ' · loading…'}
                {group.error && ' · error'}
              </p>
              {group.error && (
                <div className="px-3 pb-2">
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => void loadModels(group.provider, true)}>
                    Retry loading models
                  </Button>
                </div>
              )}
              {group.items.map((model) => {
                const selected = isSelected(group.provider, model.id);
                return (
                  <label
                    key={model.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    <Checkbox
                      checked={selected}
                      disabled={!selected && full}
                      onCheckedChange={() => toggleRaceModel({ provider: group.provider, model: model.id })}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono" title={model.label ?? model.id}>
                      {model.id}
                    </span>
                    {model.free && (
                      <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                        free
                      </span>
                    )}
                  </label>
                );
              })}
              {group.items.length === 0 && !group.loading && !group.error && (
                <p className="px-3 py-1.5 text-xs text-muted-foreground">No models loaded yet.</p>
              )}
            </div>
          ))}
        </div>
        <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          Pick up to 3 models. Every candidate runs on its own provider key.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function ChatInput() {
  const {
    sendMessage,
    stopStreaming,
    isStreaming,
    activeConversation,
    settings,
    toggleSettings,
    setMobileDrawer,
    raceConfig,
    toggleRace,
  } = usePlayground();
  const [text, setText] = useState(() => (activeConversation?.id ? readDraft(activeConversation.id) : ''));
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const conversationId = activeConversation?.id ?? null;
  // Note: ChatInput is remounted with key={conversationId} by ChatArea, so the
  // lazy useState above re-reads the persisted draft on every chat switch.

  const toggleListening = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        toast.info('Listening… Speak your prompt');
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setText((prev) => {
            const updated = prev ? `${prev} ${transcript}` : transcript;
            if (conversationId) writeDraft(conversationId, updated);
            return updated;
          });
          autoResize();
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      toast.error('Could not activate microphone.');
    }
  };

  const autoResize = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  };

  const handleChange = (value: string) => {
    setText(value);
    if (conversationId) writeDraft(conversationId, value);
    autoResize();
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || !conversationId) return;
    setText('');
    writeDraft(conversationId, '');
    // Reset the textarea height for the next message.
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
    await sendMessage(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends unless the user is composing text (IME) or holds Shift.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const provider = activeConversation?.provider;
  const hasKey = !provider || Boolean(settings.apiKeys[provider]);
  const raceActive = raceConfig.enabled;

  const openSettings = () => {
    setMobileDrawer('settings');
    toggleSettings();
  };

  return (
    <div className="border-t bg-background p-3">
      <div className="mx-auto w-full max-w-3xl">
        {/* Nudge while the active provider has no key (BYOK onboarding). */}
        {!hasKey && (
          <button
            type="button"
            onClick={openSettings}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-400"
          >
            <KeyRound className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              Add your {provider ? providerLabel(provider) : ''} API key in Settings to start
              chatting — it stays in this browser.
            </span>
            <span className="shrink-0 font-medium underline underline-offset-2">Open settings</span>
          </button>
        )}
        {/* Race competitor bar (G0DM0D3-inspired arena). */}
        {raceActive && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed bg-muted/30 px-2.5 py-2">
            <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="text-[11px] font-medium text-muted-foreground">
              Race — the same prompt goes to all candidates in parallel; the best score wins.
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {raceConfig.models.map((spec) => (
                <RaceSpecChip key={`${spec.provider}:${spec.model}`} provider={spec.provider} model={spec.model} />
              ))}
              {!isStreaming && <RaceModelPicker />}
            </span>
            {raceConfig.models.length < 2 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                Pick at least 2 models — otherwise messages use the normal single-model flow.
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm transition-colors focus-within:border-primary/50">
          {/* Race toggle — left of the composer, like a mode switch. */}
          <button
            type="button"
            onClick={toggleRace}
            aria-pressed={raceActive}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
              raceActive
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
            title="Race mode — send one prompt to up to 3 models, keep the best answer"
            aria-label="Toggle race mode"
          >
            <Trophy className="h-4 w-4" />
          </button>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? 'Waiting for the response…'
                : raceActive
                  ? 'One prompt → every race candidate… (Enter to send)'
                  : `Message ${activeConversation?.model || 'the model'}…  (Enter to send, Shift+Enter for a new line)`
            }
            aria-label="Chat message"
            rows={1}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            onClick={toggleListening}
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 shrink-0 rounded-lg transition-colors',
              isListening ? 'text-destructive bg-destructive/10 animate-pulse' : 'text-muted-foreground hover:text-foreground',
            )}
            title={isListening ? 'Stop listening' : 'Voice input (Speech to text)'}
            aria-label={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          {isStreaming ? (
            <Button
              onClick={stopStreaming}
              variant="destructive"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              onClick={() => void submit()}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              disabled={!text.trim()}
              aria-label="Send message"
              title="Send (Enter)"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className={'px-2 pt-1.5 text-[11px] text-muted-foreground'}>
          Enter to send · Shift+Enter for a newline · the full conversation (respecting the context limit) is sent with every request
        </p>
      </div>
    </div>
  );
}
