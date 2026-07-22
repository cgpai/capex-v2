import React, { useState, useEffect } from 'react';
import { Vendor } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';

interface VendorEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Vendor) => void | Promise<void>;
  item: Partial<Vendor> | null;
  isSaving?: boolean;
}

const EMPTY_VENDOR: Partial<Vendor> = {
  id: '',
  name: '',
  address: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  npwp: '',
};

export const VendorEditorModal: React.FC<VendorEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  item,
  isSaving = false,
}) => {
  const { showToast } = useToast();
  const [editedItem, setEditedItem] = useState<Partial<Vendor>>(EMPTY_VENDOR);

  useEffect(() => {
    if (!isOpen) return;
    setEditedItem(item ? { ...EMPTY_VENDOR, ...item } : { ...EMPTY_VENDOR });
  }, [item, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (
      !editedItem.name?.trim() ||
      !editedItem.address?.trim() ||
      !editedItem.contactPerson?.trim() ||
      !editedItem.contactEmail?.trim()
    ) {
      showToast('Nama, Alamat, Contact Person, dan Email wajib diisi.', 'error');
      return;
    }
    try {
      await onSave(editedItem as Vendor);
    } catch {
      // Toast already shown by save handler
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
        <h3 className="text-lg font-bold mb-4">{editedItem.id ? 'Edit' : 'Create'} Vendor</h3>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Vendor Name</label>
            <input
              type="text"
              value={editedItem.name || ''}
              onChange={(e) => setEditedItem({ ...editedItem, name: e.target.value })}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Address</label>
            <textarea
              value={editedItem.address || ''}
              onChange={(e) => setEditedItem({ ...editedItem, address: e.target.value })}
              rows={3}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">NPWP</label>
            <input
              type="text"
              value={editedItem.npwp || ''}
              onChange={(e) => setEditedItem({ ...editedItem, npwp: e.target.value })}
              placeholder="00.000.000.0-000.000"
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Contact Person</label>
            <input
              type="text"
              value={editedItem.contactPerson || ''}
              onChange={(e) => setEditedItem({ ...editedItem, contactPerson: e.target.value })}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Contact Email</label>
            <input
              type="email"
              value={editedItem.contactEmail || ''}
              onChange={(e) => setEditedItem({ ...editedItem, contactEmail: e.target.value })}
              disabled={isSaving}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Contact Phone</label>
            <input
              type="tel"
              value={editedItem.contactPhone || ''}
              onChange={(e) => setEditedItem({ ...editedItem, contactPhone: e.target.value })}
              disabled={isSaving}
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
            {isSaving ? 'Saving…' : 'Save Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
};
VendorEditorModal.displayName = 'VendorEditorModal';
