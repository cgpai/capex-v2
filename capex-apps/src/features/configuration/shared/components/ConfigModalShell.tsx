'use client';

import React from 'react';

type ConfigModalShellProps = {
  title: React.ReactNode;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
  footerExtra?: React.ReactNode;
};

export function ConfigModalShell({
  title,
  onClose,
  onSave,
  saveLabel = 'Save',
  saving = false,
  saveDisabled = false,
  maxWidthClass = 'max-w-lg',
  children,
  footerExtra,
}: ConfigModalShellProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className={`bg-siloam-surface p-6 rounded-xl shadow-soft w-full ${maxWidthClass} max-h-[90vh] flex flex-col`}>
        <h3 className="text-lg font-bold mb-4 text-siloam-text-primary shrink-0">{title}</h3>
        <div className="overflow-y-auto pr-2 flex-1">{children}</div>
        <div className="mt-6 flex justify-end space-x-2 shrink-0">
          {footerExtra}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg"
          >
            Cancel
          </button>
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving || saveDisabled}
              className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
