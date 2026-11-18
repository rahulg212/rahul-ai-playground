# API Playground

A local-first playground to chat with OpenAI, Anthropic Claude, Google Gemini and OpenRouter models. Provider requests are built in the browser by per-provider adapters and relayed through a small local server proxy (`/api/proxy`), so streaming works in every environment with no CORS issues. API keys, settings and chats are stored in `localStorage`.

> **Security warning:** This app is meant for personal and local testing only. API keys live unencrypted in your browser's `localStorage` and pass through the app's local proxy on their way to the providers. Never run it on shared machines or use production keys.

## Features

- 4 providers: OpenAI, Anthropic, Google Gemini, OpenRouter
- Per-provider API key management with show/hide, a Test Key button (auto-reloads the model list on success), and delete
- Model lists fetched from each provider's models endpoint, with a searchable dropdown, a "Free only" filter (OpenRouter), free-model badges, and support for custom model IDs
- Streaming (SSE) responses with a Stop button, for all 4 providers
- Reasoning support: chain-of-thought from reasoning models (all current OpenRouter `:free` models, Anthropic extended thinking) is shown in a collapsible "Thinking" block
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
src/app/api/proxy/route.ts        Local streaming relay for provider APIs (origin allowlist, SSE pass-through)
src/lib/types.ts                  Shared types (ChatMessage, Conversation, ProviderAdapter, ...)
src/lib/transport.ts              providerFetch — routes every provider call through /api/proxy
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
                                  reasoning deltas, public models endpoint, key test via /api/v1/auth/key.
                                  Default model is a ":free" model (free-tier keys have no credits)
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

## How provider calls are transported

The adapters still build the exact provider URL and headers (visible in the Raw debug panel, key masked). `src/lib/transport.ts` swaps only the transport: every call goes to `/api/proxy?target=<provider-url>`, a Next.js route that:

- is allowlisted to the four provider origins only (no open relay),
- forwards method, auth headers and JSON body unchanged,
- streams the response (including SSE) straight back so token-by-token streaming and the Stop button work as usual.

This avoids every provider's CORS restrictions (Anthropic would otherwise require the `anthropic-dangerous-direct-browser-access` header) and makes the app work in sandboxed/preview environments and restricted networks.

## Testing with OpenRouter (free)

1. Create a free key at https://openrouter.ai/keys and paste it into the Provider & API Key section.
2. Press **Test Key** — a valid key reports your limit/usage and the model list loads immediately.
3. Open the Model dropdown and hit **Free only** to see the models that cost nothing (IDs ending in `:free`). The default model is already a free one.
4. Note: free models on OpenRouter are reasoning models — their chain-of-thought streams into a collapsible "Thinking" block before the answer appears.

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

4. Add its origin to `ALLOWED_ORIGINS` in `src/app/api/proxy/route.ts`.

5. Add its label to `PROVIDER_LABELS` in `src/lib/errors.ts` so error messages use the provider's name.

## Privacy & security notes

- Provider requests are relayed through the local `/api/proxy` route; the proxy is restricted to the four provider origins and is intended for local testing only.
- API keys are stored unencrypted in `localStorage`. Anyone with access to your browser profile can read them.
- Do not use production keys. Create restricted, low-limit test keys for the providers you try.
- You can remove a key at any time with its Delete button, or clear everything the app stores by clearing site data in your browser.
