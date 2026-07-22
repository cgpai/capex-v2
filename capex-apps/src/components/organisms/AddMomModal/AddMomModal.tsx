import React, { useState, useEffect } from 'react';
import { User, EnrichedAsset, Project, MOM } from '../../../types';
import * as taskService from '../../../services/taskService';
import { useToast } from '../../../contexts/ToastContext';
import { Spinner } from '../../atoms/Spinner/Spinner';

interface AddMomModalProps {
    isOpen: boolean;
    onClose: () => void;
    assetId: string;
    asset?: EnrichedAsset | null;
    project?: Project | null;
    currentUser: User;
    onMomAdded: (assetId?: string) => void;
    /** When set, modal opens in edit mode for this MOM (same assetId). */
    editingMom?: MOM | null;
}

export const AddMomModal: React.FC<AddMomModalProps> = ({
    isOpen,
    onClose,
    assetId,
    asset,
    project,
    currentUser,
    onMomAdded,
    editingMom,
}) => {
    const { showToast } = useToast();
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        if (editingMom) setContent(editingMom.content ?? '');
        else setContent('');
    }, [isOpen, editingMom?.id, editingMom?.content]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!content.trim()) {
            showToast('Konten tidak boleh kosong.', 'error', { title: 'MOM' });
            return;
        }
        setIsSubmitting(true);
        try {
            if (editingMom) {
                await taskService.updateMOMContent(editingMom, content);
                showToast('MOM berhasil diperbarui.', 'success');
            } else {
                await taskService.addMOM(assetId, content, currentUser);
                showToast('MOM berhasil ditambah.', 'success');
            }
            onMomAdded(assetId);
            handleClose();
        } catch (error) {
            console.error('Failed to save MOM:', error);
            showToast(editingMom ? 'Gagal memperbarui MOM. Silakan coba lagi.' : 'Gagal menambah MOM. Silakan coba lagi.', 'error', { title: 'MOM' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setContent('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <h3 className="text-lg font-bold mb-4 text-siloam-text-primary">
                    {editingMom ? 'Edit Minutes of Meeting (MOM)' : 'Add Minutes of Meeting (MOM)'}
                </h3>
                
                {/* Project & Asset Info */}
                {(asset || project) && (
                    <div className="mb-4 p-3 bg-siloam-bg rounded-lg border border-siloam-border">
                        <p className="text-xs text-siloam-text-secondary mb-1">Project & Asset Information</p>
                        <div className="space-y-1">
                            {project && (
                                <p className="text-sm font-semibold text-siloam-text-primary">
                                    Project: <span className="font-normal">{project.projectName} ({project.projectCode})</span>
                                </p>
                            )}
                            {asset && (
                                <p className="text-sm font-semibold text-siloam-text-primary">
                                    Asset: <span className="font-normal">{asset.assetName} ({asset.assetCode})</span>
                                </p>
                            )}
                            {asset && asset.huName && (
                                <p className="text-sm font-semibold text-siloam-text-primary">
                                    Hospital Unit: <span className="font-normal">{asset.huName}</span>
                                </p>
                            )}
                        </div>
                    </div>
                )}
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="mom-content" className="block text-sm font-medium text-siloam-text-secondary">
                            Notes / Content <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            id="mom-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Record key decisions, discussion points, or action items related to this project/asset..."
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            rows={8}
                        />
                        <p className="mt-1 text-xs text-siloam-text-secondary">
                            MOM ini akan terhubung dengan Asset: <strong>{asset?.assetName || assetId}</strong>
                            {project && ` dan Project: ${project.projectName}`}
                        </p>
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !content.trim()}
                        className="inline-flex items-center justify-center gap-2 min-w-[9rem] px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400"
                    >
                        {isSubmitting && <Spinner className="text-white" size={16} />}
                        {isSubmitting ? 'Menyimpan…' : editingMom ? 'Update MOM' : 'Save MOM'}
                    </button>
                </div>
            </div>
        </div>
    );
};
