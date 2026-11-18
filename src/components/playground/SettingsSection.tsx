'use client';

/** Shared section wrapper for the settings panel. */
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b pb-5 last:border-b-0" aria-label={title}>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}
