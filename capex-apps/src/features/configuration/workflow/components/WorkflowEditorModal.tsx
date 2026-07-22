'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Task, UserRole, WorkflowSet, WorkflowStep, SYSTEM_TRIGGER_EVENTS } from '@/types';
import { NumericInput } from '@/components/atoms/NumericInput/NumericInput';

export const WorkflowEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (workflow: WorkflowSet) => Promise<void>;
    workflow: WorkflowSet | null;
    allTasks: Task[];
    allRoles: UserRole[];
    allWorkflows: WorkflowSet[];
}> = ({ isOpen, onClose, onSave, workflow: initialWorkflow, allTasks, allRoles, allWorkflows }) => {
    const [workflow, setWorkflow] = useState<WorkflowSet | null>(initialWorkflow);
    const [error, setError] = useState('');
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const draggedItem = useRef<WorkflowStep | null>(null);

    useEffect(() => {
        setWorkflow(initialWorkflow ? JSON.parse(JSON.stringify(initialWorkflow)) : { id: '', name: '', steps: [] });
        setError('');
    }, [initialWorkflow, isOpen]);

    const totalTaskScore = useMemo(() => {
        return workflow?.steps.reduce((sum, step) => sum + (step.taskScore || 0), 0) || 0;
    }, [workflow]);
    const workflowStepsSorted = useMemo(
        () => (workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : []),
        [workflow?.steps],
    );
    const taskNameById = useMemo(
        () => new Map(allTasks.map((task) => [task.id, task.name])),
        [allTasks],
    );
    const roleNameById = useMemo(
        () => new Map(allRoles.map((role) => [role.id, role.roleName])),
        [allRoles],
    );

    if (!isOpen || !workflow) return null;

    const availableTasks = allTasks.filter(t => !workflow.steps.some(s => s.taskId === t.id));

    const handleSave = async () => {
        setError('');
        if (!workflow.name) {
            setError('Workflow name is required.');
            return;
        }
        if (allWorkflows.some(w => w.name === workflow.name && w.id !== workflow.id)) {
            setError('Workflow name already exists.');
            return;
        }
        if (totalTaskScore !== 100) {
            setError(`Total task score must be 100%, but it is currently ${totalTaskScore}%.`);
            return;
        }
        try {
            await onSave(workflow);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save workflow.');
        }
    };

    const handleAddTask = (taskId: string) => {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;
        const newStep: WorkflowStep = { 
            taskId, 
            order: workflow.steps.length, 
            roleIds: [], 
            slaToComplete: task.slaToComplete,
            triggeringTaskIds: [],
            taskScore: 0,
        };
        setWorkflow({ ...workflow, steps: [...workflow.steps, newStep] });
    };

    const handleRemoveTask = (taskId: string) => {
        const newSteps = workflow.steps
            .filter(s => s.taskId !== taskId)
            .map((step, index) => ({ 
                ...step, 
                order: index,
                triggeringTaskIds: step.triggeringTaskIds.filter(id => id !== taskId)
            }));
        setWorkflow({ ...workflow, steps: newSteps });
    };

    const normId = (id: string | number | undefined) => (id == null ? '' : String(id));
    const updateStep = (taskId: string, updates: Partial<WorkflowStep>) => {
        const newSteps = workflow.steps.map(step =>
            normId(step.taskId) === normId(taskId) ? { ...step, ...updates } : step
        );
        setWorkflow({ ...workflow, steps: newSteps });
    };

    const handleToggleMilestone = (taskId: string, isMilestone: boolean) => {
        const step = workflow.steps.find(s => normId(s.taskId) === normId(taskId));
        if (!step) return;

        let milestoneScore: number | undefined;
        if (isMilestone) {
            const sortedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);
            const currentStepIndex = sortedSteps.findIndex(s => normId(s.taskId) === normId(taskId));
            const sumSoFar = sortedSteps
                .slice(0, currentStepIndex + 1)
                .reduce((sum, s) => sum + (s.taskScore ?? 0), 0);
            milestoneScore = Math.min(100, Math.max(0, sumSoFar));
        } else {
            milestoneScore = undefined;
        }
        updateStep(taskId, { milestoneScore });
    };

    const handleAddRole = (taskId: string, roleId: number) => {
        const step = workflow.steps.find(s => s.taskId === taskId);
        if (step && !step.roleIds.includes(roleId)) {
            updateStep(taskId, { roleIds: [...step.roleIds, roleId] });
        }
    };

    const handleRemoveRole = (taskId: string, roleId: number) => {
        const step = workflow.steps.find(s => s.taskId === taskId);
        if (step) {
             updateStep(taskId, { roleIds: step.roleIds.filter(id => id !== roleId) });
        }
    };
    
    const availableRolesForStep = (step: WorkflowStep): UserRole[] => {
        return allRoles.filter(role => !step.roleIds.includes(role.id));
    };
    
    const handleAddTrigger = (taskId: string, triggerTaskId: string) => {
        const step = workflow.steps.find(s => s.taskId === taskId);
        if (step && !step.triggeringTaskIds.includes(triggerTaskId)) {
             updateStep(taskId, { triggeringTaskIds: [...step.triggeringTaskIds, triggerTaskId] });
        }
    };

    const handleRemoveTrigger = (taskId: string, triggerTaskId: string) => {
         const step = workflow.steps.find(s => s.taskId === taskId);
        if (step) {
            updateStep(taskId, { triggeringTaskIds: step.triggeringTaskIds.filter(id => id !== triggerTaskId) });
        }
    };

    const availableTriggersForStep = (step: WorkflowStep): Task[] => {
        return allTasks.filter(task =>
            workflow.steps.some(s => s.taskId === task.id) &&
            step.taskId !== task.id &&
            !step.triggeringTaskIds.includes(task.id)
        );
    };

    const handleDragStart = (e: React.DragEvent, step: WorkflowStep) => {
        draggedItem.current = step;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('opacity-50');
    };
    
    const handleDragEnd = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('opacity-50');
        draggedItem.current = null;
        setDropIndex(null);
    };

    const handleDragOver = (e: React.DragEvent, targetOrder: number) => {
        e.preventDefault();
        if(targetOrder !== dropIndex) setDropIndex(targetOrder);
    };
    
    const handleDragLeave = (e: React.DragEvent) => {
       e.preventDefault();
       setDropIndex(null);
    };

    const handleDrop = (e: React.DragEvent, targetOrder: number) => {
        e.preventDefault();
        setDropIndex(null);
        if (!draggedItem.current) return;

        const currentSteps = [...workflow.steps];
        const draggedIndex = currentSteps.findIndex(s => s.order === draggedItem.current!.order);
        
        if (draggedIndex === -1) return;

        const [removed] = currentSteps.splice(draggedIndex, 1);
        currentSteps.splice(targetOrder, 0, removed);

        const reorderedSteps = currentSteps.map((step, index) => ({ ...step, order: index }));
        setWorkflow({ ...workflow, steps: reorderedSteps });
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-5xl max-h-[90vh] flex flex-col">
                <h3 className="text-lg font-bold mb-2">{workflow.id ? 'Edit Workflow' : 'Create New Workflow'}</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Workflow Name</label>
                        <input
                            type="text"
                            value={workflow.name}
                            onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        />
                    </div>
                     <div className={`p-2 rounded-lg text-center font-bold ${totalTaskScore === 100 ? 'bg-siloam-green/10 text-siloam-green' : 'bg-danger/10 text-danger'}`}>
                        Total Task Score: {totalTaskScore}% (must be 100%)
                    </div>
                </div>
                {error && <p className="text-sm text-danger mb-2">{error}</p>}
                <div className="flex-1 grid grid-cols-2 gap-6 overflow-y-auto pr-2">
                    {/* Assigned Tasks */}
                    <div className="bg-siloam-bg p-4 rounded-lg" onDragLeave={handleDragLeave}>
                        <h4 className="font-semibold mb-2">Assigned Tasks (Drag to reorder)</h4>
                        <ul className="space-y-1">
                            {workflowStepsSorted.map(step => (
                                <React.Fragment key={step.taskId}>
                                     {dropIndex === step.order && (
                                        <li className="h-1 bg-siloam-blue/50 rounded-lg" />
                                     )}
                                    <li
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, step)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => handleDragOver(e, step.order)}
                                        onDrop={(e) => handleDrop(e, step.order)}
                                        className="bg-siloam-surface p-3 rounded-lg border border-siloam-border cursor-move transition-all"
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="font-medium">{taskNameById.get(step.taskId) || 'Unknown Task'}</p>
                                            <button onClick={() => handleRemoveTask(step.taskId)} className="text-danger text-sm">Remove</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-2">
                                            <label className="text-xs flex items-center gap-2">SLA (days):
                                                <NumericInput min={0} value={step.slaToComplete} onClick={(e) => e.stopPropagation()}
                                                    onValueChange={(val) => updateStep(step.taskId, { slaToComplete: val })}
                                                    allowDecimal={false} align="left"
                                                    className="w-16 text-xs p-1 rounded border border-siloam-border bg-white" />
                                            </label>
                                            <label className="text-xs flex items-center gap-2">Task Score (%):
                                                <NumericInput min={0} max={100} value={step.taskScore} onClick={(e) => e.stopPropagation()}
                                                    onValueChange={(val) => updateStep(step.taskId, { taskScore: val })}
                                                    allowDecimal={false} align="left"
                                                    className="w-16 text-xs p-1 rounded border border-siloam-border bg-white" />
                                            </label>
                                        </div>
                                         <div className="mt-2 border-t pt-2 border-siloam-border/50" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center gap-4">
                                                <label className="text-xs flex items-center gap-2 font-medium cursor-pointer">
                                                    <input type="checkbox" checked={step.milestoneScore !== undefined && step.milestoneScore !== null}
                                                        onChange={(e) => handleToggleMilestone(step.taskId, e.target.checked)}
                                                        className="h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue bg-white" />
                                                    Is Milestone?
                                                </label>
                                                {(step.milestoneScore !== undefined && step.milestoneScore !== null) && (
                                                    <label className="text-xs flex items-center gap-2">Milestone Score (%):
                                                        <NumericInput min={0} max={100} value={step.milestoneScore ?? 0}
                                                            onValueChange={(val) => updateStep(step.taskId, { milestoneScore: val })}
                                                            allowDecimal={false} align="left"
                                                            className="w-16 text-xs p-1 rounded border border-siloam-border bg-white" />
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2">
                                            <p className="text-xs font-medium text-siloam-text-secondary mb-1">Assigned Roles:</p>
                                            <div className="flex flex-wrap gap-1 items-center">
                                                {step.roleIds.map(roleId => {
                                                    return (
                                                        <span key={roleId} className="bg-siloam-blue/10 text-siloam-blue text-xs font-semibold px-2 py-1 rounded-full flex items-center">
                                                            {roleNameById.get(roleId) || 'Unknown Role'}
                                                            <button onClick={() => handleRemoveRole(step.taskId, roleId)} className="ml-1.5 text-siloam-blue hover:text-danger font-bold">&times;</button>
                                                        </span>
                                                    );
                                                })}
                                                <select onChange={(e) => handleAddRole(step.taskId, parseInt(e.target.value, 10))} value="" className="text-xs p-1 rounded border border-siloam-border bg-siloam-sidebar" onClick={(e) => e.stopPropagation()}>
                                                    <option value="" disabled>+ Add Role</option>
                                                    {availableRolesForStep(step).map(role => (
                                                        <option key={role.id} value={role.id}>{role.roleName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                         <div className="mt-3 border-t border-siloam-border pt-2">
                                            <p className="text-xs font-medium text-siloam-text-secondary mb-1">
                                                Triggers (pengingat My Task — task tampil saat prasyarat selesai; bukan pengunci untuk PMO/Super Admin):
                                            </p>
                                            <p className="text-xs text-siloam-text-secondary mb-2 italic">
                                                Untuk automation event sistem (mis.{' '}
                                                {SYSTEM_TRIGGER_EVENTS.find((e) => e.value === 'FS_APPROVAL')?.label ?? 'When FS Approval'}
                                                ), aktifkan <strong>Is System-Triggered Task</strong> di Task Master lalu pilih Trigger Event.
                                            </p>
                                            <div className="flex flex-wrap gap-1 items-center">
                                                {step.triggeringTaskIds.length === 0 && <span className="text-xs text-siloam-text-secondary italic">None (siap setelah step sebelumnya)</span>}
                                                {step.triggeringTaskIds.map(triggerId => {
                                                    return (
                                                        <span key={triggerId} className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded-full flex items-center">
                                                            {taskNameById.get(triggerId) || 'Unknown Task'}
                                                            <button onClick={() => handleRemoveTrigger(step.taskId, triggerId)} className="ml-1.5 text-green-800 hover:text-danger font-bold">&times;</button>
                                                        </span>
                                                    );
                                                })}
                                                <select onChange={(e) => handleAddTrigger(step.taskId, e.target.value)} value="" className="text-xs p-1 rounded border border-siloam-border bg-siloam-sidebar" onClick={(e) => e.stopPropagation()}>
                                                    <option value="" disabled>+ Add Trigger</option>
                                                    {availableTriggersForStep(step).map(task => (
                                                        <option key={task.id} value={task.id}>{task.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </li>
                                </React.Fragment>
                            ))}
                            {/* Handle drop at the end of the list */}
                            <div className="h-2" onDragOver={(e) => handleDragOver(e, workflow.steps.length)} onDrop={(e) => handleDrop(e, workflow.steps.length)}>
                                {dropIndex === workflow.steps.length && (
                                    <div className="h-full bg-siloam-blue/50 rounded-lg" />
                                )}
                            </div>
                        </ul>
                    </div>

                    {/* Available Tasks */}
                    <div className="bg-siloam-bg p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">Available Tasks</h4>
                        <ul className="space-y-2">
                            {availableTasks.map(task => (
                                <li key={task.id} className="bg-siloam-surface p-2 rounded-lg border border-siloam-border flex items-center justify-between">
                                    <p className="font-medium">{task.name}</p>
                                    <button onClick={() => handleAddTask(task.id)} className="text-siloam-blue ml-2">Add</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90">Save Workflow</button>
                </div>
            </div>
        </div>
    );
};
