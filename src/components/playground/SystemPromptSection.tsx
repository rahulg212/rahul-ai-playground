'use client';

/**
 * System prompt editor with named presets: edit the prompt, save it as a
 * preset, load / rename / delete presets.
 */
import React, { useState } from 'react';
import { BookMarked, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function SystemPromptSection() {
  const {
    activeConversation,
    setSystemPrompt,
    presets,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
  } = usePlayground();

  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetName, setPresetName] = useState('');
  const prompt = activeConversation?.systemPrompt ?? '';

  /** Selecting a preset loads its name so Rename/Delete operate on it. */
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = presets.find((p) => p.id === id);
    setPresetName(preset ? preset.name : '');
  };

  return (
    <SettingsSection title="System Prompt" icon={BookMarked}>
      <Textarea
        value={prompt}
        onChange={(event) => setSystemPrompt(event.target.value)}
        placeholder="e.g. You are a concise technical assistant. Always answer with code examples…"
        className="scrollbar-thin min-h-[110px] resize-y font-mono text-xs"
        aria-label="System prompt"
      />

      {/* Load an existing preset */}
      <div className="flex items-center gap-1.5">
        <Select value={selectedPresetId} onValueChange={handleSelectPreset}>
          <SelectTrigger className="h-9 flex-1" aria-label="Preset to load">
            <SelectValue placeholder="Presets…" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={() => applyPreset(selectedPresetId)}
          disabled={!selectedPresetId}
          title="Apply this preset to the editor"
        >
          Load
        </Button>
      </div>

      {/* Save / rename / delete */}
      <div className="flex items-center gap-1.5">
        <Input
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          placeholder="Preset name…"
          className="h-9 flex-1 text-xs"
          aria-label="Preset name"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => savePreset(presetName, prompt)}
          disabled={!prompt.trim() || !presetName.trim()}
          title="Save current prompt as preset"
          aria-label="Save preset"
        >
          <Save className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => renamePreset(selectedPresetId, presetName)}
          disabled={!selectedPresetId || !presetName.trim()}
          title="Rename selected preset"
          aria-label="Rename preset"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => {
            deletePreset(selectedPresetId);
            setSelectedPresetId('');
          }}
          disabled={!selectedPresetId}
          title="Delete selected preset"
          aria-label="Delete preset"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <RotateCcw className="h-3 w-3" />
        Saving a preset with an existing name overwrites it.
      </p>
    </SettingsSection>
  );
}
