'use client';

import React, { useState, useEffect } from 'react';
import type { MasterCatalogueItem } from '@/types';
import { CurrencyInput } from '@/components/atoms/CurrencyInput/CurrencyInput';
import { useToast } from '@/contexts/ToastContext';

const EMPTY_ITEM: Partial<MasterCatalogueItem> = {
  id: '',
  rdsCode: '',
  name: '',
  category: '',
  price: 0,
};

export const CatalogueEditorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: MasterCatalogueItem) => void | Promise<void>;
  item: Partial<MasterCatalogueItem> | null;
  isSaving?: boolean;
}> = ({ isOpen, onClose, onSave, item, isSaving = false }) => {
  const { showToast } = useToast();
  const [editedItem, setEditedItem] = useState<Partial<MasterCatalogueItem>>(EMPTY_ITEM);

  useEffect(() => {
    if (!isOpen) return;
    setEditedItem(item ? { ...EMPTY_ITEM, ...item } : { ...EMPTY_ITEM });
  }, [item, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (
      !editedItem.name?.trim() ||
      !editedItem.rdsCode?.trim() ||
      !editedItem.category?.trim() ||
      editedItem.price === undefined
    ) {
      showToast('All fields are required.', 'error');
      return;
    }
    try {
      await onSave(editedItem as MasterCatalogueItem);
    } catch {
      // Toast already shown by save handler
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
        <h3 className="text-lg font-bold mb-4">{editedItem.id ? 'Edit' : 'Create'} Catalogue Item</h3>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">RDS Code</label>
            <input
              type="text"
              value={editedItem.rdsCode || ''}
              onChange={(e) => setEditedItem({ ...editedItem, rdsCode: e.target.value })}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Name</label>
            <input
              type="text"
              value={editedItem.name || ''}
              onChange={(e) => setEditedItem({ ...editedItem, name: e.target.value })}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Category</label>
            <input
              type="text"
              value={editedItem.category || ''}
              onChange={(e) => setEditedItem({ ...editedItem, category: e.target.value })}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Price</label>
            <CurrencyInput
              value={editedItem.price || 0}
              onValueChange={(val) => setEditedItem({ ...editedItem, price: val })}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
};
CatalogueEditorModal.displayName = 'CatalogueEditorModal';
