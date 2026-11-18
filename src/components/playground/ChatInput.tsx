'use client';

/**
 * The message composer, matching what mainstream BYOK clients do:
 *   - auto-growing textarea, Enter to send, Shift+Enter for a newline
 *   - Send morphs into Stop while streaming
 *   - the unsent draft is persisted per conversation (survives reloads/errors)
 *   - a nudge + shortcut to settings appears while no API key is configured
 */
import React, { useRef, useState } from 'react';
import { ArrowUp, KeyRound, Square } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { providerLabel } from '@/lib/errors';
import { loadJson, saveJson, STORAGE_KEYS } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

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

export function ChatInput() {
  const {
    sendMessage,
    stopStreaming,
    isStreaming,
    activeConversation,
    settings,
    toggleSettings,
    setMobileDrawer,
  } = usePlayground();
  const [text, setText] = useState(() => (activeConversation?.id ? readDraft(activeConversation.id) : ''));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationId = activeConversation?.id ?? null;
  // Note: ChatInput is remounted with key={conversationId} by ChatArea, so the
  // lazy useState above re-reads the persisted draft on every chat switch.

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
            <span className="shrink-0 font-medium underline-offset-2 underline">Open settings</span>
          </button>
        )}
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm transition-colors focus-within:border-primary/50">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? 'Waiting for the response…'
                : `Message ${activeConversation?.model || 'the model'}…  (Enter to send, Shift+Enter for a new line)`
            }
            aria-label="Chat message"
            rows={1}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
          />
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
