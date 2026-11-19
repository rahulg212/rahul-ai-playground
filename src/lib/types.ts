/**
 * Shared TypeScript types for the API Playground.
 *
 * The app keeps ONE internal message format and uses "provider adapters"
 * (see src/lib/providerAdapters) to translate to/from each provider's
 * request/response shape.
 */

/** All providers supported by the playground. */
export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

/** Roles in the internal message format (system prompt is stored separately). */
export type Role = 'user' | 'assistant';

/** Token usage reported by a provider (all fields optional). */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Grade buckets for the response quality score (G0DM0D3-inspired). */
export type QualityGrade = 'elite' | 'strong' | 'decent' | 'weak' | 'poor';

export interface QualityBreakdownItem {
  label: string;
  /** 0-100. */
  score: number;
  /** One-line human explanation of the sub-score. */
  hint: string;
}

/**
 * Client-side heuristic quality score for an assistant response — inspired by
 * G0DM0D3's "Tastemaker" score. Purely informational: it helps the user see
 * WHICH answers deserve a "Refine" or a "Race" against another model.
 */
export interface QualityScore {
  /** 0-100 overall. */
  overall: number;
  grade: QualityGrade;
  breakdown: QualityBreakdownItem[];
}

/** One model entry in a Race (parallel multi-model arena). */
export interface RaceCandidate {
  provider: ProviderId;
  model: string;
  text: string;
  reasoning?: string;
  responseTimeMs?: number;
  usage?: TokenUsage;
  /** Set when this candidate failed (e.g. no key / provider error). */
  error?: string;
  score?: number;
}

/** A stored revision of an assistant answer created by "Refine" (liquid mode). */
export interface LiquidVersion {
  content: string;
  reasoning?: string;
  score?: number;
  responseTimeMs?: number;
  usage?: TokenUsage;
  createdAt: number;
}

/** Provenance info attached to assistant messages. */
export interface AssistantMeta {
  provider: ProviderId;
  model: string;
  responseTimeMs?: number;
  usage?: TokenUsage;
  /** Set when the response was cut short (user stop or API error). */
  stopped?: boolean;
  error?: string;
  /** Heuristic quality score computed when the response completed. */
  quality?: QualityScore;
  /**
   * Race result: every candidate that competed for this answer. The message
   * content/usage shown in the UI come from the ACTIVE candidate (which is the
   * auto-picked winner until the user flips the navigator).
   */
  race?: {
    candidates: RaceCandidate[];
    activeIndex: number;
  };
}

/** A single chat message in the internal format. */
export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /**
   * Chain-of-thought / "thinking" text that reasoning models stream BEFORE the
   * final answer (e.g. every current OpenRouter ":free" model). Stored so it
   * can be shown in a collapsible block; never sent back to the provider.
   */
  reasoning?: string;
  meta?: AssistantMeta;
  /**
   * "Refine" (liquid) history — version 0 is the answer as originally
   * generated, later versions are improvements requested by the user.
   * Present once the user has refined this answer at least once.
   */
  liquid?: {
    versions: LiquidVersion[];
    activeIndex: number;
  };
}

/** Sampling / generation parameters. */
export interface GenerationSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  /** Parsed from a "one per line" textarea in the UI. */
  stopSequences: string[];
}

/** A saved conversation. Each conversation remembers its own configuration. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  settings: GenerationSettings;
  /** 0 = send the entire history, N > 0 = only the last N messages. */
  contextLimit: number;
}

/** A named system-prompt preset. */
export interface Preset {
  id: string;
  name: string;
  prompt: string;
}

/** Global app settings (persisted to localStorage). */
export interface AppSettings {
  apiKeys: Record<ProviderId, string>;
  showRawPanel: boolean;
  customProxyUrl?: string;
  soundEnabled?: boolean;
}

/** A model picked as a Race competitor (provider + raw model id). */
export interface RaceSpec {
  provider: ProviderId;
  model: string;
}

/** Persisted Race configuration. */
export interface RaceConfig {
  enabled: boolean;
  models: RaceSpec[];
}

/** A model entry returned by a provider's models endpoint. */
export interface ModelInfo {
  id: string;
  label?: string;
  /** True when the model costs nothing (OpenRouter ":free" / zero pricing). */
  free?: boolean;
  /** Advertised context window in tokens, when the provider reports one. */
  contextLength?: number;
  /** Approximate USD cost per 1M tokens, when the provider reports pricing. */
  costPerMillion?: { input: number; output: number };
}

/** Result of a "Test Key" call. */
export interface TestKeyResult {
  ok: boolean;
  message: string;
}

/** Which generation settings a provider supports (used to disable UI inputs). */
export interface ProviderCapabilities {
  temperature: boolean;
  maxTokens: boolean;
  topP: boolean;
  stopSequences: boolean;
}

/**
 * An optional recovery action attached to a chat error, e.g. "Retry with a
 * free model" when an OpenRouter key has no credits for a paid model. Rendered
 * as a button inside the error banner.
 */
export interface ChatErrorAction {
  label: string;
  run: () => Promise<void> | void;
}

/** Content of the toggleable Raw / debug panel. */
export interface RawDebug {
  request: string;
  response: string;
  status?: number;
  responseTimeMs?: number;
}

/** Error classification used for clear, actionable messages. */
export type ErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'bad_request'
  | 'server'
  | 'cors'
  | 'network'
  | 'abort'
  | 'unknown';

export class PlaygroundError extends Error {
  status?: number;
  kind: ErrorKind;
  details?: string;
  /** The masked request JSON that produced this error (for the Raw panel). */
  rawRequest?: string;

  constructor(message: string, kind: ErrorKind = 'unknown', status?: number, details?: string) {
    super(message);
    this.name = 'PlaygroundError';
    this.kind = kind;
    if (status !== undefined) this.status = status;
    if (details !== undefined) this.details = details;
  }
}

/** Arguments passed to an adapter to build a chat request. */
export interface BuildChatRequestArgs {
  apiKey: string;
  model: string;
  systemPrompt: string;
  /** Already context-limited user/assistant history (no system message). */
  history: ChatMessage[];
  settings: GenerationSettings;
}

/** The exact request an adapter produces for its provider. */
export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Outcome of a completed streaming chat request. */
export interface StreamOutcome {
  text: string;
  /** Accumulated thinking text (reasoning models only). */
  reasoning?: string;
  usage?: TokenUsage;
  responseTimeMs: number;
  /** Pretty-printed request JSON with the API key masked. */
  rawRequest: string;
  /** Concatenated raw response chunks (pretty JSON, newline separated). */
  rawResponse: string;
  status: number;
}

/**
 * The adapter contract. One implementation per provider; see
 * src/lib/providerAdapters for concrete implementations and comments.
 */
export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  defaultModel: string;
  capabilities: ProviderCapabilities;
  /** Fetch the list of models using the saved key. */
  fetchModels(apiKey: string): Promise<ModelInfo[]>;
  /** Quick key validation against a cheap endpoint. */
  testKey(apiKey: string): Promise<TestKeyResult>;
  /** Translate internal format into this provider's HTTP request. */
  buildChatRequest(args: BuildChatRequestArgs): BuiltRequest;
  /** Pull the text delta out of one streamed JSON payload (or null). */
  extractDelta(json: unknown): string | null;
  /**
   * Optional: pull the "thinking" delta out of one streamed JSON payload.
   * Reasoning models emit chain-of-thought before the answer; without this
   * hook the user would stare at an empty bubble for a long time.
   */
  extractReasoningDelta?(json: unknown): string | null;
  /** Pull partial token usage out of one streamed JSON payload (or null). */
  extractUsage(json: unknown): Partial<TokenUsage> | null;
  /** Optional: return true when this SSE payload ends the stream. */
  isFinalPayload?(payload: string): boolean;
}
