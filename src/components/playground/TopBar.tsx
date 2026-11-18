'use client';

/**
 * Top bar: panel toggles, conversation title, provider/model summary,
 * approximate token counter, raw-panel toggle and the theme switch.
 */
import React from 'react';
import { Coins, Menu, Moon, PanelLeft, PanelRight, Sun, TerminalSquare } from 'lucide-react';
import { useTheme } from 'next-themes';
import { usePlayground } from '@/components/playground/context';
import { ModelPicker } from '@/components/playground/ModelPicker';
import { Button } from '@/components/ui/button';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The whole app is client-side only (dynamic ssr:false), so resolvedTheme
  // is available right after mount without a mounted-state dance.
  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
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
