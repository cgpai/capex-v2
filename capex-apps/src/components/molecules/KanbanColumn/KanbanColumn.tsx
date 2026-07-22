import React, { useState } from 'react';
import { UserTask } from '../../../types';
import { TaskCard } from '../TaskCard/TaskCard';

interface KanbanColumnProps {
    title: string;
    tasks: UserTask[];
    count: number;
    columnId: string;
    onDrop?: (taskId: string) => void;
    onCompleteClick?: (taskId: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ title, tasks, count, columnId, onDrop, onCompleteClick }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (onDrop) {
            e.preventDefault();
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        if (onDrop) {
            e.preventDefault();
            const taskId = e.dataTransfer.getData('taskId');
            if (taskId) {
                onDrop(taskId);
            }
            setIsDragOver(false);
        }
    };

    return (
        <div 
            className="flex-1 bg-siloam-bg rounded-xl flex flex-col"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="p-4 border-b border-siloam-border sticky top-0 bg-siloam-bg rounded-t-xl z-10">
                <h3 className="font-bold text-siloam-text-primary">{title} <span className="text-sm font-medium text-siloam-text-secondary bg-siloam-border px-2 py-1 rounded-full">{count}</span></h3>
            </div>
            <div className={`p-4 space-y-4 overflow-y-auto h-full transition-colors ${isDragOver ? 'bg-siloam-blue/10' : ''}`}>
                {tasks.map(task => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        onCompleteClick={() => onCompleteClick?.(task.id)}
                    />
                ))}
                {tasks.length === 0 && (
                     <div className="text-center py-10">
                        <p className="text-siloam-text-secondary">No tasks in this column.</p>
                    </div>
                )}
            </div>
        </div>
    );
};