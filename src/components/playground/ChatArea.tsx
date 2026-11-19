'use client';

/**
 * The main chat area: scrollable message list, empty state with quick starters,
 * error banner, live race panel (multi-model arena), raw debug panel and the composer.
 * Auto-scrolls to the newest content while the user is near the bottom.
 */
import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  KeyRound,
  Loader2,
  Palette,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { ChatErrorBanner, MessageBubble } from '@/components/playground/MessageBubble';
import { ChatInput } from '@/components/playground/ChatInput';
import { RawPanel } from '@/components/playground/RawPanel';
import { Button } from '@/components/ui/button';

const QUICK_STARTERS = [
  {
    icon: Code2,
    title: 'Code Optimization',
    prompt: 'Write a type-safe debounce utility in TypeScript with cancel and immediate execution options, along with unit tests.',
    gradient: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20 hover:border-blue-500/40',
  },
  {
    icon: Palette,
    title: 'Interactive UI Artifact',
    prompt: 'Create a clean, modern HTML/CSS landing page hero section with an animated gradient background and an interactive CTA button.',
    gradient: 'from-purple-500/10 to-pink-500/10 border-purple-500/20 hover:border-purple-500/40',
  },
  {
    icon: Brain,
    title: 'Deep Architecture',
    prompt: 'Explain the core architectural differences and tradeoffs between microfrontends, server components, and islands architecture.',
    gradient: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 hover:border-amber-500/40',
  },
  {
    icon: Zap,
    title: 'Fast Free AI Test',
    prompt: 'Summarize the top 5 emerging artificial intelligence design patterns in 2026 into a clean comparison table.',
    gradient: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 hover:border-emerald-500/40',
  },
];

/** Shown when the conversation has no messages yet — rich 10x interactive starter screen. */
function EmptyState() {
  const { setMobileDrawer, toggleSettings, sendMessage, activeConversation, setProvider } = usePlayground();

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl space-y-6 text-center">
        {/* Hero badge */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-gradient-to-br from-primary/15 via-muted to-muted shadow-xs">
          <Sparkles className="h-7 w-7 text-primary animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-primary" />
            <span>Rahul&apos;s AI Nexus · Multi-Model LLM Arena</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            How can I help you today?
          </h2>
          <p className="mx-auto max-w-md text-xs md:text-sm text-muted-foreground leading-relaxed">
            Test, stream, and race models from OpenAI, Anthropic, Gemini, and OpenRouter directly in your browser. Local-first, private, and zero backend.
          </p>
        </div>

        {/* Quick prompt cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
          {QUICK_STARTERS.map((starter) => {
            const Icon = starter.icon;
            return (
              <button
                key={starter.title}
                type="button"
                onClick={() => void sendMessage(starter.prompt)}
                className={`group flex flex-col justify-between rounded-xl border bg-gradient-to-br p-3.5 transition-all duration-200 hover:scale-[1.01] hover:shadow-sm ${starter.gradient}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="p-1 rounded-md bg-background/80 border text-foreground group-hover:text-primary transition-colors">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">{starter.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {starter.prompt}
                </p>
              </button>
            );
          })}
        </div>

        {/* Free models notice & action row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toggleSettings();
              setMobileDrawer(null);
            }}
            className="text-xs h-8"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1" /> Configure API Keys
          </Button>

          {activeConversation?.provider !== 'openrouter' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setProvider('openrouter')}
              className="text-xs h-8 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
            >
              <Zap className="h-3.5 w-3.5 mr-1" /> Try Free Models (OpenRouter)
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/80">
          🔒 All API keys, settings, and conversations are stored exclusively in your local browser storage.
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
      className="mx-auto mb-4 w-full max-w-3xl rounded-xl border border-dashed p-3 bg-muted/20"
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
            className="flex items-center gap-2 rounded-lg bg-background/80 border px-2.5 py-1.5 text-xs"
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
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={candidate.model}>
              {candidate.model}
            </span>
            {candidate.error ? (
              <span className="max-w-[280px] truncate text-destructive text-[11px]" title={candidate.error}>
                {candidate.error}
              </span>
            ) : (
              <span className="tabular-nums text-muted-foreground text-[11px]">
                {candidate.done
                  ? `${(candidate.responseTimeMs ?? 0) / 1000 > 0 ? `${((candidate.responseTimeMs ?? 0) / 1000).toFixed(1)}s · ` : ''}${candidate.text.length} chars`
                  : candidate.text.length > 0
                    ? `streaming · ${candidate.text.length} chars`
                    : 'connecting…'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatArea() {
  const { activeConversation, isStreaming, streamingText, streamingReasoning, streamingConvId } =
    usePlayground();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const messages = activeConversation?.messages ?? [];
  const isEmpty = messages.length === 0;

  // Auto-scroll while streaming when the user is already near the bottom.
  useEffect(() => {
    const element = scrollAreaRef.current;
    if (!element) return;
    const threshold = 160;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, streamingReasoning]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollAreaRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLast={index === messages.length - 1}
                />
              ))}

              {/* In-flight streaming bubble for single-model completion */}
              {isStreaming && streamingConvId === activeConversation?.id && (
                <MessageBubble
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingText,
                    reasoning: streamingReasoning,
                    createdAt: Date.now(),
                    meta: {
                      model: activeConversation?.model ?? 'streaming…',
                    },
                  }}
                  isLast={true}
                  streaming={true}
                />
              )}

              <RaceLivePanel />
              <ChatErrorBanner />
            </>
          )}
          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      <RawPanel />
      <ChatInput key={activeConversation?.id} />
    </div>
  );
}
