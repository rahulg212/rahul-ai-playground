'use client';

/**
 * Right-hand settings panel: provider/key management, model selection,
 * system prompt editor with presets, generation settings, context limits,
 * raw-panel toggle and import/export. Fixed column on desktop, overlay
 * drawer on mobile.
 */
import React from 'react';
import { Bug, Globe, Volume2, X } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { ApiKeySection } from '@/components/playground/ApiKeySection';
import { ContextSection } from '@/components/playground/ContextSection';
import { DataSection } from '@/components/playground/DataSection';
import { GenerationSection } from '@/components/playground/GenerationSection';
import { ModelSection } from '@/components/playground/ModelSection';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { SystemPromptSection } from '@/components/playground/SystemPromptSection';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Connection and Audio settings */
function ConnectionSection() {
  const { customProxyUrl, setCustomProxyUrl, soundEnabled, setSoundEnabled } = usePlayground();

  return (
    <SettingsSection title="Connection & Audio" icon={Globe}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-normal">Browser Direct Streaming</Label>
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            Active · Zero Backend
          </Badge>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Requests stream directly from your browser to Gemini, OpenRouter, and Claude. No intermediary server needed.
        </p>

        <div className="flex items-center justify-between pt-1">
          <Label htmlFor="sound-toggle" className="text-xs font-normal flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            Sound effects (Chimes &amp; Blips)
          </Label>
          <Switch
            id="sound-toggle"
            checked={soundEnabled}
            onCheckedChange={setSoundEnabled}
            aria-label="Toggle sound effects"
          />
        </div>

        <div className="space-y-1.5 pt-1 border-t">
          <Label htmlFor="custom-proxy" className="text-xs font-normal">
            Custom CORS Proxy (Optional)
          </Label>
          <Input
            id="custom-proxy"
            value={customProxyUrl}
            onChange={(e) => setCustomProxyUrl(e.target.value)}
            placeholder="e.g. https://corsproxy.io/?url="
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Leave blank for direct browser calls. For direct OpenAI keys without OpenRouter, you can specify a CORS proxy here.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

/** Raw/debug toggle lives in its own mini section. */
function DebugSection() {
  const { showRawPanel, setShowRawPanel } = usePlayground();
  return (
    <SettingsSection title="Developer Tools" icon={Bug}>
      <div className="flex items-center justify-between">
        <Label htmlFor="raw-panel-toggle" className="text-xs font-normal">
          Show raw request &amp; response panel
        </Label>
        <Switch
          id="raw-panel-toggle"
          checked={showRawPanel}
          onCheckedChange={setShowRawPanel}
          aria-label="Toggle raw debug panel"
        />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Shows the exact JSON request (API key masked) and every raw streamed response chunk.
      </p>
    </SettingsSection>
  );
}

/** Shared panel content for desktop column and mobile drawer. */
function SettingsContent() {
  const { setMobileDrawer, mobileDrawer } = usePlayground();
  const isDrawer = mobileDrawer === 'settings';
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Settings</span>
        <span className="text-[11px] text-muted-foreground">stored locally in your browser</span>
        {isDrawer && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 h-8 w-8"
            onClick={() => setMobileDrawer(null)}
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4">
        <ApiKeySection />
        <ModelSection />
        <SystemPromptSection />
        <GenerationSection />
        <ContextSection />
        <ConnectionSection />
        <DebugSection />
        <DataSection />
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { settingsOpen, mobileDrawer, setMobileDrawer } = usePlayground();

  const closeDrawer = () => setMobileDrawer(null);

  return (
    <>
      {/* Desktop column */}
      <aside
        className={cn(
          'hidden w-[340px] shrink-0 border-l bg-background 2xl:w-[380px] lg:flex lg:flex-col',
          !settingsOpen && 'lg:hidden',
        )}
      >
        <SettingsContent />
      </aside>

      {/* Mobile drawer */}
      {mobileDrawer === 'settings' && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Settings">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l bg-background shadow-xl">
            <SettingsContent />
          </div>
        </div>
      )}
    </>
  );
}
