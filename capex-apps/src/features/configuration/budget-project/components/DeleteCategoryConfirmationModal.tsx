'use client';

import React, { useState, useEffect } from 'react';
import type { BudgetCategoryConfig } from '@/types';
import { formatCurrency } from '@/lib/formatter';

export const DeleteCategoryConfirmationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: () => void;
  onHideInstead: () => void;
  category: BudgetCategoryConfig | null;
  totalValue: number;
}> = ({ isOpen, onClose, onConfirmDelete, onHideInstead, category, totalValue }) => {
  const [confirmationText, setConfirmationText] = useState('');
  const confirmationPhrase = 'ya saya mau hapus';

  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
    }
  }, [isOpen]);

  if (!isOpen || !category) return null;

  const isDeleteDisabled = confirmationText !== confirmationPhrase;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
        <div className="flex items-start">
          <div className="mr-4 flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-danger/10 sm:h-10 sm:w-10">
            <svg
              className="h-6 w-6 text-danger"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-siloam-text-primary">Delete &apos;{category.name}&apos;?</h3>
            <p className="text-sm text-siloam-text-secondary mt-2">
              This is a destructive action that cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-4 bg-siloam-bg p-4 rounded-lg border border-siloam-border">
          <p className="text-sm font-semibold">Impact Summary</p>
          <p className="text-sm">
            This category has a total budget plan value of{' '}
            <span className="font-bold text-danger">{formatCurrency(totalValue)}</span> across all periods.
            Deleting it will make this value disappear from all calculations.
          </p>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-sm font-bold text-yellow-800">Recommendation: Hide Instead</p>
          <p className="text-sm text-yellow-700 mt-1">
            Hiding a category removes it from future use but preserves all historical data and keeps your
            total budget calculations accurate. This action is reversible.
          </p>
          <button
            type="button"
            onClick={onHideInstead}
            className="mt-2 text-sm bg-yellow-400 text-yellow-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-yellow-500"
          >
            Hide Category Instead
          </button>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">
            If you are certain you want to proceed, please type &quot;
            <strong className="text-danger">{confirmationPhrase}</strong>&quot; below:
          </p>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-danger"
          />
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isDeleteDisabled}
            className="px-4 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Yes, I want to delete
          </button>
        </div>
      </div>
    </div>
  );
};
