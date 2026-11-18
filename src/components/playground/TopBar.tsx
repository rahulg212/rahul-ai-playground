'use client';

/**
 * Top bar: panel toggles, conversation title, provider/model summary,
 * approximate token counter, persona quick-switcher (G0DM0D3 mode-switcher
 * style), raw-panel toggle and the 3-way theme switch (light/dark/terminal).
 */
import React from 'react';
import {
  Check,
  ChevronDown,
  Coins,
  Menu,
  Moon,
  PanelLeft,
  PanelRight,
  Sun,
  Terminal,
  TerminalSquare,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { usePlayground } from '@/components/playground/context';
import { ModelPicker } from '@/components/playground/ModelPicker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PERSONAS, matchPersona } from '@/lib/personas';
import { cn } from '@/lib/utils';

const THEME_ORDER = ['light', 'dark', 'terminal'] as const;

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The whole app is client-side only (dynamic ssr:false), so resolvedTheme
  // is available right after mount without a mounted-state dance.
  const current = THEME_ORDER.includes(resolvedTheme as (typeof THEME_ORDER)[number])
    ? (resolvedTheme as (typeof THEME_ORDER)[number])
    : 'light';
  const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];

  const meta: Record<(typeof THEME_ORDER)[number], { label: string; icon: React.ReactNode }> = {
    light: { label: 'Light mode — click for dark', icon: <Sun className="h-4 w-4" /> },
    dark: { label: 'Dark mode — click for terminal', icon: <Moon className="h-4 w-4" /> },
    terminal: { label: 'Terminal mode (G0DM0D3) — click for light', icon: <Terminal className="h-4 w-4" /> },
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(next)}
      aria-label={meta[current].label}
      title={meta[current].label}
    >
      {meta[current].icon}
    </Button>
  );
}

/**
 * Persona quick-switcher: applies a curated system prompt (+ recommended
 * temperature) to the active conversation in one click — the everyday shortcut
 * version of the full preset editor in the settings panel.
 */
function PersonaSwitcher() {
  const { activeConversation, setSystemPrompt, setGenerationSettings } = usePlayground();
  const currentPersona = activeConversation ? matchPersona(activeConversation.systemPrompt) : null;

  const applyPersona = (personaId: string) => {
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) return;
    setSystemPrompt(persona.prompt);
    if (persona.temperature !== undefined) setGenerationSettings({ temperature: persona.temperature });
    toast.success(`Persona: ${persona.name}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground md:inline-flex"
          title="Persona — one-click system prompt presets"
          aria-label="Switch persona"
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full bg-gradient-to-br',
              currentPersona?.gradient ?? 'from-foreground/60 to-foreground/30',
            )}
          />
          <span className="max-w-[110px] truncate">{currentPersona?.name ?? 'Custom'}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Persona</DropdownMenuLabel>
        {PERSONAS.map((persona) => {
          const active = currentPersona?.id === persona.id;
          return (
            <DropdownMenuItem key={persona.id} onClick={() => applyPersona(persona.id)} className="gap-2.5">
              <span
                className={cn('h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br', persona.gradient)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{persona.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{persona.description}</span>
              </span>
              {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatTokens(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function TopBar() {
  const {
    activeConversation,
    sidebarOpen,
    toggleSidebar,
    settingsOpen,
    toggleSettings,
    setMobileDrawer,
    showRawPanel,
    setShowRawPanel,
    nextRequestTokens,
  } = usePlayground();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
      {/* Sidebar toggles */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden h-8 w-8 lg:inline-flex"
        onClick={toggleSidebar}
        aria-label="Toggle chat sidebar"
        title="Toggle chat sidebar"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 lg:hidden"
        onClick={() => setMobileDrawer('sidebar')}
        aria-label="Open chat list"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Title + BYOK-standard header model picker */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="hidden truncate text-sm font-semibold md:block">
          {activeConversation?.title ?? 'API Playground'}
        </h1>
        <ModelPicker />
      </div>

      {/* Right side actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* G0DM0D3-style quick persona switcher. */}
        <PersonaSwitcher />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          title="Approximate tokens sent with the next request"
        >
          <Coins className="h-3.5 w-3.5" />
          <span className="tabular-nums">≈ {formatTokens(nextRequestTokens)} tok</span>
        </Button>
        <Button
          variant={showRawPanel ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowRawPanel(!showRawPanel)}
          aria-label="Toggle raw request/response panel"
          title="Raw request/response"
        >
          <TerminalSquare className="h-4 w-4" />
        </Button>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:hidden"
          onClick={() => setMobileDrawer('settings')}
          aria-label="Open settings"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-8 w-8 lg:inline-flex"
          onClick={toggleSettings}
          aria-label="Toggle settings panel"
          title="Toggle settings panel"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
