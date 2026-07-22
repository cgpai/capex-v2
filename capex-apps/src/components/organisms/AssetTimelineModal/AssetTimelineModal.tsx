import React, { useState, useEffect, useMemo } from 'react';
import { EnrichedAsset, WorkflowSet, Task, AssetTaskStatus } from '../../../types';
import * as configService from '../../../services/configService';
import * as taskService from '../../../services/taskService';
import { formatCurrency } from '../../../lib/formatter';

interface TimelineRow {
    taskName: string;
    planDate: string;
    rescheduleDate: string;
    actualDate: string;
    projectionDate: string;
    variance: number | null;
}

const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '–';
    return new Date(dateString).toLocaleDateString('en-CA'); // YYYY-MM-DD
};

const VarianceIndicator: React.FC<{ variance: number | null }> = ({ variance }) => {
    if (variance === null) return <span className="text-siloam-text-secondary">N/A</span>;
    if (variance > 0) return <span className="text-siloam-green font-semibold">+{variance}d</span>;
    if (variance < 0) return <span className="text-danger font-semibold">{variance}d</span>;
    return <span className="text-siloam-text-primary font-semibold">0d</span>;
};


interface AssetTimelineModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: EnrichedAsset | null;
}

export const AssetTimelineModal: React.FC<AssetTimelineModalProps> = ({ isOpen, onClose, asset }) => {
    const [timelineData, setTimelineData] = useState<TimelineRow[]>([]);
    const [projectedEndDate, setProjectedEndDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !asset || !asset.workflowSetId) {
            setTimelineData([]);
            return;
        }

        const generateTimeline = async () => {
            setLoading(true);
            try {
                const [allWorkflows, allTasks, statuses] = await Promise.all([
                    configService.getAllWorkflowSets(),
                    configService.getAllTasks(),
                    taskService.getAssetTaskStatusesForAsset(asset.id),
                ]);

                const workflow = allWorkflows.find(w => w.id === asset.workflowSetId);
                if (!workflow) return;

                const planDates = taskService.calculatePlanDates(workflow, asset.endTargetDate);
                const projectionDates = taskService.calculateProjectionDates(workflow, statuses);

                const statusMap = new Map(statuses.map(s => [s.taskId, s]));

                const rows: TimelineRow[] = workflow.steps
                    .sort((a, b) => a.order - b.order)
                    .map(step => {
                        const task = allTasks.find(t => t.id === step.taskId);
                        const status = statusMap.get(step.taskId);
                        const actualDate = status?.completedAt;
                        const projectionDate = projectionDates.get(String(step.taskId));
                        
                        let variance: number | null = null;
                        if (actualDate && projectionDate) {
                            const actual = new Date(actualDate);
                            const projection = new Date(projectionDate);
                            actual.setHours(0,0,0,0);
                            projection.setHours(0,0,0,0);
                            const diffTime = projection.getTime() - actual.getTime();
                            variance = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        }

                        return {
                            taskName: task?.name || 'Unknown Task',
                            planDate: planDates.get(step.taskId) || '',
                            rescheduleDate: status?.rescheduledEndDate || '',
                            actualDate: actualDate || '',
                            projectionDate: projectionDate || '',
                            variance,
                        };
                    });
                
                setTimelineData(rows);

                const lastStep = workflow.steps.sort((a,b) => b.order - a.order)[0];
                if (lastStep) {
                    setProjectedEndDate(projectionDates.get(String(lastStep.taskId)) || null);
                }

            } catch (error) {
                console.error("Failed to generate timeline:", error);
            } finally {
                setLoading(false);
            }
        };

        generateTimeline();
    }, [isOpen, asset]);

    const overallVariance = useMemo(() => {
        if (!projectedEndDate || !asset?.endTargetDate) return null;
        const projected = new Date(projectedEndDate);
        const target = new Date(asset.endTargetDate);
        projected.setHours(0,0,0,0);
        target.setHours(0,0,0,0);
        const diffTime = target.getTime() - projected.getTime();
        return Math.round(diffTime / (1000 * 60 * 60 * 24));
    }, [projectedEndDate, asset?.endTargetDate]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">Asset Timeline: {asset?.assetName}</h3>
                        <p className="text-sm text-siloam-text-secondary">Based on workflow: {asset?.workflowSetId}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {loading ? <div className="flex-1 text-center py-10">Calculating timeline...</div> : (
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm table-fixed">
                            <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 font-semibold w-2/5">Task</th>
                                    <th className="px-4 py-3 font-semibold">Plan Date</th>
                                    <th className="px-4 py-3 font-semibold">Reschedule</th>
                                    <th className="px-4 py-3 font-semibold">Actual Date</th>
                                    <th className="px-4 py-3 font-semibold">Projection Date</th>
                                    <th className="px-4 py-3 font-semibold">Schedule Variance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timelineData.map((row, index) => (
                                    <tr key={index} className="border-b border-siloam-border hover:bg-siloam-bg/50">
                                        <td className="px-4 py-3 font-medium">{row.taskName}</td>
                                        <td className="px-4 py-3 font-mono">{formatDate(row.planDate)}</td>
                                        <td className="px-4 py-3 font-mono text-yellow-600 font-semibold">{formatDate(row.rescheduleDate)}</td>
                                        <td className="px-4 py-3 font-mono">{formatDate(row.actualDate)}</td>
                                        <td className="px-4 py-3 font-mono">{formatDate(row.projectionDate)}</td>
                                        <td className="px-4 py-3 font-mono"><VarianceIndicator variance={row.variance} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-siloam-border grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-sm text-siloam-text-secondary font-semibold">End Target Date</p>
                        <p className="text-lg font-bold font-mono">{formatDate(asset?.endTargetDate)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-siloam-text-secondary font-semibold">Projected End Date</p>
                        <p className="text-lg font-bold font-mono">{formatDate(projectedEndDate)}</p>
                    </div>
                     <div>
                        <p className="text-sm text-siloam-text-secondary font-semibold">Overall Variance</p>
                        <p className="text-lg font-bold font-mono"><VarianceIndicator variance={overallVariance} /></p>
                    </div>
                </div>

            </div>
        </div>
    );
};
