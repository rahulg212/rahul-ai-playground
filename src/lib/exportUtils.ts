/**
 * Import / export helpers.
 *
 * - A single conversation can be exported as JSON or Markdown and re-imported.
 * - All app data (settings, presets, conversations) can be exported to a
 *   single backup file, optionally WITHOUT the API keys.
 */
import { PROVIDER_IDS } from '@/lib/providerAdapters';
import { uid } from '@/lib/storage';
import type { AppSettings, ChatMessage, Conversation, Preset } from '@/lib/types';

/** Trigger a client-side file download. */
export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'conversation'
  );
}

function safeProvider(provider: string): Conversation['provider'] {
  return (PROVIDER_IDS as string[]).includes(provider)
    ? (provider as Conversation['provider'])
    : 'openai';
}

/** Serialize one conversation into the JSON interchange format. */
export function conversationToJson(conversation: Conversation): string {
  return JSON.stringify(
    {
      format: 'api-playground-conversation',
      version: 1,
      exportedAt: new Date().toISOString(),
      title: conversation.title,
      provider: conversation.provider,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
      settings: conversation.settings,
      contextLimit: conversation.contextLimit,
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        meta: m.meta,
      })),
    },
    null,
    2,
  );
}

export function exportConversationAsJson(conversation: Conversation): void {
  downloadText(`${slugify(conversation.title)}.json`, conversationToJson(conversation), 'application/json');
}

/** Render one conversation as readable Markdown. */
export function conversationToMarkdown(conversation: Conversation): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title}`, '');
  lines.push(
    `- Provider: **${conversation.provider}**`,
    `- Model: **${conversation.model}**`,
    `- Exported: ${new Date().toISOString()}`,
    '',
  );
  if (conversation.systemPrompt) {
    lines.push('## System Prompt', '', '```text', conversation.systemPrompt, '```', '');
  }
  lines.push('## Messages', '');
  for (const message of conversation.messages) {
    const who = message.role === 'user' ? 'User' : 'Assistant';
    const when = new Date(message.createdAt).toLocaleString();
    lines.push(`### ${who} — ${when}`, '');
    if (message.role === 'assistant' && message.meta) {
      const bits = [`model: \`${message.meta.model}\``];
      if (message.meta.responseTimeMs) bits.push(`time: ${message.meta.responseTimeMs}ms`);
      if (message.meta.usage?.totalTokens) bits.push(`tokens: ${message.meta.usage.totalTokens}`);
      lines.push(`> ${bits.join(' · ')}`, '');
    }
    lines.push(message.content, '');
  }
  return lines.join('\n');
}

export function exportConversationAsMarkdown(conversation: Conversation): void {
  downloadText(`${slugify(conversation.title)}.md`, conversationToMarkdown(conversation), 'text/markdown');
}

/** Parse an imported conversation file, validating and normalizing it. */
export function parseImportedConversation(jsonText: string): Conversation {
  const raw = JSON.parse(jsonText) as Record<string, unknown>;
  const messagesRaw = raw.messages;
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    throw new Error('The file has no messages array — is it an API Playground conversation export?');
  }
  const messages: ChatMessage[] = (messagesRaw as Array<Record<string, unknown>>)
    .filter(
      (m): m is { role: 'user' | 'assistant'; content?: string; createdAt?: number } =>
        m !== null &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant'),
    )
    .map((m, index) => ({
      id: uid(),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : '',
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now() + index,
    }));
  if (messages.length === 0) {
    throw new Error('The file contains no user/assistant messages.');
  }
  const now = Date.now();
  return {
    id: uid(),
    title: typeof raw.title === 'string' && raw.title ? `${raw.title} (imported)` : 'Imported Chat',
    createdAt: now,
    updatedAt: now,
    messages,
    provider: safeProvider(String(raw.provider ?? 'openai')),
    model: typeof raw.model === 'string' ? raw.model : '',
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
    settings:
      typeof raw.settings === 'object' && raw.settings !== null
        ? (raw.settings as Conversation['settings'])
        : {
            temperature: 0.7,
            maxTokens: 1024,
            topP: 1,
            stopSequences: [],
          },
    contextLimit: typeof raw.contextLimit === 'number' ? raw.contextLimit : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Full backup (settings + presets + conversations)                    */
/* ------------------------------------------------------------------ */

export interface FullBackup {
  format: 'api-playground-backup';
  version: 1;
  exportedAt: string;
  settings: AppSettings;
  presets: Preset[];
  conversations: Conversation[];
}

export function exportAllData(
  settings: AppSettings,
  presets: Preset[],
  conversations: Conversation[],
  includeKeys: boolean,
): void {
  const backup: FullBackup = {
    format: 'api-playground-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: includeKeys
      ? settings
      : { ...settings, apiKeys: { openai: '', anthropic: '', gemini: '', openrouter: '' } },
    presets,
    conversations,
  };
  downloadText('api-playground-backup.json', JSON.stringify(backup, null, 2), 'application/json');
}

export interface ImportAllResult {
  settings?: AppSettings;
  presets?: Preset[];
  conversations: Conversation[];
}

/** Parse a full-backup file. Returns undefined on an unrecognized shape. */
export function parseFullBackup(jsonText: string): ImportAllResult | undefined {
  const raw = JSON.parse(jsonText) as Partial<FullBackup> & Record<string, unknown>;
  if (raw.format !== 'api-playground-backup' || !Array.isArray(raw.conversations)) {
    return undefined;
  }
  const result: ImportAllResult = {
    conversations: (raw.conversations as Conversation[]).map((c) => ({
      ...c,
      id: uid(), // New IDs so imports merge instead of overwriting.
      messages: (c.messages ?? []).map((m) => ({ ...m, id: uid() })),
    })),
  };
  if (raw.settings && typeof raw.settings === 'object') result.settings = raw.settings as AppSettings;
  if (Array.isArray(raw.presets)) result.presets = raw.presets as Preset[];
  return result;
}
