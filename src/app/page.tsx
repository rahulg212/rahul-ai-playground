'use client';

import dynamic from 'next/dynamic';

/**
 * API Playground page.
 *
 * The app shell is loaded client-side only (ssr: false): everything it
 * renders depends on localStorage (chats, keys, settings), so there is no
 * useful server-rendered markup and this avoids any hydration mismatch.
 */
const PlaygroundApp = dynamic(() => import('@/components/playground/PlaygroundApp'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
      <div className="text-sm">Loading API Playground…</div>
    </div>
  ),
});

export default function Home() {
  return <PlaygroundApp />;
}
