'use client';

/**
 * Provider picker + API key manager: select the active provider, save a
 * per-provider key (password field with show/hide), test it, and delete it.
 */
import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { listProviders } from '@/lib/providerAdapters';
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
import { cn } from '@/lib/utils';
import type { ProviderId } from '@/lib/types';

export function ApiKeySection() {
  const {
    activeConversation,
    setProvider,
    settings,
    saveApiKey,
    removeApiKey,
    testApiKey,
    testingKey,
    keyTestResults,
  } = usePlayground();

  const [draftKey, setDraftKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const provider = activeConversation?.provider ?? 'openai';
  const savedKey = settings.apiKeys[provider];
  const testResult = keyTestResults[provider];
  const testing = testingKey === provider;

  const handleSave = () => {
    const trimmed = draftKey.trim();
    if (!trimmed) return;
    saveApiKey(provider, trimmed);
    setDraftKey('');
  };

  return (
    <SettingsSection title="Provider & API Key" icon={PlugZap}>
      {/* Provider picker */}
      <div className="space-y-1.5">
        <Label htmlFor="provider-select">Provider</Label>
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value as ProviderId)}
        >
          <SelectTrigger id="provider-select" className="w-full">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            {listProviders().map((adapter) => (
              <SelectItem key={adapter.id} value={adapter.id}>
                {adapter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* API key input */}
      <div className="space-y-1.5">
        <Label htmlFor="api-key-input">API key</Label>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              id="api-key-input"
              type={showKey ? 'text' : 'password'}
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSave();
              }}
              placeholder={savedKey ? '•••••••••••• (a key is saved)' : 'sk-…'}
              autoComplete="off"
              className="h-9 pr-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button size="sm" className="h-9" onClick={handleSave} disabled={!draftKey.trim()}>
            Save
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1"
            onClick={() => void testApiKey(provider)}
            disabled={testing || !savedKey}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Test Key
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeApiKey(provider)}
            disabled={!savedKey}
            title="Delete the saved key"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete key
          </Button>
        </div>

        {/* Test result */}
        {testResult && (
          <p
            className={cn(
              'flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs leading-relaxed',
              testResult.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
            role="status"
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            {testResult.message}
          </p>
        )}
      </div>

      {/* Localstorage warning */}
      <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        API keys are stored in your browser&apos;s localStorage and sent directly from your browser to
        the provider. This app is meant for personal and local testing only — never use work keys.
      </p>
    </SettingsSection>
  );
}
