'use client';

import React from 'react';
import type { DuplicateEntityKind } from '../../../hooks/useDuplicateDetection';

interface DuplicateCreateConfirmDialogProps {
  isOpen: boolean;
  entityType: DuplicateEntityKind;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DuplicateCreateConfirmDialog: React.FC<DuplicateCreateConfirmDialogProps> = ({
  isOpen,
  entityType,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const label = entityType === 'project' ? 'Project' : 'Asset';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-siloam-surface p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-confirm-title"
      >
        <h3 id="dup-confirm-title" className="text-lg font-bold text-siloam-text-primary">
          Confirm Create New {label}
        </h3>
        <p className="mt-3 text-sm text-siloam-text-secondary">
          The system detected similar existing records. Creating a new {label} may produce
          duplicate master data. Are you sure you want to continue?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-siloam-border px-4 py-2 text-sm font-semibold hover:bg-siloam-bg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Confirm Create
          </button>
        </div>
      </div>
    </div>
  );
};
