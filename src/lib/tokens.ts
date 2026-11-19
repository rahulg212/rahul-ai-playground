/**
 * Approximate token counting.
 *
 * A precise count is impossible without each provider's tokenizer, so we use
 * the common rule of thumb: ~4 characters per token for English text, plus a
 * small per-message overhead (role markers, formatting). This is close enough
 * to sanity-check context limits and cost.
 */
import type { ChatMessage, Conversation } from '@/lib/types';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimated tokens for a message list, including per-message overhead. */
export function estimateMessagesTokens(messages: Pick<ChatMessage, 'content'>[]): number {
  const PER_MESSAGE_OVERHEAD = 4;
  return (
    messages.reduce((sum, m) => sum + estimateTokens(m.content) + PER_MESSAGE_OVERHEAD, 0)
  );
}

/**
 * Estimated tokens that the NEXT request would send for this conversation:
 * system prompt + history (already respecting the context limit).
 */
export function estimateConversationTokens(conversation: Conversation, history: ChatMessage[]): number {
  return estimateTokens(conversation.systemPrompt) + estimateMessagesTokens(history);
}

/**
 * Apply the conversation's context limit to a message list.
 * limit = 0 sends everything; otherwise only the last N messages are kept.
 * Leading assistant messages are trimmed because most providers require the
 * first message in a request to come from the user.
 */
export function applyContextLimit(messages: ChatMessage[], limit: number): ChatMessage[] {
  let list = messages;
  if (limit > 0 && limit < messages.length) list = list.slice(-limit);
  while (list.length > 0 && list[0].role !== 'user') list = list.slice(1);
  return list;
}

/** Auto-generate a conversation title from its first user message. */
export function autoTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  if (clean.length <= 40) return clean || 'New Chat';
  return `${clean.slice(0, 40).trimEnd()}…`;
}

/** "2h ago"-style relative time for the chat list. */
export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
