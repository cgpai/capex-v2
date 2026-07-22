import React from 'react';
import { UserTask, TaskCurrentStatus, AdhocTaskStatus } from '../../../types';

interface TaskCardProps {
    task: UserTask;
    onCompleteClick: () => void;
}

const StatusLabel: React.FC<{ status: 'On Track' | 'At Risk' | 'Overdue' | 'Done' }> = ({ status }) => {
    const statusStyles = {
        'On Track': 'bg-siloam-green/10 text-siloam-green',
        'At Risk': 'bg-warning/10 text-yellow-600',
        'Overdue': 'bg-danger/10 text-danger',
        'Done': 'bg-gray-200 text-gray-700',
    };
    return (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[status]}`}>
            {status}
        </span>
    );
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onCompleteClick }) => {
    
    const calculateStatus = (): 'On Track' | 'At Risk' | 'Overdue' | 'Done' => {
        if (task.status === TaskCurrentStatus.Done || task.status === AdhocTaskStatus.Done) {
            return 'Done';
        }

        const now = new Date();
        const targetDate = new Date(task.targetEndDate);
        const startDate = new Date(task.startDate);
        
        // Ensure dates are valid before calculation
        if (isNaN(targetDate.getTime()) || isNaN(startDate.getTime())) return 'On Track';

        const totalDuration = (targetDate.getTime() - startDate.getTime());
        const remainingTime = (targetDate.getTime() - now.getTime());
        
        if (remainingTime < 0) return 'Overdue';

        // At risk if less than 25% of total time remains, only if total duration is positive
        if (totalDuration > 0 && remainingTime < totalDuration * 0.25) return 'At Risk';

        return 'On Track';
    };

    const getTaskAge = (): string => {
        const ageInMillis = new Date().getTime() - new Date(task.startDate).getTime();
        const ageInDays = Math.floor(ageInMillis / (1000 * 60 * 60 * 24));
        if (ageInDays < 1) return "Today";
        return `${ageInDays} day${ageInDays > 1 ? 's' : ''} ago`;
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const status = calculateStatus();
    const isDone =
        status === 'Done' ||
        task.status === TaskCurrentStatus.Done ||
        task.status === AdhocTaskStatus.Done ||
        (task as { status?: string }).status === 'Done';

    return (
        <div 
            draggable={!isDone}
            onDragStart={handleDragStart}
            className={`bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4 flex flex-col justify-between space-y-4 animate-fade-in ${!isDone ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            <div>
                <p className="text-xl font-extrabold text-siloam-text-primary tracking-tight">
                    {task.assetCode}
                </p>
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-siloam-text-primary pr-2">{task.taskName}</h3>
                    <StatusLabel status={status} />
                </div>
                <p className="text-xs text-siloam-text-secondary mt-1">{task.description}</p>
                <div className="mt-3 pt-3 border-t border-siloam-border text-xs space-y-1.5">
                    <p><span className="font-semibold text-siloam-text-secondary">Project:</span> {task.projectName}</p>
                    <p><span className="font-semibold text-siloam-text-secondary">Asset:</span> {task.assetName}</p>
                    <p><span className="font-semibold text-siloam-text-secondary">HU:</span> {task.huName}</p>
                </div>
            </div>
            <div className="flex justify-between items-end">
                <div className="text-xs text-siloam-text-secondary">
                    <p>Opened: {getTaskAge()}</p>
                    <p>Due: {task.targetEndDate ? new Date(task.targetEndDate).toLocaleDateString() : '—'}</p>
                </div>
                {!isDone && (
                    <button
                        onClick={onCompleteClick}
                        className="bg-siloam-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-siloam-blue/90 transition shadow-soft"
                    >
                        Complete
                    </button>
                )}
            </div>
        </div>
    );
};