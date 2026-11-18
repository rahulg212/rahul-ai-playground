'use client';

/**
 * The main chat area: scrollable message list, empty state, error banner,
 * raw debug panel and the composer. Auto-scrolls to the newest content while
 * the user is near the bottom.
 */
import React, { useEffect, useRef } from 'react';
import { KeyRound, Settings2 } from 'lucide-react';
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
            <li>Choose or type a model ID.</li>
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

export function ChatArea() {
  const {
    activeConversation,
    isStreaming,
    streamingConvId,
    streamingText,
    chatError,
  } = usePlayground();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only follow the stream while the user has not scrolled up to read.
  const nearBottomRef = useRef(true);

  const conversation = activeConversation;
  const messages = conversation?.messages ?? [];
  const showStreamingHere = isStreaming && streamingConvId === conversation?.id;

  // Auto-scroll when new content arrives.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, streamingText, chatError, showStreamingHere]);

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
      <ChatInput />
    </div>
  );
}
