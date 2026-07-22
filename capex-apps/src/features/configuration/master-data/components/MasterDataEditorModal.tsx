'use client';

import React, { useState, useEffect } from 'react';
import type { ArchetypeConfig, RegionalConfig } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import type { MasterDataType } from '@/features/configuration/master-data/hooks/useMasterDataCrud';

export const MasterDataEditorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Record<string, unknown>) => void;
  item: Record<string, unknown> | null;
  type: MasterDataType;
  allArchetypes: ArchetypeConfig[];
  allRegionals: RegionalConfig[];
}> = ({ isOpen, onClose, onSave, item: initialItem, type, allArchetypes, allRegionals }) => {
  const { showToast } = useToast();
  const [item, setItem] = useState(initialItem);

  useEffect(() => {
    setItem(initialItem);
  }, [initialItem]);

  if (!isOpen || !item) return null;

  const handleSave = () => {
    if (!item.name || !item.code) {
      showToast('Name and Code are required.', 'error');
      return;
    }
    onSave(item);
  };

  const title = `${item.id ? 'Edit' : 'Create'} ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg">
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Name</label>
            <input
              type="text"
              value={String(item.name ?? '')}
              onChange={(e) => setItem({ ...item, name: e.target.value })}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Code</label>
            <input
              type="text"
              value={String(item.code ?? '')}
              onChange={(e) => setItem({ ...item, code: e.target.value })}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
          {type === 'hu' && (
            <>
              <div>
                <label className="block text-sm font-medium text-siloam-text-secondary">HU Number</label>
                <input
                  type="text"
                  value={String(item.huNumber ?? '')}
                  onChange={(e) => setItem({ ...item, huNumber: e.target.value })}
                  className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-siloam-text-secondary">Network</label>
                <select
                  value={String(item.archetypeId ?? '')}
                  onChange={(e) => setItem({ ...item, archetypeId: e.target.value })}
                  className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                >
                  <option value="">Select Network</option>
                  {allArchetypes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-siloam-text-secondary">Regional</label>
                <select
                  value={String(item.regionalId ?? '')}
                  onChange={(e) => setItem({ ...item, regionalId: e.target.value })}
                  className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                >
                  <option value="">Select Regional</option>
                  {allRegionals.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(item.isPipeline)}
                  onChange={(e) => setItem({ ...item, isPipeline: e.target.checked })}
                  className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
                />
                <span className="text-sm font-medium text-siloam-text-secondary">Is pipeline</span>
              </label>
            </>
          )}
        </div>
        <div className="mt-6 flex justify-end space-x-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
