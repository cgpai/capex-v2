import React from 'react';
import { UserTask, TaskCurrentStatus, AdhocTaskStatus } from '../../../types';
import { KanbanColumn } from '../../molecules/KanbanColumn/KanbanColumn';

interface KanbanBoardProps {
    tasks: UserTask[];
    onDropOnDone: (taskId: string) => void;
    onCompleteClick: (taskId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, onDropOnDone, onCompleteClick }) => {
    const activeTasks = tasks.filter(task => 
        task.status !== TaskCurrentStatus.Done && task.status !== AdhocTaskStatus.Done
    );

    const doneTasks = tasks.filter(task =>
        task.status === TaskCurrentStatus.Done || task.status === AdhocTaskStatus.Done
    );

    return (
        <div className="flex space-x-6 h-full p-1">
            <KanbanColumn
                title="Active Tasks"
                tasks={activeTasks}
                count={activeTasks.length}
                columnId="active"
                onCompleteClick={onCompleteClick}
            />
            <KanbanColumn
                title="Done"
                tasks={doneTasks}
                count={doneTasks.length}
                columnId="done"
                onDrop={onDropOnDone}
            />
        </div>
    );
};