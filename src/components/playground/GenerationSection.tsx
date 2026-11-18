'use client';

/**
 * Generation settings: temperature, max tokens, top_p and stop sequences.
 * Inputs that the selected provider does not support are disabled with a
 * note (all four built-in providers currently support everything, but the
 * capability flags keep this future-proof).
 */
import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { getAdapter } from '@/lib/providerAdapters';
import { defaultGenerationSettings } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';

/** Slider + number input pair for one numeric setting (module-level component). */
function NumericControl({
  label,
  value,
  min,
  max,
  step,
  enabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  enabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Input
          type="number"
          // Round away slider floating-point noise (0.699999988079071 -> 0.7).
          value={Number(value.toFixed(2))}
          min={min}
          max={max}
          step={step}
          disabled={!enabled}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) {
              onChange(Math.round(Math.min(max, Math.max(min, parsed)) * 100) / 100);
            }
          }}
          className="h-7 w-20 text-xs tabular-nums"
          aria-label={`${label} value`}
        />
      </div>
      <Slider
        value={[Number(value.toFixed(2))]}
        min={min}
        max={max}
        step={step}
        disabled={!enabled}
        onValueChange={([next]) => onChange(Math.round(next * 100) / 100)}
        aria-label={`${label} slider`}
      />
    </div>
  );
}

export function GenerationSection() {
  const { activeConversation, setGenerationSettings, resetGenerationSettings } = usePlayground();
  const provider = activeConversation?.provider ?? 'openai';
  const adapter = getAdapter(provider);
  const capabilities = adapter.capabilities;
  const settings = activeConversation?.settings ?? defaultGenerationSettings();

  return (
    <SettingsSection title="Generation Settings" icon={SlidersHorizontal}>
      <NumericControl
        label="Temperature"
        value={settings.temperature}
        min={0}
        max={2}
        step={0.1}
        enabled={capabilities.temperature}
        onChange={(temperature) => setGenerationSettings({ temperature })}
      />
      <NumericControl
        label="Max tokens"
        value={settings.maxTokens}
        min={1}
        max={8192}
        step={64}
        enabled={capabilities.maxTokens}
        onChange={(maxTokens) => setGenerationSettings({ maxTokens })}
      />
      <NumericControl
        label="Top P"
        value={settings.topP}
        min={0}
        max={1}
        step={0.05}
        enabled={capabilities.topP}
        onChange={(topP) => setGenerationSettings({ topP })}
      />

      {/* Stop sequences, one per line */}
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="stop-sequences">
          Stop sequences
        </Label>
        <Textarea
          id="stop-sequences"
          value={settings.stopSequences.join('\n')}
          disabled={!capabilities.stopSequences}
          onChange={(event) =>
            setGenerationSettings({
              stopSequences: event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0),
            })
          }
          placeholder={'One sequence per line, e.g.\nEND\n###'}
          className="min-h-[56px] resize-y font-mono text-xs"
        />
      </div>

      {!capabilities.temperature && (
        <p className="text-[11px] text-muted-foreground">
          Some settings are not supported by {adapter.label} and are disabled.
        </p>
      )}

      <Button variant="outline" size="sm" className="h-8 w-full" onClick={resetGenerationSettings}>
        <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
      </Button>
    </SettingsSection>
  );
}
