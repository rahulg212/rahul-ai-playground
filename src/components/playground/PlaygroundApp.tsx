'use client';

/**
 * API Playground — application shell.
 *
 * Layout: left sidebar (chats) | center (chat) | right settings panel.
 * Both side panels collapse on desktop and become overlay drawers on mobile.
 * The whole app is client-side: API keys, chats and settings live in
 * localStorage and every request goes straight from the browser to the
 * provider through the adapter layer (src/lib/providerAdapters).
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { PlaygroundProvider, usePlayground } from '@/components/playground/context';
import { ChatArea } from '@/components/playground/ChatArea';
import { Sidebar } from '@/components/playground/Sidebar';
import { SettingsPanel } from '@/components/playground/SettingsPanel';
import { TopBar } from '@/components/playground/TopBar';

/** Placeholder while localStorage state hydrates. */
function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading API Playground…
      </div>
    </div>
  );
}

function PlaygroundShell() {
  const { ready } = usePlayground();
  if (!ready) return <Splash />;
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ChatArea />
      </main>
      <SettingsPanel />
    </div>
  );
}

export default function PlaygroundApp() {
  return (
    <PlaygroundProvider>
      <PlaygroundShell />
    </PlaygroundProvider>
  );
}
