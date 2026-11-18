'use client';

/**
 * Context settings: how much conversation history is sent with each request
 * (all messages, or only the last N), plus a live token estimate.
 */
import React from 'react';
import { Coins, Layers } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const LIMIT_OPTIONS = [0, 4, 8, 12, 20, 40] as const;

export function ContextSection() {
  const { activeConversation, setContextLimit, nextRequestTokens } = usePlayground();
  const limit = activeConversation?.contextLimit ?? 0;

  return (
    <SettingsSection title="Context" icon={Layers}>
      <div className="space-y-1.5">
        <Label htmlFor="context-limit">History sent per request</Label>
        <Select
          value={String(limit)}
          onValueChange={(value) => setContextLimit(Number(value))}
        >
          <SelectTrigger id="context-limit" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIMIT_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option === 0 ? 'All messages' : `Last ${option} messages`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Coins className="h-3 w-3" />
        ≈ {nextRequestTokens} tokens will be sent with the next request (approximate: ~4 chars/token).
      </p>
    </SettingsSection>
  );
}
