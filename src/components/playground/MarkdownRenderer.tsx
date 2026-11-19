'use client';

/**
 * Markdown rendering for assistant messages.
 *
 * - GitHub-flavored markdown (tables, task lists, strikethrough).
 * - Hand-styled element mapping (no typography plugin needed).
 * - Fenced code blocks render through CodeBlock: syntax highlighting plus a
 *   per-block copy button AND an interactive Live Preview for HTML/SVG artifacts!
 */
import React, { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Code2, Copy, Eye } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';

/** Copy button used in the code block header and raw panel. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(label ?? 'Copied to clipboard');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — clipboard unavailable.');
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={handleCopy}
      aria-label="Copy code"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

/** A fenced code block: language label, copy button, syntax highlight + Live Preview for HTML/SVG. */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const lang = (language || 'text').toLowerCase();
  const canPreview =
    lang === 'html' ||
    lang === 'svg' ||
    lang === 'xml' ||
    code.trim().startsWith('<!DOCTYPE') ||
    code.trim().startsWith('<html') ||
    code.trim().startsWith('<svg');

  const [mode, setMode] = useState<'code' | 'preview'>('code');

  return (
    <div className="my-3 overflow-hidden rounded-lg border shadow-xs">
      <div className="flex items-center justify-between bg-muted/80 px-3 py-1.5 border-b">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-medium text-muted-foreground uppercase">{language || 'text'}</span>
          {canPreview && (
            <div className="flex items-center rounded-md border bg-background/80 p-0.5">
              <button
                type="button"
                onClick={() => setMode('code')}
                className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                  mode === 'code' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="View Source Code"
              >
                <Code2 className="h-3 w-3" /> Code
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
                  mode === 'preview' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Interactive Live Preview"
              >
                <Eye className="h-3 w-3" /> Live Preview
              </button>
            </div>
          )}
        </div>
        <CopyButton text={code} label="Code copied" />
      </div>

      {mode === 'preview' && canPreview ? (
        <div className="relative w-full bg-white dark:bg-zinc-950 p-2 min-h-[220px]">
          <iframe
            srcDoc={lang === 'svg' || code.trim().startsWith('<svg') ? `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fafafa;">${code}</body></html>` : code}
            sandbox="allow-scripts allow-modals"
            className="w-full min-h-[260px] rounded border border-zinc-200 dark:border-zinc-800 bg-white"
            title="Artifact Live Preview"
          />
        </div>
      ) : (
        <SyntaxHighlighter
          language={language || 'text'}
          style={isDark ? oneDark : oneLight}
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: '12.5px',
            lineHeight: 1.6,
            padding: '12px 14px',
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' } }}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  );
}

/** Hand-rolled markdown element styles for chat bubbles. */
const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '').replace(/\n$/, '');
    const match = /language-([\w+#-]+)/.exec(className ?? '');
    if (match || text.includes('\n')) {
      return <CodeBlock language={match?.[1] ?? 'text'} code={text} />;
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{text}</code>
    );
  },
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted text-xs uppercase">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t px-3 py-2 text-xs">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/50 pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-muted" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
});
