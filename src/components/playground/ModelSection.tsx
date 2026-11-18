'use client';

/**
 * Model selection: a searchable dropdown fed by the provider's models
 * endpoint, plus free-text entry for custom model IDs.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Check, ChevronDown, Loader2, RefreshCw, Search, XCircle, Zap } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { getAdapter } from '@/lib/providerAdapters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** OpenRouter marks free-to-use models with a ":free" id suffix. */
function isFreeModel(id: string): boolean {
  return id.endsWith(':free');
}

export function ModelSection() {
  const {
    activeConversation,
    setModel,
    models,
    loadModels,
    settings,
  } = usePlayground();

  const provider = activeConversation?.provider ?? 'openai';
  const model = activeConversation?.model ?? '';
  const adapter = getAdapter(provider);
  const state = models[provider];

  const [open, setOpen] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset the free filter when switching providers (it is an OpenRouter concept).
  // Adjust-state-during-render pattern (avoids a cascading-render effect).
  const [prevProvider, setPrevProvider] = useState(provider);
  if (prevProvider !== provider) {
    setPrevProvider(provider);
    setFreeOnly(false);
  }

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Auto-load the model list when a key becomes available.
  useEffect(() => {
    if (settings.apiKeys[provider] || provider === 'openrouter') {
      void loadModels(provider);
    }
  }, [provider, settings.apiKeys[provider], loadModels]);

  const hasFreeModels = useMemo(
    () => state.models.some((m) => isFreeModel(m.id)),
    [state.models],
  );

  const filtered = useMemo(() => {
    const q = model.trim().toLowerCase();
    let list = state.models;
    if (freeOnly) list = list.filter((m) => isFreeModel(m.id));
    if (!q) return list;
    return list.filter(
      (m) => m.id.toLowerCase().includes(q) || (m.label ?? '').toLowerCase().includes(q),
    );
  }, [state.models, model, freeOnly]);

  const commit = (value: string) => {
    setModel(value.trim());
    setOpen(false);
  };

  return (
    <SettingsSection title="Model" icon={Boxes}>
      <div className="space-y-1.5">
        <Label htmlFor="model-input">Model ID</Label>
        <div className="relative" ref={containerRef}>
          <Input
            id="model-input"
            value={model}
            onChange={(event) => {
              setModel(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder={adapter.defaultModel}
            className="h-9 font-mono text-xs"
            autoComplete="off"
            aria-label="Model ID (type to search or enter a custom ID)"
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Show model list"
            aria-expanded={open}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>

          {/* Searchable dropdown */}
          {open && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
              <div className="flex items-center gap-2 border-b px-2.5 py-1.5 text-xs text-muted-foreground">
                <Search className="h-3 w-3" />
                {state.loading
                  ? 'Loading models…'
                  : `${filtered.length} of ${freeOnly ? state.models.filter((m) => isFreeModel(m.id)).length : state.models.length} models`}
              </div>
              <div className="scrollbar-thin max-h-56 overflow-y-auto">
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
                    No matches. Press Escape and use your custom model ID as-is.
                  </div>
                ) : (
                  <ul className="py-1" role="listbox" aria-label="Available models">
                    {filtered.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent',
                            m.id === model && 'bg-accent/60',
                          )}
                          onClick={() => commit(m.id)}
                          role="option"
                          aria-selected={m.id === model}
                        >
                          {m.id === model && <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="break-all font-mono">{m.id}</span>
                              {isFreeModel(m.id) && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                  <Zap className="h-2.5 w-2.5" /> Free
                                </span>
                              )}
                            </span>
                            {m.label && m.label !== m.id && (
                              <span className="block truncate text-[11px] text-muted-foreground">{m.label}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Type to filter, or enter any custom model ID.
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {hasFreeModels && (
              <Button
                variant={freeOnly ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-7 gap-1.5 text-xs', !freeOnly && 'text-muted-foreground')}
                onClick={() => setFreeOnly((v) => !v)}
                aria-pressed={freeOnly}
                title="Show only free-to-use models (IDs ending in ':free')"
              >
                <Zap className="h-3 w-3" />
                Free only
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void loadModels(provider, true)}
              disabled={state.loading}
            >
              <RefreshCw className={cn('h-3 w-3', state.loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
