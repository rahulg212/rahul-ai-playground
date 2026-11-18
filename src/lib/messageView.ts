/**
 * Display resolution for assistant messages that carry Race candidates or
 * Refine (liquid) versions.
 *
 * The stored message keeps its ORIGINAL content; the UI (and the Refine base
 * text) always render through resolveMessageView() so that flipping the race
 * navigator or a liquid version selector changes what is displayed without
 * mutating history.
 */
import type { ChatMessage, TokenUsage } from '@/lib/types';

export interface ResolvedMessageView {
  content: string;
  reasoning?: string;
  /** Quality score of the currently displayed revision (if computed). */
  score?: number;
  model?: string;
  responseTimeMs?: number;
  usage?: TokenUsage;
  /** Set when the view resolves to a liquid (refine) version. */
  liquidIndex?: number;
  /** Set when the view resolves to a race candidate. */
  raceIndex?: number;
  /** Error of the displayed race candidate, if any. */
  error?: string;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function resolveMessageView(message: ChatMessage): ResolvedMessageView {
  const meta = message.meta;

  // Refine versions take precedence: they refine whatever was displayed.
  if (message.liquid && message.liquid.versions.length > 0) {
    const index = clampIndex(message.liquid.activeIndex, message.liquid.versions.length);
    const version = message.liquid.versions[index];
    return {
      content: version.content,
      reasoning: version.reasoning ?? message.reasoning,
      score: version.score ?? meta?.quality?.overall,
      model: meta?.model,
      responseTimeMs: version.responseTimeMs ?? meta?.responseTimeMs,
      usage: version.usage ?? meta?.usage,
      liquidIndex: index,
    };
  }

  // Race result: display the active candidate (auto-picked winner by default).
  if (meta?.race && meta.race.candidates.length > 0) {
    const index = clampIndex(meta.race.activeIndex, meta.race.candidates.length);
    const candidate = meta.race.candidates[index];
    return {
      content: candidate.text,
      reasoning: candidate.reasoning ?? message.reasoning,
      score: candidate.score ?? meta.quality?.overall,
      model: candidate.model,
      responseTimeMs: candidate.responseTimeMs,
      usage: candidate.usage,
      raceIndex: index,
      error: candidate.error,
    };
  }

  return {
    content: message.content,
    reasoning: message.reasoning,
    score: meta?.quality?.overall,
    model: meta?.model,
    responseTimeMs: meta?.responseTimeMs,
    usage: meta?.usage,
  };
}

/** The winner index of a race (highest score among candidates that produced text). */
export function raceWinnerIndex(message: ChatMessage): number | null {
  const race = message.meta?.race;
  if (!race || race.candidates.length === 0) return null;
  let best = -1;
  let bestScore = -Infinity;
  race.candidates.forEach((candidate, index) => {
    if (!candidate.text.trim()) return;
    const score = candidate.score ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best >= 0 ? best : null;
}
