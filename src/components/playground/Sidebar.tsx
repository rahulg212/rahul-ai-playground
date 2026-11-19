'use client';

/**
 * Left sidebar: brand header, New Chat, search, the conversation list
 * (rename / delete inline) and a storage footnote. Rendered as a fixed
 * column on desktop and as an overlay drawer on mobile.
 */
import React, { useMemo, useState } from 'react';
import { Check, MessageSquare, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { getAdapter } from '@/lib/providerAdapters';
import { relativeTime } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function ConversationItem({ id }: { id: string }) {
  const {
    conversations,
    activeConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
  } = usePlayground();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');

  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  const isActive = activeConversation?.id === id;
  const adapter = getAdapter(conversation.provider);

  const startRename = () => {
    setDraft(conversation.title);
    setRenaming(true);
  };

  const commitRename = () => {
    renameConversation(id, draft);
    setRenaming(false);
  };

  const remove = () => {
    if (window.confirm(`Delete "${conversation.title}"? This cannot be undone.`)) {
      deleteConversation(id);
    }
  };

  return (
    <div
      className={cn(
        'group relative rounded-lg px-2 py-1.5 transition-colors',
        isActive ? 'bg-accent' : 'hover:bg-muted/70',
      )}
    >
      {renaming ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') setRenaming(false);
            }}
            className="h-7 text-sm"
            aria-label="Conversation title"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={commitRename} aria-label="Save title">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRenaming(false)} aria-label="Cancel rename">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <button
            className="block w-full min-w-0 text-left"
            onClick={() => selectConversation(id)}
            title={conversation.title}
          >
            <span className="block truncate text-sm font-medium">{conversation.title}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="truncate">{adapter.label}</span>
              <span>·</span>
              <span className="shrink-0">{relativeTime(conversation.updatedAt)}</span>
              <span>·</span>
              <span className="shrink-0">{conversation.messages.length} msg</span>
            </span>
          </button>
          {/* Actions are siblings (not nested buttons) and appear on hover. */}
          <div className="absolute right-1 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={startRename}
              aria-label={`Rename ${conversation.title}`}
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={remove}
              aria-label={`Delete ${conversation.title}`}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Shared content for the desktop column and the mobile drawer. */
function SidebarContent() {
  const { conversations, createNewChat } = usePlayground();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query) return sorted;
    // Full-text search, like LibreChat / OpenWebUI: match the title OR any
    // message content inside the conversation.
    return sorted.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(query) ||
        conversation.messages.some((m) => m.content.toLowerCase().includes(query)),
    );
  }, [conversations, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Brand + new chat + search */}
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight truncate">Rahul&apos;s AI Studio</div>
            <div className="text-[11px] text-muted-foreground leading-tight">Multi-Model LLM Arena</div>
          </div>
        </div>
        <Button className="w-full" onClick={createNewChat}>
          <Plus className="h-4 w-4" /> New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats and messages…"
            className="h-8 pl-8 text-sm"
            aria-label="Search conversations"
          />
        </div>
      </div>

      {/* Conversation list (scrollable) */}
      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2" aria-label="Conversations">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground">
            <MessageSquare className="h-6 w-6" />
            <p className="text-xs">{search ? 'No chats match your search.' : 'No chats yet. Start one above.'}</p>
          </div>
        ) : (
          filtered.map((conversation) => <ConversationItem key={conversation.id} id={conversation.id} />)
        )}
      </nav>

      <div className="border-t p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Conversations, keys and settings live in this browser&apos;s localStorage. For personal and
          local testing only.
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, mobileDrawer, setMobileDrawer } = usePlayground();

  const closeDrawer = () => setMobileDrawer(null);

  return (
    <>
      {/* Desktop column */}
      <aside
        className={cn(
          'hidden w-72 shrink-0 border-r bg-sidebar lg:flex lg:flex-col',
          !sidebarOpen && 'lg:hidden',
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileDrawer === 'sidebar' && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Chats">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r bg-background shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              onClick={closeDrawer}
              aria-label="Close chats panel"
            >
              <X className="h-4 w-4" />
            </Button>
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
}
