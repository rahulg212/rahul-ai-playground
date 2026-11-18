# API Playground

A local-first playground to chat with OpenAI, Anthropic Claude, Google Gemini and OpenRouter models directly from the browser. All API calls go browser-to-provider — no backend — and API keys, settings and chats are stored in `localStorage`.

> **Security warning:** This app is meant for personal and local testing only. API keys live unencrypted in your browser's `localStorage` and are sent directly to the providers from your machine. Never run it on shared machines or use production keys.

## Features

- 4 providers: OpenAI, Anthropic, Google Gemini, OpenRouter
- Per-provider API key management with show/hide, a Test Key button, and delete
- Model lists fetched from each provider's models endpoint, with a searchable dropdown and support for custom model IDs
- Streaming (SSE) responses with a Stop button, for all 4 providers
- Markdown rendering with syntax-highlighted code blocks and a per-block copy button
- Message actions: copy, edit & resend, regenerate, delete
- System prompt editor with named presets (Helpful Assistant, Code Expert, Translator built in); load, rename and delete presets
- Generation settings: temperature, max tokens, top_p, stop sequences (disabled when a provider does not support them), reset to defaults
- Conversation history sidebar with auto-titles, rename, delete and search; each conversation remembers its own provider, model, system prompt and settings
- Context limit (send all history or only the last N messages) with an approximate token counter
- Raw debug panel showing the exact JSON request (API key masked) and the raw streamed response
- Response time, token usage and model shown under each assistant message
- Clear error messages with HTTP status (invalid key, rate limit, CORS, model not found)
- Export a conversation as JSON/Markdown, import conversation JSON, and full backup export/import (optionally without API keys)
- Dark/light mode, responsive layout, toast notifications

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4, shadcn/ui + Lucide icons
- react-markdown + remark-gfm + react-syntax-highlighter
- sonner toasts, next-themes

There is no backend and no database — everything runs client-side in the browser.

## Getting started

Prerequisites: Node.js 18.18+ (or Bun).

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To lint the project, run `npm run lint`. (The project was originally developed with Bun; npm works the same.)

## Architecture

```
src/lib/types.ts                  Shared types (ChatMessage, Conversation, ProviderAdapter, ...)
src/lib/sse.ts                    Streaming SSE parser
src/lib/streaming.ts              The single place that executes a streamed chat request (maskHeaders, runChatStream)
src/lib/errors.ts                 Error normalization (PlaygroundError: auth / rate limit / not found / CORS / ...)
src/lib/storage.ts                localStorage keys, defaults, factories
src/lib/tokens.ts                 Approximate token counting, context limit, auto titles
src/lib/exportUtils.ts            JSON/Markdown export + full backups
src/lib/providerAdapters/         One adapter per provider:
  openai.ts                       POST /v1/chat/completions, Bearer auth, system role message; handles
                                  o1/o3/o4/gpt-5 reasoning models (which need max_completion_tokens)
  anthropic.ts                    POST /v1/messages, x-api-key + anthropic-version +
                                  anthropic-dangerous-direct-browser-access headers, top-level system
                                  field, max_tokens required
  gemini.ts                       POST .../models/{model}:streamGenerateContent?alt=sse, x-goog-api-key
                                  header, systemInstruction, roles user/model
  openrouter.ts                   OpenAI-compatible + HTTP-Referer/X-Title headers, usage include,
                                  public models endpoint, key test via /api/v1/auth/key
  index.ts                        Registry (getAdapter) + DEFAULT_PRESETS
  shared.ts                       Models-list mapping helpers
src/hooks/useLocalStorage.ts      localStorage state via useSyncExternalStore, with cross-tab sync
src/components/playground/        UI layer:
  context.tsx                     PlaygroundProvider: all app state and actions (conversations,
                                  streaming, keys, models, presets, import/export)
  *.tsx                           Components (Sidebar, TopBar, ChatArea, MessageBubble, ChatInput,
                                  MarkdownRenderer, SettingsPanel + sections, RawPanel)
src/app/page.tsx + layout.tsx     The single page and the theme/toast providers
```

## Adding a new provider

Providers are self-contained adapters. The UI (provider dropdown, key manager, model selector) picks a new one up automatically.

1. Add the id to the `ProviderId` union in `src/lib/types.ts`:

   ```ts
   export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'mistral';
   ```

2. Create `src/lib/providerAdapters/<name>.ts` implementing the `ProviderAdapter` interface:

   ```ts
   import type { ProviderAdapter } from '@/lib/types';

   export const mistralAdapter: ProviderAdapter = {
     id: 'mistral',
     label: 'Mistral',
     defaultModel: 'mistral-large-latest',
     capabilities: { temperature: true, maxTokens: true, topP: true, stopSequences: true },
     fetchModels(apiKey) { /* call GET /v1/models, map to ModelInfo[] */ },
     testKey(apiKey) { /* cheap validation call, return { ok, message } */ },
     buildChatRequest(args) { /* return { url, headers, body } from internal format */ },
     extractDelta(json) { /* pull the text delta out of one streamed payload, or null */ },
     extractUsage(json) { /* pull partial token usage out of one payload, or null */ },
     // optional: isFinalPayload?(payload) { /* return true when this SSE payload ends the stream */ },
   };
   ```

3. Register it in `src/lib/providerAdapters/index.ts` (add it to the `ADAPTERS` map) and add a default empty key in `defaultSettings()` in `src/lib/storage.ts`.

4. Add its label to `PROVIDER_LABELS` in `src/lib/errors.ts` so error messages use the provider's name.

## Privacy & security notes

- All API calls are made directly from your browser to the provider, which depends on each provider's CORS policy. Anthropic requires the `anthropic-dangerous-direct-browser-access` header for browser access, which this app sends automatically.
- API keys are stored unencrypted in `localStorage`. Anyone with access to your browser profile can read them.
- Do not use production keys. Create restricted, low-limit test keys for the providers you try.
- You can remove a key at any time with its Delete button, or clear everything the app stores by clearing site data in your browser.
