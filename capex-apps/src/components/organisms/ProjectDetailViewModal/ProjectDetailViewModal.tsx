import React from 'react';
import { Project, ProjectStatus, ProjectType } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
    [ProjectStatus.OnTrack]: 'On Track',
    [ProjectStatus.AtRisk]: 'At Risk',
    [ProjectStatus.OffTrack]: 'Off Track',
};

interface ProjectDetailViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    categoryName?: string;
    priorityName?: string;
}

export const ProjectDetailViewModal: React.FC<ProjectDetailViewModalProps> = ({
    isOpen,
    onClose,
    project,
    categoryName = '—',
    priorityName = '—',
}) => {
    if (!isOpen || !project) return null;

    const statusLabel = PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? String(project.status);
    const typeLabel = project.type === ProjectType.GeneralAndRoutine
        ? 'General & Regular Assets'
        : project.type === ProjectType.Strategic
            ? 'Strategic Projects'
            : project.type === ProjectType.ProjectPipeline
                ? 'Project Pipeline'
                : String(project.type);

    const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
        <div>
            <label className="block text-xs font-medium text-siloam-text-secondary mb-1">{label}</label>
            <p className="text-sm font-semibold text-siloam-text-primary">{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex-shrink-0 px-6 py-4 border-b border-siloam-border flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">Project Details</h3>
                        <p className="text-sm text-siloam-text-secondary">{project.projectCode} · {project.projectName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* General */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">General Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Project Code" value={project.projectCode} />
                            <DetailRow label="Project Name" value={project.projectName} />
                            <DetailRow label="AX Code" value={project.axCode} />
                            <DetailRow label="Owner" value={project.owner} />
                            <DetailRow label="Asset Code" value={project.assetCode} />
                            <DetailRow label="Asset Name" value={project.assetName} />
                            {project.taskToDo && (
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-siloam-text-secondary mb-1">Task to Do</label>
                                    <p className="text-sm text-siloam-text-primary">{project.taskToDo}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Dates */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Dates</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Target Start" value={project.targetStart} />
                            <DetailRow label="End Date" value={project.endDate} />
                            <DetailRow label="Target Budget Start" value={project.targetBudgetStart} />
                        </div>
                    </section>

                    {/* Budget */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Budget</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Budget Plan" value={formatCurrency(project.budgetPlan)} />
                            <DetailRow label="Budget Carry Forward" value={formatCurrency(project.budgetCarryForward)} />
                            <DetailRow label="Budget Allocated" value={formatCurrency(project.budgetAllocated)} />
                            <DetailRow label="Approved Budget" value={formatCurrency(project.approvedBudget)} />
                            <DetailRow label="Consumed Budget" value={formatCurrency(project.consumedBudget)} />
                            <DetailRow label="Revenue Projection" value={formatCurrency(project.revenueProjection)} />
                            <DetailRow label="Budget Revenue Permonth" value={formatCurrency(project.budgetRevenuePermonth ?? 0)} />
                        </div>
                    </section>

                    {/* Classification */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Classification</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Budget Category" value={categoryName} />
                            <DetailRow label="Priority" value={priorityName} />
                            <DetailRow label="Type" value={typeLabel} />
                            <DetailRow label="Status" value={statusLabel} />
                            <DetailRow label="Plan" value={project.plan} />
                            <DetailRow label="Completion Rate" value={project.completionRate != null ? `${project.completionRate}%` : '—'} />
                        </div>
                    </section>

                    {/* Flags & summary */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Summary</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Number of Assets" value={project.assets?.length ?? 0} />
                            {project.isRoutineAssetAggregator != null && (
                                <DetailRow label="Routine Asset Aggregator" value={project.isRoutineAssetAggregator ? 'Yes' : 'No'} />
                            )}
                            {project.isPipelineProject != null && (
                                <DetailRow label="Pipeline Project" value={project.isPipelineProject ? 'Yes' : 'No'} />
                            )}
                            {project.stage != null && <DetailRow label="Stage" value={project.stage} />}
                        </div>
                    </section>

                    {/* Category budget plan (if any) */}
                    {project.categoryBudgetPlan && Object.keys(project.categoryBudgetPlan).length > 0 && (
                        <section>
                            <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Category Budget Plan</h4>
                            <div className="space-y-2">
                                {Object.entries(project.categoryBudgetPlan).map(([catId, amount]) => (
                                    <div key={catId} className="flex justify-between items-center py-1 border-b border-siloam-border/50">
                                        <span className="text-sm text-siloam-text-secondary">Category {catId}</span>
                                        <span className="text-sm font-semibold text-siloam-text-primary">{formatCurrency(amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                <div className="flex-shrink-0 px-6 py-4 border-t border-siloam-border flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
ProjectDetailViewModal.displayName = 'ProjectDetailViewModal';
