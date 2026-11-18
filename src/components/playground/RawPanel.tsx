'use client';

/**
 * The toggleable Raw / debug panel.
 *
 * Shows the exact JSON request that was sent (API key masked — see
 * maskHeaders in src/lib/streaming.ts) and the raw streamed response chunks.
 */
import React, { useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { CopyButton } from '@/components/playground/MarkdownRenderer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function RawPanel() {
  const { rawDebug, showRawPanel } = usePlayground();
  const [tab, setTab] = useState<'request' | 'response'>('request');

  if (!showRawPanel) return null;

  return (
    <div className="border-t bg-muted/40">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'request' | 'response')}
        className="mx-auto w-full max-w-3xl px-3 py-2"
      >
        <div className="mb-1.5 flex items-center gap-2">
          <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Raw debug</span>
          {rawDebug?.status !== undefined && (
            <span className="text-[11px] text-muted-foreground">
              HTTP {rawDebug.status} · {(rawDebug.responseTimeMs ?? 0) / 1000}s
            </span>
          )}
        </div>
        <TabsList className="h-7">
          <TabsTrigger value="request" className="h-5 px-2 text-xs">Request</TabsTrigger>
          <TabsTrigger value="response" className="h-5 px-2 text-xs">Response</TabsTrigger>
        </TabsList>
        <TabsContent value="request" className="mt-1.5">
          <pre className="scrollbar-thin relative max-h-48 overflow-auto rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed">
            {rawDebug?.request ?? '// No request sent yet. Send a message to capture the raw JSON here.'}
          </pre>
          {rawDebug && <CopyButton text={rawDebug.request} label="Request JSON copied" />}
        </TabsContent>
        <TabsContent value="response" className="mt-1.5">
          <pre className="scrollbar-thin relative max-h-48 overflow-auto rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed">
            {rawDebug?.response ?? '// No response captured yet.'}
          </pre>
          {rawDebug && <CopyButton text={rawDebug.response} label="Response JSON copied" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
