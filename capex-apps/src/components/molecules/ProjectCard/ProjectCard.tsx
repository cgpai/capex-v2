import React from 'react';
import { Project, ProjectStatus } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { StatusIcon } from '../../atoms/StatusIcon/StatusIcon';

interface ProjectCardProps {
    project: Project;
    categoryName: string;
    priorityName?: string;
    onEditClick: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, categoryName, priorityName = 'N/A', onEditClick }) => {
    return (
        <div className="bg-siloam-bg p-4 rounded-xl border border-siloam-border shadow-soft space-y-3 animate-fade-in">
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="font-bold text-siloam-text-primary">{project.projectName}</h4>
                    <p className="text-xs text-siloam-text-secondary">{project.projectCode}</p>
                </div>
                <StatusIcon status={project.status} />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                    <p className="text-xs text-siloam-text-secondary">Total Budget</p>
                    <p className="font-semibold">{formatCurrency(project.budgetPlan + project.budgetCarryForward)}</p>
                </div>
                <div>
                    <p className="text-xs text-siloam-text-secondary">Consumed</p>
                    <p className="font-semibold">{formatCurrency(project.consumedBudget)}</p>
                </div>
                 <div>
                    <p className="text-xs text-siloam-text-secondary">Category</p>
                    <p className="font-semibold truncate" title={categoryName}>{categoryName}</p>
                </div>
                <div>
                    <p className="text-xs text-siloam-text-secondary">Owner</p>
                    <p className="font-semibold">{project.owner || 'N/A'}</p>
                </div>
                <div>
                    <p className="text-xs text-siloam-text-secondary">Priority</p>
                    <p className="font-semibold truncate" title={priorityName}>{priorityName}</p>
                </div>
            </div>

            <div className="pt-3 border-t border-siloam-border flex justify-end">
                <button
                    onClick={onEditClick}
                    className="bg-siloam-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-siloam-blue/90 transition shadow-soft"
                >
                    Edit Details
                </button>
            </div>
        </div>
    );
};
ProjectCard.displayName = 'ProjectCard';
