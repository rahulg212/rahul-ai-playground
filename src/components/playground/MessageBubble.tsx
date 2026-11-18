'use client';

/**
 * One chat message: avatar, bubble, markdown (assistant) or plain text (user),
 * action row (copy / edit / delete / regenerate) and the response meta line
 * (model, latency, token usage) under assistant messages.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Pencil,
  RefreshCw,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlayground } from '@/components/playground/context';
import { MarkdownRenderer } from '@/components/playground/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  const startRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!autoOpen) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    const timer = setInterval(() => {
      if (startRef.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [autoOpen]);

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-dashed bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={shown}
      >
        <Brain className={cn('h-3.5 w-3.5 shrink-0', autoOpen && 'animate-pulse')} />
        <span>
          {autoOpen ? `Thinking… ${elapsedSeconds}s` : 'Thought process'}
        </span>
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

interface MessageBubbleProps {
  message: ChatMessage;
  /** Whether this is the newest message (controls the regenerate button). */
  isLast: boolean;
  /** True while this bubble displays a still-streaming response. */
  streaming?: boolean;
}

export function MessageBubble({ message, isLast, streaming = false }: MessageBubbleProps) {
  const { deleteMessage, editMessage, regenerate, isStreaming } = usePlayground();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === 'user';
  const meta = message.meta;

  const startEditing = () => {
    setDraft(message.content);
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
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'border bg-card rounded-tl-sm',
              meta?.error && 'border-destructive/50',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
            ) : (
              <>
                {message.reasoning && (
                  <ThinkingBlock
                    reasoning={message.reasoning}
                    streaming={streaming}
                    hasContent={message.content.length > 0}
                  />
                )}
                <MarkdownRenderer content={message.content} />
                {streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-foreground/70 align-text-bottom" />
                )}
              </>
            )}
          </div>
        )}

        {/* Meta line for assistant messages: model, latency, token usage. */}
        {!isUser && meta && !editing && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px] text-muted-foreground">
            <span className="font-medium">{meta.model}</span>
            {meta.responseTimeMs !== undefined && <span>· {(meta.responseTimeMs / 1000).toFixed(2)}s</span>}
            {meta.usage && (
              <span>
                · {meta.usage.promptTokens ?? '?'} in / {meta.usage.completionTokens ?? '?'} out
                {meta.usage.totalTokens !== undefined ? ` (${meta.usage.totalTokens} tok)` : ''}
              </span>
            )}
            {meta.stopped && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5" /> {meta.error ? 'interrupted' : 'stopped'}
              </Badge>
            )}
          </div>
        )}

        {/* Streaming indicator */}
        {streaming && !message.content && !message.reasoning && (
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
            {!streaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void copyText(message.content)}
                aria-label="Copy message"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
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
            {!isUser && isLast && !isStreaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void regenerate()}
                aria-label="Regenerate response"
                title="Regenerate"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isStreaming && (
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
