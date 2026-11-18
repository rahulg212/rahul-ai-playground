/**
 * Response quality scoring — inspired by G0DM0D3's "Tastemaker" score.
 *
 * A pure, client-side heuristic pass over the finished answer. It is NOT a
 * judge model; it measures observable properties of the text:
 *
 *   structure    — headings / lists / code blocks / paragraphs (well-organised)
 *   completeness — answers the actual question (length & specificity vs query)
 *   directness   — leads with the answer instead of preamble and hedges
 *   richness     — concrete detail: numbers, examples, code, links
 *   speed        — latency & token-efficiency of the generation
 *
 * The score is informational: it tells the user which answers deserve a
 * "Refine" pass or a multi-model "Race". Every hint is actionable.
 */
import type { QualityBreakdownItem, QualityGrade, QualityScore, TokenUsage } from '@/lib/types';

const HEDGE_RE =
  /\b(?:i (?:cannot|can't|could not|won't|am unable to)|i'm sorry|i apologize|as an ai(?: language model)?|i should (?:mention|note)|it's important to note|it is important to note|please (?:note|be aware)|keep in mind|disclaimer|caveat|consult (?:a|your) (?:professional|lawyer|doctor))\b/gi;

const FILLER_RE =
  /\b(?:basically|essentially|fundamentally|obviously|clearly|simply put|in other words|that being said|needless to say)\b/gi;

const PREAMBLE_RE =
  /^\s*(?:sure|honestly|well|okay|ok|of course|certainly|great question|that's a great question|absolutely|certainly!)[,!.]?\s*/i;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/** Rough word count used across heuristics. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Signal richness: does the answer contain code, numbers, examples, links? */
function richnessSignals(text: string): number {
  let signals = 0;
  if (/```/.test(text)) signals += 2; // fenced code blocks
  if (/`[^`]+`/.test(text)) signals += 1; // inline code
  if (/\d+(?:\.\d+)?%|\b\d{4}\b|\b\d+\s*(?:ms|s|kb|mb|gb|tokens?|users?|items?|rows?)\b/i.test(text)) signals += 2;
  if (/(?:for example|for instance|e\.g\.|such as|here's an example)/i.test(text)) signals += 2;
  if (/https?:\/\//.test(text)) signals += 1;
  if (/^\s*(?:[-*•]|\d+[.)])\s+/m.test(text)) signals += 1; // lists
  if (/^#{1,6}\s+/m.test(text)) signals += 1; // headings
  return signals;
}

/** Detect a question type so the completeness heuristic can adapt. */
function classifyQuery(query: string): 'code' | 'factual' | 'list' | 'open' | 'smalltalk' {
  const q = query.toLowerCase();
  if (/(?:code|function|snippet|script|implement|bug|error|sql|regex|api call|component)/.test(q)) return 'code';
  if (/(?:compare|vs\.?|versus|pros and cons|trade-?offs?)/.test(q)) return 'list';
  if (/\?$/.test(q.trim()) && /^(?:what|who|when|where|which|how many|how much|is|are|does|did|can)\b/.test(q.trim()))
    return 'factual';
  if (/(?:list|steps|ways|ideas|examples|tips|best practices)/.test(q)) return 'list';
  if (wordCount(q) <= 3 && !/\?/.test(q)) return 'smalltalk';
  return 'open';
}

/** Expected answer length (words) given the query — used for completeness. */
function expectedWords(queryType: string, queryWords: number): number {
  switch (queryType) {
    case 'smalltalk':
      return 15;
    case 'factual':
      return 60;
    case 'code':
      return 120;
    case 'list':
      return Math.max(90, queryWords * 18);
    default:
      return Math.max(80, queryWords * 14);
  }
}

function gradeFor(overall: number): QualityGrade {
  if (overall >= 85) return 'elite';
  if (overall >= 70) return 'strong';
  if (overall >= 55) return 'decent';
  if (overall >= 40) return 'weak';
  return 'poor';
}

export const GRADE_META: Record<QualityGrade, { label: string; className: string }> = {
  elite: { label: 'ELITE', className: 'text-amber-400 border-amber-400/40 bg-amber-400/10' },
  strong: { label: 'STRONG', className: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10' },
  decent: { label: 'DECENT', className: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
  weak: { label: 'WEAK', className: 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10' },
  poor: { label: 'POOR', className: 'text-red-500 border-red-500/40 bg-red-500/10' },
};

/**
 * Score a completed assistant response. All heuristics are intentionally
 * conservative — a plain but correct one-liner to a small-talk prompt should
 * still score well (completeness adapts to the query type).
 */
export function scoreResponse(
  content: string,
  userQuery: string,
  responseTimeMs?: number,
  usage?: TokenUsage,
): QualityScore {
  const breakdown: QualityBreakdownItem[] = [];
  const text = content.trim();
  const words = wordCount(text);
  const queryWords = Math.max(1, wordCount(userQuery));
  const queryType = classifyQuery(userQuery);

  /* ---------- structure ---------- */
  const hasHeadings = /^#{1,6}\s+/m.test(text);
  const hasLists = /^\s*(?:[-*•]|\d+[.)])\s+/m.test(text);
  const hasCode = /```[\s\S]*```/.test(text);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  let structure = 40;
  if (words >= 120) {
    if (hasHeadings) structure += 22;
    if (hasLists) structure += 18;
    if (paragraphs >= 3) structure += 14;
    if (paragraphs === 1 && words > 220) structure -= 12; // wall of text
  } else {
    // Short answers do not need markdown scaffolding.
    structure += paragraphs >= 1 ? 18 : 0;
    structure += hasLists || hasHeadings ? 12 : 0;
  }
  // Code questions benefit from a code block.
  if (queryType === 'code' && hasCode) structure = clamp(structure + 14);
  breakdown.push({
    label: 'Structure',
    score: Math.round(clamp(structure)),
    hint: hasHeadings || hasLists || hasCode ? 'Uses markdown organisation' : paragraphs > 1 ? 'Multi-paragraph flow' : 'Plain paragraphs',
  });

  /* ---------- completeness ---------- */
  const expected = expectedWords(queryType, queryWords);
  const ratio = words / Math.max(1, expected);
  let completeness: number;
  if (queryType === 'smalltalk') {
    completeness = 72 + clamp(words, 0, 24); // short is fine, extra content OK
  } else if (ratio < 0.35) {
    completeness = 30 + ratio * 100; // clearly too thin
  } else if (ratio < 0.75) {
    completeness = 52 + (ratio - 0.35) * 60;
  } else if (ratio <= 2.2) {
    completeness = 88; // sweet spot
  } else {
    completeness = Math.max(58, 88 - (ratio - 2.2) * 22); // bloated / rambling
  }
  // Trailing cliffhangers ("...", unfinished sentences) hurt.
  if (/\.\.\.$|\bto be continued\b|\betc\.\s*\)?$/.test(text) && words > 40) completeness -= 10;
  breakdown.push({
    label: 'Completeness',
    score: Math.round(clamp(completeness)),
    hint: `${words} words${ratio > 2.2 ? ' (longer than the question needs)' : ratio < 0.5 && queryType !== 'smalltalk' ? ' (thin for this question)' : ''}`,
  });

  /* ---------- directness ---------- */
  const hedges = (text.match(HEDGE_RE) ?? []).length;
  const fillers = (text.match(FILLER_RE) ?? []).length;
  const preamble = PREAMBLE_RE.test(text) ? 1 : 0;
  const hedgeDensity = hedges / Math.max(1, words / 120);
  let directness = 92 - hedgeDensity * 14 - fillers * 5 - preamble * 6;
  if (/^(?:i'm sorry|i apologize)/i.test(text)) directness -= 10;
  breakdown.push({
    label: 'Directness',
    score: Math.round(clamp(directness)),
    hint: hedges === 0 && fillers === 0 ? 'No hedging or filler' : `${hedges} hedge${hedges === 1 ? '' : 's'}, ${fillers} filler${fillers === 1 ? '' : 's'}`,
  });

  /* ---------- richness ---------- */
  const signals = richnessSignals(text);
  // Smalltalk should NOT be rich; everything else rewards concrete detail.
  const richness = queryType === 'smalltalk' ? clamp(70 + signals * 6) : clamp(38 + signals * 11);
  breakdown.push({
    label: 'Richness',
    score: Math.round(richness),
    hint: signals === 0 ? 'No concrete examples or numbers' : `${signals} concrete signal${signals === 1 ? '' : 's'} (code/examples/numbers)`,
  });

  /* ---------- speed ---------- */
  let speed = 80;
  let speedHint = 'Latency not recorded';
  if (responseTimeMs !== undefined && responseTimeMs > 0) {
    const seconds = responseTimeMs / 1000;
    if (seconds <= 3) speed = 100;
    else if (seconds <= 8) speed = 88;
    else if (seconds <= 20) speed = 74;
    else if (seconds <= 45) speed = 58;
    else speed = 42;
    speedHint = `${seconds.toFixed(1)}s to generate`;
    const completionTokens = usage?.completionTokens;
    if (completionTokens && completionTokens > 0) {
      const tokensPerSecond = completionTokens / seconds;
      if (tokensPerSecond >= 60) speed = Math.max(speed, 96);
      else if (tokensPerSecond >= 30) speed = Math.max(speed, 84);
      else if (tokensPerSecond < 10) speed = Math.min(speed, 55);
      speedHint = `${seconds.toFixed(1)}s · ${Math.round(tokensPerSecond)} tok/s`;
    }
  }
  breakdown.push({
    label: 'Speed',
    score: Math.round(speed),
    hint: speedHint,
  });

  /* ---------- overall (weighted) ---------- */
  const overall = clamp(
    Math.round(
      structure * 0.2 +
        completeness * 0.3 +
        directness * 0.2 +
        richness * 0.15 +
        speed * 0.15,
    ),
  );

  return { overall, grade: gradeFor(overall), breakdown };
}
