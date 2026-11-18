'use client';

/**
 * The message composer: auto-growing textarea, Enter to send,
 * Shift+Enter for a newline, and a Send/Stop button.
 */
import React, { useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function ChatInput() {
  const { sendMessage, stopStreaming, isStreaming, activeConversation } = usePlayground();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setText('');
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

  return (
    <div className="border-t bg-background p-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm transition-colors focus-within:border-primary/50">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              autoResize();
            }}
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
        <p className={cn('px-2 pt-1.5 text-[11px] text-muted-foreground')}>
          Enter to send · Shift+Enter for a newline · the full conversation (respecting the context limit) is sent with every request
        </p>
      </div>
    </div>
  );
}
