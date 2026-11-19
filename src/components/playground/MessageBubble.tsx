'use client';

/**
 * One chat message: avatar, bubble, markdown (assistant) or plain text (user),
 * action row (copy / edit / delete / regenerate / refine) and the response
 * meta line (model, latency, token usage, quality score) under assistant
 * messages.
 *
 * G0DM0D3-inspired extras rendered here:
 *   - quality score chip with grade + tooltip breakdown
 *   - Race navigator (‹ k/N ›) to flip between parallel candidates
 *   - Refine (liquid) version navigator (v1/v2/…)
 */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Eraser,
  Gauge,
  Pencil,
  RefreshCw,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlayground } from '@/components/playground/context';
import { MarkdownRenderer } from '@/components/playground/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { GRADE_META, scoreResponse } from '@/lib/score';
import { raceWinnerIndex, resolveMessageView } from '@/lib/messageView';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Could not copy — clipboard unavailable.');
  }
}

/**
 * Collapsible "thinking" block for reasoning models: while the model streams
 * its chain-of-thought (and no answer text has arrived yet) the block is open
 * automatically; afterwards it collapses to a one-line toggle.
 */
function ThinkingBlock({
  reasoning,
  streaming,
  hasContent,
}: {
  reasoning: string;
  streaming: boolean;
  hasContent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const autoOpen = streaming && !hasContent;
  const shown = autoOpen || open;

  // Reasoning models routinely think for 10-30s before the first answer token.
  // A live seconds counter proves the request is alive instead of frozen.
  // (Start timestamp + interval subscription; no synchronous setState here.)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startAt, setStartAt] = useState<number | null>(null);
  React.useEffect(() => {
    if (!autoOpen) {
      setStartAt(null);
      return;
    }
    setStartAt(Date.now());
  }, [autoOpen]);
  React.useEffect(() => {
    if (startAt === null) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startAt]);

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-dashed bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={shown}
      >
        <Brain className={cn('h-3.5 w-3.5 shrink-0', autoOpen && 'animate-pulse')} />
        <span>{autoOpen ? `Thinking… ${elapsedSeconds}s` : 'Thought process'}</span>
        <ChevronDown className={cn('ml-auto h-3 w-3 shrink-0 transition-transform', shown && 'rotate-180')} />
      </button>
      {shown && (
        <div
          className="scrollbar-thin max-h-48 overflow-y-auto whitespace-pre-wrap border-t px-2.5 py-2 text-xs leading-relaxed text-muted-foreground"
          aria-label="Model thinking process"
        >
          {reasoning}
        </div>
      )}
    </div>
  );
}

/**
 * Quality score chip ("Tastemaker-lite"): grade-coloured badge with the full
 * breakdown in a tooltip. Tooltip is interactive so the breakdown stays
 * readable on touch devices too.
 */
function ScoreChip({ message, score }: { message: ChatMessage; score?: number }) {
  // Live-resolve the score only for PLAIN messages that predate scoring
  // (no race/liquid data). For race candidates and refine versions the score
  // comes from the active candidate/version itself — showing the stored
  // message score instead would display a number belonging to another answer.
  const isDerived = Boolean(message.meta?.race || message.liquid);
  const resolved = useMemo(() => {
    if (score !== undefined) return score;
    if (isDerived) return undefined;
    if (!message.content || message.content.startsWith('*(')) return undefined;
    return scoreResponse(message.content, '').overall;
  }, [message.content, score, isDerived]);
  if (resolved === undefined) return null;

  const gradeForScore =
    resolved >= 85
      ? GRADE_META.elite
      : resolved >= 70
        ? GRADE_META.strong
        : resolved >= 55
          ? GRADE_META.decent
          : resolved >= 40
            ? GRADE_META.weak
            : GRADE_META.poor;
  const breakdown = message.meta?.quality?.breakdown;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn('h-4 cursor-help gap-0.5 px-1 font-mono text-[10px] tabular-nums', gradeForScore.className)}
          aria-label={`Quality score ${resolved} of 100, grade ${gradeForScore.label}`}
        >
          <Gauge className="h-2.5 w-2.5" /> {resolved}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="w-56 p-2 font-mono text-[11px]">
        <p className="mb-1 font-semibold">
          Quality {resolved}/100 · {gradeForScore.label}
        </p>
        {breakdown ? (
          <ul className="space-y-0.5">
            {breakdown.map((item) => (
              <li key={item.label} className="flex items-baseline gap-1.5">
                <span className="w-20 shrink-0 text-muted-foreground">{item.label}</span>
                <span className="w-7 shrink-0 tabular-nums">{item.score}</span>
                <span className="text-[10px] leading-tight text-muted-foreground/80">{item.hint}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Heuristic score — structure, completeness, directness, richness, speed.</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Race navigator: lets the user flip between the parallel candidates that
 * competed for this answer. Shows every model with its score, marks the
 * auto-winner with a crown.
 */
function RaceNavigator({ message }: { message: ChatMessage }) {
  const { setActiveRaceCandidate } = usePlayground();
  const race = message.meta?.race;
  if (!race || race.candidates.length < 2) return null;
  const winnerIndex = raceWinnerIndex(message);
  const activeIndex = Math.min(Math.max(0, race.activeIndex), race.candidates.length - 1);
  const active = race.candidates[activeIndex];

  const step = (direction: 1 | -1) => {
    const next = (activeIndex + direction + race.candidates.length) % race.candidates.length;
    setActiveRaceCandidate(message.id, next);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-2 py-1.5"
      role="group"
      aria-label="Race candidates"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Race</span>
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => step(-1)} aria-label="Previous candidate">
        <ChevronLeft className="h-3 w-3" />
      </Button>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {activeIndex + 1}/{race.candidates.length}
      </span>
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => step(1)} aria-label="Next candidate">
        <ChevronRight className="h-3 w-3" />
      </Button>
      <div className="flex flex-wrap items-center gap-1">
        {race.candidates.map((candidate, index) => (
          <button
            key={`${candidate.provider}-${candidate.model}-${index}`}
            type="button"
            onClick={() => setActiveRaceCandidate(message.id, index)}
            className={cn(
              'max-w-[180px] truncate rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
              index === activeIndex
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
            title={`${candidate.model}${candidate.score !== undefined ? ` · score ${candidate.score}` : ''}${candidate.error ? ` · ${candidate.error}` : ''}`}
          >
            {winnerIndex === index && <Crown className="mr-0.5 inline h-2.5 w-2.5 text-amber-400" />}
            {candidate.error && !candidate.text ? '✗ ' : ''}
            {candidate.model}
            {candidate.score !== undefined && <span className="ml-1 opacity-70">{candidate.score}</span>}
          </button>
        ))}
      </div>
      {winnerIndex === activeIndex && active.score !== undefined && (
        <span className="text-[10px] text-muted-foreground">auto-picked winner</span>
      )}
    </div>
  );
}

/** Refine (liquid) version navigator: v1 = original, later = refinements. */
function LiquidNavigator({ message }: { message: ChatMessage }) {
  const { setLiquidVersion } = usePlayground();
  const liquid = message.liquid;
  if (!liquid || liquid.versions.length < 2) return null;
  const activeIndex = Math.min(Math.max(0, liquid.activeIndex), liquid.versions.length - 1);

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Refine versions">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Refined</span>
      {liquid.versions.map((version, index) => (
        <button
          key={version.createdAt + '-' + index}
          type="button"
          onClick={() => setLiquidVersion(message.id, index)}
          className={cn(
            'rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors tabular-nums',
            index === activeIndex
              ? 'border-primary/60 bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
          title={version.score !== undefined ? `Version ${index + 1} · score ${version.score}` : `Version ${index + 1}`}
        >
          v{index + 1}
          {version.score !== undefined && <span className="ml-0.5 opacity-70">{version.score}</span>}
        </button>
      ))}
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  /** Whether this is the newest message (controls the regenerate button). */
  isLast: boolean;
  /** True while this bubble displays a still-streaming response. */
  streaming?: boolean;
}

export function MessageBubble({ message, isLast, streaming = false }: MessageBubbleProps) {
  const {
    deleteMessage,
    editMessage,
    regenerate,
    isStreaming,
    refineMessage,
    isRefining,
    refiningMessageId,
    refiningText,
  } = usePlayground();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === 'user';
  const meta = message.meta;
  const refiningThis = refiningMessageId === message.id;

  // Resolve the DISPLAYED content: refine version > race candidate > raw.
  const view = useMemo(() => resolveMessageView(message), [message]);
  const content = refiningThis ? refiningText : view.content;
  const reasoning = refiningThis ? message.reasoning : view.reasoning;

  const startEditing = () => {
    setDraft(view.content);
    setEditing(true);
  };

  const saveEditing = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error('Message cannot be empty.');
      return;
    }
    setEditing(false);
    await editMessage(message.id, trimmed);
  };

  const [speaking, setSpeaking] = useState(false);

  const toggleSpeak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast.error('Text-to-speech is not supported in this browser.');
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = view.content.replace(/[#*`_~[\]]/g, '').trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const score = refiningThis ? undefined : view.score;
  const throughput =
    view.usage?.completionTokens && view.responseTimeMs && view.responseTimeMs > 0
      ? (view.usage.completionTokens / (view.responseTimeMs / 1000)).toFixed(1)
      : null;

  return (
    <article className={cn('group flex gap-3', isUser && 'flex-row-reverse')} aria-label={isUser ? 'Your message' : 'Assistant message'}>
      {/* Avatar */}
      <div
        className={cn(
          'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'border bg-muted text-foreground',
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-1', isUser && 'items-end')}>
        {/* Bubble */}
        {editing ? (
          <div className="w-full space-y-2 rounded-xl border bg-background p-2 sm:w-[520px]">
            <Textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void saveEditing();
                }
                if (event.key === 'Escape') setEditing(false);
              }}
              className="min-h-[80px] resize-y border-0 p-2 text-sm shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-end gap-2 px-1 pb-1">
              <span className="mr-auto text-[11px] text-muted-foreground">Ctrl+Enter to save, Esc to cancel</span>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void saveEditing()}>
                <Check className="h-3.5 w-3.5" /> Save & resend
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'w-fit max-w-full rounded-2xl px-4 py-2.5 text-sm',
              isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'border bg-card rounded-tl-sm',
              (meta?.error || view.error) && 'border-destructive/50',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{content}</p>
            ) : (
              <>
                {reasoning && (
                  <ThinkingBlock
                    reasoning={reasoning}
                    streaming={streaming || refiningThis}
                    hasContent={content.length > 0}
                  />
                )}
                {!content && view.error ? (
                  <p className="text-xs italic text-destructive">This candidate failed: {view.error}</p>
                ) : (
                  <MarkdownRenderer content={content} />
                )}
                {(streaming || refiningThis) && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-foreground/70 align-text-bottom" />
                )}
              </>
            )}
          </div>
        )}

        {/* Race + refine navigators (assistant, finished) */}
        {!isUser && !editing && !streaming && !refiningThis && (
          <div className="flex flex-col gap-1 px-1">
            <RaceNavigator message={message} />
            <LiquidNavigator message={message} />
          </div>
        )}

        {/* Refining banner */}
        {refiningThis && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-primary">
            <Eraser className="h-3 w-3 animate-pulse" /> Refining answer…
          </div>
        )}

        {/* Meta line for assistant messages: model, latency, token usage, score. */}
        {!isUser && meta && !editing && (
          <TooltipProvider delayDuration={150}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-muted-foreground">
              <span className="font-medium">{refiningThis ? meta.model : (view.model ?? meta.model)}</span>
              {view.responseTimeMs !== undefined && (
                <span>· {(view.responseTimeMs / 1000).toFixed(2)}s</span>
              )}
              {view.usage && (
                <span>
                  · {view.usage.promptTokens ?? '?'} in / {view.usage.completionTokens ?? '?'} out
                  {view.usage.totalTokens !== undefined ? ` (${view.usage.totalTokens} tok)` : ''}
                </span>
              )}
              {throughput && (
                <span className="font-mono text-emerald-600 dark:text-emerald-400">· {throughput} tok/s</span>
              )}
              <ScoreChip message={message} score={score} />
              {meta.stopped && (
                <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                  <AlertTriangle className="h-2.5 w-2.5" /> {meta.error ? 'interrupted' : 'stopped'}
                </Badge>
              )}
              {view.error && !meta.stopped && (
                <Badge variant="outline" className="h-4 gap-0.5 border-destructive/40 px-1 text-[10px] text-destructive">
                  <AlertTriangle className="h-2.5 w-2.5" /> candidate failed
                </Badge>
              )}
            </div>
          </TooltipProvider>
        )}

        {/* Streaming indicator */}
        {streaming && !content && !reasoning && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <Zap className="h-3 w-3 animate-pulse" /> waiting for first token…
          </div>
        )}

        {/* Action row */}
        {!editing && (
          <div
            className={cn(
              'flex items-center gap-0.5 px-0.5 transition-opacity',
              'opacity-0 focus-within:opacity-100 group-hover:opacity-100 md:opacity-0',
              'max-md:opacity-100', // always visible on touch devices
            )}
          >
            {!streaming && !refiningThis && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void copyText(view.content)}
                aria-label="Copy message"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isUser && !streaming && !refiningThis && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7 transition-colors', speaking && 'text-primary animate-pulse')}
                onClick={toggleSpeak}
                aria-label={speaking ? 'Stop speech' : 'Read aloud'}
                title={speaking ? 'Stop speech' : 'Read aloud (Text to speech)'}
              >
                {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
            )}
            {isUser && !isStreaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={startEditing}
                aria-label="Edit and resend message"
                title="Edit & resend"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isUser && !isStreaming && !refiningThis && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void refineMessage(message.id)}
                aria-label="Refine this answer"
                title="Refine — ask the same model to improve this answer (keeps versions)"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isUser && isLast && !isStreaming && !refiningThis && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void regenerate()}
                aria-label="Regenerate response"
                title="Regenerate (slightly hotter sampling for variety)"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isStreaming && !refiningThis && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMessage(message.id)}
                aria-label="Delete message"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <span className="ml-1 text-[11px] text-muted-foreground">{formatTime(message.createdAt)}</span>
          </div>
        )}
      </div>
    </article>
  );
}

/** Dismissable error banner shown when a request fails. */
export function ChatErrorBanner() {
  const { chatError, chatErrorAction, dismissChatError, regenerate } = usePlayground();
  if (!chatError) return null;
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-3xl items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{chatError}</p>
      {chatErrorAction && (
        <Button
          size="sm"
          className="h-7 shrink-0"
          onClick={() => void chatErrorAction.run()}
          title={chatErrorAction.label}
        >
          <Zap className="h-3.5 w-3.5" /> {chatErrorAction.label}
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => void regenerate()}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={dismissChatError}
        aria-label="Dismiss error"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
