'use client';

/**
 * Markdown rendering for assistant messages.
 *
 * - GitHub-flavored markdown (tables, task lists, strikethrough).
 * - Hand-styled element mapping (no typography plugin needed).
 * - Fenced code blocks render through CodeBlock: syntax highlighting plus a
 *   per-block copy button.
 */
import React, { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';

/** Copy button used in the code block header and raw panel. */
function CopyButton({ text, label }: { text: string; label?: string }) {
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

/** A fenced code block: language label, copy button, highlighted source. */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="my-3 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-muted px-3 py-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{language || 'text'}</span>
        <CopyButton text={code} label="Code copied" />
      </div>
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
    </div>
  );
}

/** Hand-rolled markdown element styles for chat bubbles. */
const components: Components = {
  // `pre` is unwrapped because CodeBlock renders its own <pre> container.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '').replace(/\n$/, '');
    const match = /language-([\w+#-]+)/.exec(className ?? '');
    // Fenced blocks have a language class or contain newlines; anything else
    // is inline code.
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
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b bg-muted px-2.5 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-2.5 py-1.5 align-top last:border-b-0">{children}</td>,
};

/** Memoized so streaming parents do not re-parse unchanged messages. */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

export { CopyButton };
