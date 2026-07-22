import React, { useEffect, useState } from 'react';
import type { FSConclusion } from '../../../types';

const STATUS_OPTIONS: FSConclusion[] = ['Pending', 'Approved', 'Approved with Notes', 'Rejected'];

export type FSApprovalStatusModalProps = {
  projectName: string;
  currentStatus: string;
  currentFollowUp: string;
  onClose: () => void;
  onConfirm: (status: FSConclusion, followUpAction: string) => void;
};

export const FSApprovalStatusModal: React.FC<FSApprovalStatusModalProps> = ({
  projectName,
  currentStatus,
  currentFollowUp,
  onClose,
  onConfirm,
}) => {
  const [status, setStatus] = useState<FSConclusion>(
    (STATUS_OPTIONS.includes(currentStatus as FSConclusion) ? currentStatus : 'Pending') as FSConclusion,
  );
  const [followUpAction, setFollowUpAction] = useState(currentFollowUp || '');
  const [error, setError] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    setStatus(
      (STATUS_OPTIONS.includes(currentStatus as FSConclusion) ? currentStatus : 'Pending') as FSConclusion,
    );
    setFollowUpAction(currentFollowUp || '');
    setError('');
    setShowConfirmation(false);
  }, [currentStatus, currentFollowUp, projectName]);

  const validate = (): boolean => {
    if (!status) {
      setError('Pilih status baru.');
      return false;
    }
    if (status === currentStatus && (followUpAction || '').trim() === (currentFollowUp || '').trim()) {
      setError('Tidak ada perubahan yang terdeteksi.');
      return false;
    }
    if ((status === 'Approved with Notes' || status === 'Rejected') && !followUpAction.trim()) {
      setError('Follow-up action wajib diisi untuk status ini.');
      return false;
    }
    setError('');
    return true;
  };

  const handleReview = () => {
    if (!validate()) return;
    setShowConfirmation(true);
  };

  const handleConfirm = () => {
    if (!validate()) return;
    onConfirm(status, followUpAction.trim());
  };

  const inputClass =
    'w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-md">
        <div className="p-6 border-b border-siloam-border">
          <h3 className="text-lg font-bold text-siloam-text-primary">Update FS Status</h3>
          <p className="text-sm text-siloam-text-secondary mt-1">{projectName}</p>
        </div>

        {!showConfirmation ? (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Status Saat Ini</label>
              <input type="text" value={currentStatus} disabled className={`${inputClass} opacity-70`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Status Baru</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FSConclusion)}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Follow Up Action</label>
              <textarea
                value={followUpAction}
                onChange={(e) => setFollowUpAction(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Wajib untuk Approved with Notes atau Rejected"
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : (
          <div className="p-6 space-y-3">
            <p className="text-sm text-siloam-text-primary font-medium">Konfirmasi perubahan status</p>
            <div className="bg-siloam-bg border border-siloam-border rounded-lg p-4 text-sm space-y-2">
              <p>
                <span className="text-siloam-text-secondary">Status: </span>
                <span className="font-medium">{currentStatus}</span>
                <span className="text-siloam-text-secondary"> → </span>
                <span className="font-medium text-siloam-blue">{status}</span>
              </p>
              {(followUpAction || currentFollowUp) && (
                <p>
                  <span className="text-siloam-text-secondary">Follow-up: </span>
                  <span className="font-medium">{followUpAction.trim() || '—'}</span>
                </p>
              )}
            </div>
            <p className="text-xs text-siloam-text-secondary">
              Perubahan akan diterapkan ke tabel. Klik <strong>Save Changes</strong> di halaman untuk menyimpan ke
              database.
            </p>
          </div>
        )}

        <div className="p-6 border-t border-siloam-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg"
          >
            Batal
          </button>
          {!showConfirmation ? (
            <button
              type="button"
              onClick={handleReview}
              className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90"
            >
              Lanjut Konfirmasi
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-siloam-green text-white font-semibold hover:bg-siloam-green/90"
              >
                Ya, Terapkan
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

FSApprovalStatusModal.displayName = 'FSApprovalStatusModal';
