'use client';

import React, { useCallback, useRef } from 'react';
import { ClipboardCopy, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { readClipboardText } from '@/features/configuration/workflow/utils/workflowSpreadsheetClipboard';

type SpreadsheetPasteToolbarProps = {
  templateHeader: string;
  templateExample?: string;
  formatHint: string;
  onPasteText: (text: string) => void;
  disabled?: boolean;
};

export function SpreadsheetPasteToolbar({
  templateHeader,
  templateExample,
  formatHint,
  onPasteText,
  disabled,
}: SpreadsheetPasteToolbarProps) {
  const { showToast } = useToast();
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  const handlePasteText = useCallback(
    (text: string) => {
      if (!text.trim()) {
        showToast('Clipboard kosong.', 'error');
        return;
      }
      onPasteText(text);
    },
    [onPasteText, showToast],
  );

  const handlePasteFromClipboard = useCallback(async () => {
    const text = await readClipboardText();
    if (!text) {
      showToast('Tidak dapat membaca clipboard. Salin data lalu Ctrl+V di area paste.', 'error');
      pasteAreaRef.current?.focus();
      return;
    }
    handlePasteText(text);
  }, [handlePasteText, showToast]);

  const handleContainerPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text');
      if (!text.trim()) return;
      e.preventDefault();
      handlePasteText(text);
    },
    [handlePasteText],
  );

  const handleCopyTemplate = useCallback(async () => {
    const payload = templateExample ?? templateHeader;
    try {
      await navigator.clipboard.writeText(payload);
      showToast('Template contoh disalin ke clipboard.', 'success');
    } catch {
      showToast('Gagal menyalin template.', 'error');
    }
  }, [showToast, templateExample, templateHeader]);

  return (
    <div className="rounded-lg border border-siloam-border bg-siloam-bg/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handlePasteFromClipboard()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-siloam-border rounded-lg hover:bg-siloam-surface disabled:opacity-50"
        >
          <ClipboardPaste className="w-4 h-4" />
          Tempel dari Clipboard
        </button>
        <button
          type="button"
          onClick={() => void handleCopyTemplate()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-siloam-border rounded-lg hover:bg-siloam-surface disabled:opacity-50"
        >
          <ClipboardCopy className="w-4 h-4" />
          Salin Template
        </button>
      </div>
      <div
        ref={pasteAreaRef}
        tabIndex={0}
        onPaste={handleContainerPaste}
        className="text-xs text-siloam-text-secondary outline-none focus:ring-2 focus:ring-siloam-blue/30 rounded-md p-2 bg-white/70 border border-dashed border-siloam-border cursor-text"
      >
        {formatHint} Klik area ini lalu <kbd className="px-1 py-0.5 bg-siloam-bg rounded border">Ctrl+V</kbd>{' '}
        untuk menempel data tab-separated dari Excel / Google Sheets.
      </div>
    </div>
  );
}
