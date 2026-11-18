'use client';

/**
 * Reusable model picker pieces, shared by the chat-header picker and the
 * settings-panel Model section. Follows the pattern used by LobeChat /
 * ChatBox / LibreChat: a searchable list with provider metadata badges
 * (free / context length / cost) and a "free only" filter for OpenRouter.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, RefreshCw, Search, XCircle, Zap } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ModelInfo, ProviderId } from '@/lib/types';

/** "1050000" -> "1.1M", "131072" -> "131k" — compact context-window display. */
export function formatContextLength(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/** "$3/$15" style compact USD-per-1M-tokens display. */
function formatCost(cost: NonNullable<ModelInfo['costPerMillion']>): string {
  const fmt = (v: number) => (v === 0 ? '0' : `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`);
  return `${fmt(cost.input)}/${fmt(cost.output)} per 1M`;
}

/**
 * One row in a model list. Kept as its own component so both the header
 * popover and the settings panel render identical entries.
 */
export function ModelRow({
  info,
  selected,
  onSelect,
}: {
  info: ModelInfo;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent',
        selected && 'bg-accent/60',
      )}
      onClick={() => onSelect(info.id)}
      role="option"
      aria-selected={selected}
    >
      {selected && <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="break-all font-mono">{info.id}</span>
          {info.free && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <Zap className="h-2.5 w-2.5" /> Free
            </span>
          )}
          {info.contextLength !== undefined && (
            <span
              className="inline-flex shrink-0 items-center rounded border px-1 text-[10px] text-muted-foreground"
              title="Context window"
            >
              {formatContextLength(info.contextLength)}
            </span>
          )}
          {!info.free && info.costPerMillion && (
            <span
              className="inline-flex shrink-0 items-center rounded border px-1 text-[10px] text-muted-foreground"
              title="Approximate USD per 1M tokens (input/output)"
            >
              {formatCost(info.costPerMillion)}
            </span>
          )}
        </span>
        {info.label && info.label !== info.id && (
          <span className="block truncate text-[11px] text-muted-foreground">{info.label}</span>
        )}
      </span>
    </button>
  );
}

/** Shared dropdown body: search, metadata, loading/error/empty states. */
export function ModelListBody({
  provider,
  model,
  onSelect,
  maxHeight = 'max-h-72',
}: {
  provider: ProviderId;
  model: string;
  onSelect: (id: string) => void;
  maxHeight?: string;
}) {
  const { models, loadModels } = usePlayground();
  const state = models[provider];

  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);

  const hasFreeModels = useMemo(
    () => state.models.some((m) => m.free),
    [state.models],
  );

  const filtered = useMemo(() => {
    let list = state.models;
    if (freeOnly) list = list.filter((m) => m.free);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) => m.id.toLowerCase().includes(q) || (m.label ?? '').toLowerCase().includes(q),
    );
  }, [state.models, query, freeOnly]);

  return (
    <>
      {/* Search + actions */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          // Native input (not shadcn Input) keeps the popover lightweight.
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models…"
          aria-label="Search models"
          className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        {hasFreeModels && (
          <Button
            variant={freeOnly ? 'default' : 'ghost'}
            size="sm"
            className={cn('h-6 shrink-0 gap-1 rounded-full px-2 text-[11px]', !freeOnly && 'text-muted-foreground')}
            onClick={() => setFreeOnly((v) => !v)}
            aria-pressed={freeOnly}
            title="Show only free-to-use models"
          >
            <Zap className="h-3 w-3" /> Free
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => void loadModels(provider, true)}
          disabled={state.loading}
          aria-label="Refresh model list"
          title="Refresh model list"
        >
          <RefreshCw className={cn('h-3 w-3', state.loading && 'animate-spin')} />
        </Button>
      </div>

      {/* List */}
      <div className={cn('scrollbar-thin overflow-y-auto', maxHeight)}>
        {state.loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching model list…
          </div>
        ) : state.error ? (
          <div className="flex items-start gap-1.5 px-2.5 py-3 text-xs text-destructive">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{state.error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2.5 py-3 text-xs text-muted-foreground">
            No models match. You can still type any custom model ID.
          </div>
        ) : (
          <ul className="py-1" role="listbox" aria-label="Available models">
            {filtered.map((m) => (
              <li key={m.id}>
                <ModelRow info={m} selected={m.id === model} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Count footer */}
      {!state.loading && !state.error && state.models.length > 0 && (
        <div className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {filtered.length} of {state.models.length} models
          {hasFreeModels ? ` · ${state.models.filter((m) => m.free).length} free` : ''}
        </div>
      )}
    </>
  );
}

/** Compact header-bar picker: a button that opens the searchable model popover. */
export function ModelPicker() {
  const { activeConversation, setModel, setMobileDrawer } = usePlayground();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const provider = activeConversation?.provider ?? 'openai';
  const model = activeConversation?.model ?? '';
  const adapterLabel = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Claude' : 'OpenRouter';

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const commit = (id: string) => {
    setModel(id.trim());
    setOpen(false);
    setMobileDrawer(null);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 max-w-[46vw] items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent sm:max-w-none',
          open && 'border-primary/50',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch model"
      >
        <span className="shrink-0 text-muted-foreground">{adapterLabel}</span>
        <span className="min-w-0 truncate font-mono">{model || 'choose a model'}</span>
      </button>

      {open && (
        <div
          className="absolute left-0 z-40 mt-1 w-[340px] max-w-[90vw] overflow-hidden rounded-lg border bg-popover shadow-lg"
          role="listbox"
          aria-label="Model picker"
        >
          <ModelListBody provider={provider} model={model} onSelect={commit} />
        </div>
      )}
    </div>
  );
}
