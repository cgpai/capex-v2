'use client';

import React, { useState, useEffect } from 'react';
import type { RoomConfig } from '@/types';
import { useToast } from '@/contexts/ToastContext';

const EMPTY_ROOM: Partial<RoomConfig> = {
  id: '',
  name: '',
};

export const RoomEditorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (room: RoomConfig) => void | Promise<void>;
  room: Partial<RoomConfig> | null;
  isSaving?: boolean;
}> = ({ isOpen, onClose, onSave, room, isSaving = false }) => {
  const { showToast } = useToast();
  const [editedRoom, setEditedRoom] = useState<Partial<RoomConfig>>(EMPTY_ROOM);

  useEffect(() => {
    if (!isOpen) return;
    setEditedRoom(room ? { ...EMPTY_ROOM, ...room } : { ...EMPTY_ROOM });
  }, [room, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!editedRoom.name?.trim()) {
      showToast('Room name is required.', 'error');
      return;
    }
    try {
      await onSave(editedRoom as RoomConfig);
    } catch {
      // Toast already shown by save handler
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg">
        <h3 className="text-lg font-bold mb-4">{editedRoom.id ? 'Edit' : 'Create'} Room</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Room Name</label>
            <input
              type="text"
              value={editedRoom.name || ''}
              onChange={(e) => setEditedRoom({ ...editedRoom, name: e.target.value })}
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
            {isSaving ? 'Saving…' : 'Save Room'}
          </button>
        </div>
      </div>
    </div>
  );
};
RoomEditorModal.displayName = 'RoomEditorModal';
