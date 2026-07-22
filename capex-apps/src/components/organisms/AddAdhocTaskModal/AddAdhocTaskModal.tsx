import React, { useState } from 'react';
import { User, EnrichedAsset, Project } from '../../../types';
import * as taskService from '../../../services/taskService';
import { useToast } from '../../../contexts/ToastContext';
import { Spinner } from '../../atoms/Spinner/Spinner';

interface AddAdhocTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    assetId: string;
    asset?: EnrichedAsset | null;
    project?: Project | null;
    currentUser: User;
    allUsers: User[];
    onTaskAdded: (assetId?: string) => void;
}

export const AddAdhocTaskModal: React.FC<AddAdhocTaskModalProps> = ({ isOpen, onClose, assetId, asset, project, currentUser, allUsers, onTaskAdded }) => {
    const { showToast } = useToast();
    const [description, setDescription] = useState('');
    const [assignedToUserId, setAssignedToUserId] = useState<number | null>(null);
    const [dueDate, setDueDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!description.trim() || !assignedToUserId || !dueDate) {
            showToast('Semua field wajib diisi.', 'error', { title: 'Task' });
            return;
        }
        setIsSubmitting(true);
        try {
            await taskService.addAdhocTask(assetId, description, assignedToUserId, dueDate, currentUser);
            showToast('Task ad-hoc berhasil ditambah.', 'success', { title: 'Task' });
            onTaskAdded(assetId);
            handleClose();
        } catch (error) {
            console.error('Failed to add ad-hoc task:', error);
            showToast('Gagal menambah task. Silakan coba lagi.', 'error', { title: 'Task' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleClose = () => {
        setDescription('');
        setAssignedToUserId(null);
        setDueDate('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <h3 className="text-lg font-bold mb-4 text-siloam-text-primary">Add Ad-hoc Task</h3>
                
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
                        <label htmlFor="task-desc" className="block text-sm font-medium text-siloam-text-secondary">
                            Task Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            id="task-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the task to be done for this project/asset..."
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            rows={4}
                        />
                        <p className="mt-1 text-xs text-siloam-text-secondary">
                            Task ini akan terhubung dengan Asset: <strong>{asset?.assetName || assetId}</strong>
                            {project && ` dan Project: ${project.projectName}`}
                        </p>
                    </div>
                     <div>
                        <label htmlFor="assignee" className="block text-sm font-medium text-siloam-text-secondary">Assign To</label>
                        <select
                            id="assignee"
                            value={assignedToUserId || ''}
                            onChange={(e) => setAssignedToUserId(parseInt(e.target.value, 10))}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        >
                            <option value="" disabled>Select a user</option>
                            {allUsers.map(user => (
                                <option key={user.id} value={user.id}>{user.username}</option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="due-date" className="block text-sm font-medium text-siloam-text-secondary">Due Date</label>
                        <input
                            type="date"
                            id="due-date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        />
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
                        disabled={isSubmitting || !description.trim() || !assignedToUserId || !dueDate}
                        className="inline-flex items-center justify-center gap-2 min-w-[10rem] px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400"
                    >
                        {isSubmitting && <Spinner className="text-white" size={16} />}
                        {isSubmitting ? 'Menyimpan…' : 'Create Task'}
                    </button>
                </div>
            </div>
        </div>
    );
};
