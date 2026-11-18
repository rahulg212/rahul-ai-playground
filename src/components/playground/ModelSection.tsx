'use client';

/**
 * Model selection in the settings panel: free-text entry for custom model IDs
 * plus a searchable dropdown fed by the provider's models endpoint. The list
 * rendering is shared with the chat-header picker (see ModelPicker.tsx).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ChevronDown } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { ModelListBody, formatContextLength } from '@/components/playground/ModelPicker';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { getAdapter } from '@/lib/providerAdapters';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function ModelSection() {
  const {
    activeConversation,
    setModel,
    models,
  } = usePlayground();

  const provider = activeConversation?.provider ?? 'openai';
  const model = activeConversation?.model ?? '';
  const adapter = getAdapter(provider);
  const state = models[provider];

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Metadata (free / context length / cost) of the currently selected model,
  // when it is part of the fetched list — shown as a hint under the input.
  const selectedInfo = useMemo(
    () => state.models.find((m) => m.id === model),
    [state.models, model],
  );

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

          {/* Searchable dropdown (shared with the header picker) */}
          {open && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
              <ModelListBody provider={provider} model={model} onSelect={commit} maxHeight="max-h-56" />
            </div>
          )}
        </div>

        {/* Selected-model metadata, when known */}
        {selectedInfo && (selectedInfo.free || selectedInfo.contextLength || selectedInfo.costPerMillion) ? (
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {selectedInfo.free && <span className="font-medium text-emerald-600 dark:text-emerald-400">Free model</span>}
            {selectedInfo.contextLength !== undefined && (
              <span>· {formatContextLength(selectedInfo.contextLength)} context</span>
            )}
            {selectedInfo.costPerMillion && !selectedInfo.free && (
              <span>· ~${selectedInfo.costPerMillion.input}/${selectedInfo.costPerMillion.output} per 1M tokens</span>
            )}
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Type to filter, or enter any custom model ID.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
