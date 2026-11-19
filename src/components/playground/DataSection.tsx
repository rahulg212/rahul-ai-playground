'use client';

/**
 * Data management: export/import the current conversation (JSON or
 * Markdown) and full backups of everything (settings + presets + chats),
 * with an option to leave API keys out of the backup.
 */
import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  FileJson,
  FileText,
  Upload,
} from 'lucide-react';
import { usePlayground } from '@/components/playground/context';
import { SettingsSection } from '@/components/playground/SettingsSection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function DataSection() {
  const { exportConversation, importConversation, exportAll, importAll } = usePlayground();
  const conversationInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [includeKeys, setIncludeKeys] = useState(false);

  return (
    <SettingsSection title="Data" icon={Database}>
      {/* Current conversation */}
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="h-8" onClick={() => exportConversation('json')}>
          <FileJson className="h-3.5 w-3.5" /> Chat as JSON
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => exportConversation('md')}>
          <FileText className="h-3.5 w-3.5" /> Chat as Markdown
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 col-span-2"
          onClick={() => conversationInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" /> Import chat from JSON
        </Button>
      </div>
      <input
        ref={conversationInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import conversation JSON file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importConversation(file);
          event.target.value = '';
        }}
      />

      <Separator />

      {/* Full backup */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="include-keys"
          checked={includeKeys}
          onCheckedChange={(checked) => setIncludeKeys(checked === true)}
        />
        <Label htmlFor="include-keys" className="text-xs font-normal text-muted-foreground">
          Include API keys in the backup (leave off to share safely)
        </Label>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="h-8" onClick={() => exportAll(includeKeys)}>
          <Download className="h-3.5 w-3.5" /> Export all
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => backupInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Import all
        </Button>
      </div>
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import full backup file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importAll(file);
          event.target.value = '';
        }}
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Backups contain every chat, preset and your preferences. Importing merges conversations —
        nothing is deleted.
      </p>
    </SettingsSection>
  );
}
