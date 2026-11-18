'use client';

/**
 * The main chat area: scrollable message list, empty state, error banner,
 * live race panel (multi-model arena), raw debug panel and the composer.
 * Auto-scrolls to the newest content while the user is near the bottom.
 */
import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Settings2, Trophy } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { ChatErrorBanner, MessageBubble } from '@/components/playground/MessageBubble';
import { ChatInput } from '@/components/playground/ChatInput';
import { RawPanel } from '@/components/playground/RawPanel';
import { Button } from '@/components/ui/button';

/** Shown when the conversation has no messages yet. */
function EmptyState() {
  const { setMobileDrawer, toggleSettings } = usePlayground();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-muted">
          <Settings2 className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Start testing your API key</h2>
          <ol className="mx-auto max-w-xs list-decimal space-y-1 text-left text-sm text-muted-foreground">
            <li>Pick a provider in the settings panel (right).</li>
            <li>Paste an API key and press Save, then Test Key.</li>
            <li>Pick a model from the header picker — or type a custom ID.</li>
            <li>Write a system prompt (or load a preset) and send a message.</li>
          </ol>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toggleSettings();
              setMobileDrawer(null);
            }}
          >
            <KeyRound className="h-4 w-4" /> Open settings
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Keys, chats and settings are stored only in this browser&apos;s localStorage. This app is
          meant for personal, local testing.
        </p>
      </div>
    </div>
  );
}

/**
 * Live race status (G0DM0D3 racing): one row per candidate with a live status
 * + character counter, so users SEE all competitors working in parallel while
 * the leader streams into the bubble below.
 */
function RaceLivePanel() {
  const { raceLive } = usePlayground();
  if (!raceLive) return null;
  return (
    <div
      className="mx-auto mb-4 w-full max-w-3xl rounded-xl border border-dashed p-3"
      role="status"
      aria-label="Race in progress"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <Trophy className="h-3.5 w-3.5 text-amber-500" />
        Race in progress — {raceLive.candidates.filter((c) => c.done).length}/{raceLive.candidates.length} finished
      </div>
      <div className="space-y-1.5">
        {raceLive.candidates.map((candidate, index) => (
          <div
            key={`${candidate.provider}-${candidate.model}-${index}`}
            className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
          >
            {candidate.done ? (
              candidate.error ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )
            ) : (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            )}
            <span className="min-w-0 flex-1 truncate font-mono" title={candidate.model}>
              {candidate.model}
            </span>
            {candidate.error ? (
              <span className="max-w-[280px] truncate text-destructive" title={candidate.error}>
                {candidate.error}
              </span>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                {candidate.done
                  ? `${(candidate.responseTimeMs ?? 0) / 1000 > 0 ? `${((candidate.responseTimeMs ?? 0) / 1000).toFixed(1)}s · ` : ''}${candidate.text.length} chars`
                  : candidate.text.length > 0
                    ? `streaming · ${candidate.text.length} chars`
                    : 'waiting for first token…'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatArea() {
  const {
    activeConversation,
    isStreaming,
    streamingConvId,
    streamingText,
    streamingReasoning,
    chatError,
    raceLive,
  } = usePlayground();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only follow the stream while the user has not scrolled up to read.
  const nearBottomRef = useRef(true);

  const conversation = activeConversation;
  const messages = conversation?.messages ?? [];
  const showStreamingHere = isStreaming && streamingConvId === conversation?.id;
  const showRaceHere = raceLive !== null && raceLive.conversationId === conversation?.id;

  // Auto-scroll when new content arrives.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, streamingText, streamingReasoning, chatError, showStreamingHere, showRaceHere]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    nearBottomRef.current = distance < 120;
  };

  if (!conversation) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="scrollbar-thin flex-1 overflow-y-auto">
        {messages.length === 0 && !showStreamingHere ? (
          <EmptyState />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
            {showRaceHere && <RaceLivePanel />}
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1 && !showStreamingHere}
              />
            ))}
            {/* Live placeholder bubble fed by the streaming deltas. */}
            {showStreamingHere && (
              <MessageBubble
                message={{
                  id: '__streaming__',
                  role: 'assistant',
                  content: streamingText,
                  reasoning: streamingReasoning || undefined,
                  createdAt: Date.now(),
                }}
                isLast
                streaming
              />
            )}
          </div>
        )}
      </div>
      <div className="px-3 pb-2">
        <ChatErrorBanner />
      </div>
      <RawPanel />
      {/* key remounts the composer per conversation → restores the saved draft. */}
      <ChatInput key={conversation?.id ?? 'none'} />
    </div>
  );
}
