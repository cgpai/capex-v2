import React, { useState } from 'react';
import { AdhocTask, User, AdhocTaskStatus } from '../../../types';
import * as taskService from '../../../services/taskService';
import { useToast } from '../../../contexts/ToastContext';

const Icon: React.FC<{ status: AdhocTaskStatus }> = ({ status }) => {
    const baseClasses = "w-10 h-10 rounded-full flex items-center justify-center text-white";
    if (status === AdhocTaskStatus.Done) {
        return (
            <div className={`${baseClasses} bg-siloam-green`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </div>
        );
    }
    return (
        <div className={`${baseClasses} bg-orange-500`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
            </svg>
        </div>
    );
};

interface AdhocTaskTimelineItemProps {
    task: AdhocTask;
    currentUser: User;
    onTaskUpdate: () => void;
}

export const AdhocTaskTimelineItem: React.FC<AdhocTaskTimelineItemProps> = ({ task, currentUser, onTaskUpdate }) => {
    const { showToast } = useToast();
    const [remark, setRemark] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isActionable = task.status === AdhocTaskStatus.Open && task.assignedToUserId === currentUser.id;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await taskService.markAdhocTaskAsDone(task.id, remark);
            onTaskUpdate();
        } catch (error) {
            console.error('Failed to complete ad-hoc task:', error);
            showToast('Gagal menyelesaikan task. Silakan coba lagi.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
         <div className="relative flex items-start pl-16">
            <div className="absolute left-5 top-5 w-11 border-t-2 border-dashed border-siloam-border"></div>
            <div className="flex-shrink-0 z-10">
                <Icon status={task.status} />
            </div>
            <div className="ml-6 flex-1 pt-1">
                <div className="bg-siloam-bg/50 border border-dashed border-siloam-border p-4 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-bold text-lg text-siloam-text-primary">Ad-hoc Task</p>
                            <p className="text-sm text-siloam-text-secondary">{task.description}</p>
                        </div>
                         <div className="text-right text-xs">
                            <p className="font-semibold text-siloam-text-secondary">Assigned To:</p>
                            <span className="block text-siloam-text-primary">{task.assignedToUsername}</span>
                        </div>
                    </div>

                    <div className="text-xs text-siloam-text-secondary mt-2 pt-2 border-t border-siloam-border/50 flex justify-between">
                         <p>Created by: <span className="font-semibold">{task.createdByUsername}</span></p>
                         <p>Due Date: <span className="font-semibold">{new Date(task.dueDate).toLocaleDateString()}</span></p>
                    </div>

                    {task.status === AdhocTaskStatus.Done && task.completedAt && (
                        <div className="mt-4 p-3 bg-siloam-surface rounded-lg border border-siloam-border">
                            <p className="text-sm font-semibold text-siloam-green">Completed</p>
                             <p className="text-sm my-1 italic">"{task.completionRemark}"</p>
                             <p className="text-xs text-siloam-text-secondary">
                                On {new Date(task.completedAt).toLocaleString()}
                             </p>
                        </div>
                    )}

                    {isActionable && (
                        <div className="mt-4 pt-4 border-t border-siloam-border/50">
                            <h4 className="text-sm font-semibold text-siloam-text-primary mb-2">Complete this task</h4>
                            <textarea
                                value={remark}
                                onChange={(e) => setRemark(e.target.value)}
                                placeholder="Add a completion remark..."
                                className="w-full p-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                rows={3}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !remark}
                                className="mt-2 w-full bg-siloam-blue text-white font-bold py-2 px-4 rounded-lg hover:bg-siloam-blue/90 disabled:bg-gray-400"
                            >
                                {isSubmitting ? 'Submitting...' : 'Mark as Done'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};