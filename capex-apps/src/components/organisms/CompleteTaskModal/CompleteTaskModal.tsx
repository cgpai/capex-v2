import React, { useState } from 'react';
import { UserTask, User } from '../../../types';
import * as taskService from '../../../services/taskService';
import {
  completeAdhocTaskViaBe,
  completeWorkflowTaskViaBe,
  isCapexBeConfigured,
  resolveMyTasksAccessToken,
} from '../../../services/myTasksApi';
import { getAccessTokenForBackend } from '../../../lib/authSession';

interface CompleteTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    task: UserTask | null;
    currentUser: User;
}

export const CompleteTaskModal: React.FC<CompleteTaskModalProps> = ({ isOpen, onClose, onConfirm, task, currentUser }) => {
    const [remark, setRemark] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !task) return null;

    const handleSubmit = async () => {
        if (!remark.trim()) {
            setError('Remark is required to complete the task.');
            return;
        }
        setError('');
        setIsSubmitting(true);
        try {
            if (task.type === 'workflow' && task.workflowStep) {
                const userRoleNames = new Set(currentUser.assignments.map(a => a.roleName));
                const assignedRole = task.assignedRoles?.find(r => userRoleNames.has(r.roleName));
                if (!assignedRole) {
                    throw new Error("You are not assigned to this task's required role.");
                }
                if (isCapexBeConfigured()) {
                    const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
                    try {
                        await completeWorkflowTaskViaBe({
                            userId: currentUser.id,
                            accessToken,
                            assetId: String(task.assetId),
                            taskId: String(task.workflowStep.taskId),
                            remark: remark.trim(),
                            roleId: assignedRole.id,
                        });
                    } catch (beErr) {
                        console.warn('Complete workflow via BE failed, falling back:', beErr);
                        await taskService.markTaskAsDone(task.assetId, task.workflowStep.taskId, remark, currentUser, assignedRole);
                    }
                } else {
                    await taskService.markTaskAsDone(task.assetId, task.workflowStep.taskId, remark, currentUser, assignedRole);
                }
            } else if (task.type === 'adhoc' && task.adhocTask) {
                if (isCapexBeConfigured()) {
                    const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
                    try {
                        await completeAdhocTaskViaBe({
                            userId: currentUser.id,
                            accessToken,
                            adhocTaskId: task.id,
                            remark: remark.trim(),
                        });
                    } catch (beErr) {
                        console.warn('Complete adhoc via BE failed, falling back:', beErr);
                        await taskService.markAdhocTaskAsDone(task.id, remark);
                    }
                } else {
                    await taskService.markAdhocTaskAsDone(task.id, remark);
                }
            } else {
                throw new Error("Invalid task type for completion.");
            }
            onConfirm();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleClose = () => {
        setRemark('');
        setError('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg">
                <h3 className="text-lg font-bold mb-4 text-siloam-text-primary">Complete Task: {task.taskName}</h3>
                <p className="text-sm text-siloam-text-secondary mb-2">{task.description}</p>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="remark" className="block text-sm font-medium text-siloam-text-secondary">Completion Remark</label>
                        <textarea
                            id="remark"
                            value={remark}
                            onChange={(e) => setRemark(e.target.value)}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            rows={4}
                        />
                    </div>
                    {error && <p className="text-sm text-danger">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={handleClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting || !remark.trim()} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400">
                        {isSubmitting ? 'Submitting...' : 'Confirm Completion'}
                    </button>
                </div>
            </div>
        </div>
    );
};
