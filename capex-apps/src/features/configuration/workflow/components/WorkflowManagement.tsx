'use client';

import React, { useState, Suspense, lazy } from 'react';
import {
  User,
  UserRole,
  Task,
  WorkflowSet,
  AssetTypeConfig,
  AssetTypeGroupConfig,
} from '@/types';
import * as configService from '@/services/configService';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
} from '@/services/configurationCrudApi';
import { prepareTaskTriggerEventsForSave, formatTaskTriggerEventLabels } from '@/lib/systemTriggerEvents';
import { dispatchConfigurationMasterChanged } from '@/lib/configurationCacheSync';
import { ConfigurationTabSkeleton } from '@/features/configuration/core/ConfigurationPageShell';
import type { AssetTypeMasterPatch } from '@/components/organisms/AssetTypeManagement/AssetTypeManagement';
import { TaskEditorModal } from './TaskEditorModal';
import { WorkflowEditorModal } from './WorkflowEditorModal';
import { WorkflowSpreadsheetPanel } from './WorkflowSpreadsheetPanel';

const AssetTypeManagement = lazy(() =>
  import('@/components/organisms/AssetTypeManagement/AssetTypeManagement').then((m) => ({
    default: m.AssetTypeManagement,
  })),
);

export { TaskEditorModal } from './TaskEditorModal';
export { WorkflowEditorModal } from './WorkflowEditorModal';

type WorkflowEditMode = 'standard' | 'spreadsheet';

export const WorkflowManagement: React.FC<{
  tasks: Task[];
  workflows: WorkflowSet[];
  roles: UserRole[];
  assetTypes: AssetTypeConfig[];
  assetTypeGroups: AssetTypeGroupConfig[];
  onWorkflowConfigChange: () => void;
  onAssetTypesPatched: (patch: AssetTypeMasterPatch) => void;
  currentUser: User;
}> = ({
  tasks,
  workflows,
  roles,
  assetTypes,
  assetTypeGroups,
  onWorkflowConfigChange,
  onAssetTypesPatched,
  currentUser,
}) => {
  const [editMode, setEditMode] = useState<WorkflowEditMode>('standard');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowSet | null>(null);

  const handleSaveTask = async (task: Task) => {
    const taskToSave = {
      ...prepareTaskTriggerEventsForSave(task),
      id: task.id || `task-${Date.now()}`,
    } as Task;
    await saveConfigViaBeOrFallback('task', taskToSave);
    setIsTaskModalOpen(false);
    setEditingTask(null);
    onWorkflowConfigChange();
  };

  const handleDeleteTask = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this task? It might be used in workflows.')) {
      await deleteConfigViaBeOrFallback('task', id);
      onWorkflowConfigChange();
    }
  };

  const handleSaveWorkflow = async (workflow: WorkflowSet) => {
    const workflowToSave = { ...workflow, id: workflow.id || `wf-${Date.now()}` };
    await configService.saveWorkflowSet(workflowToSave);
    dispatchConfigurationMasterChanged(['workflows']);
    setIsWorkflowModalOpen(false);
    setEditingWorkflow(null);
    onWorkflowConfigChange();
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this workflow?')) {
      await configService.deleteWorkflowSet(id);
      dispatchConfigurationMasterChanged(['workflows']);
      onWorkflowConfigChange();
    }
  };

  return (
    <div className="space-y-8">
      <Suspense fallback={<ConfigurationTabSkeleton rows={3} />}>
        <AssetTypeManagement
          assetTypes={assetTypes}
          assetTypeGroups={assetTypeGroups}
          workflows={workflows}
          onAssetTypesPatched={onAssetTypesPatched}
          currentUser={currentUser}
        />
      </Suspense>

      <div className="flex flex-wrap items-center gap-2 border-b border-siloam-border pb-4">
        <span className="text-sm font-medium text-siloam-text-secondary mr-2">Mode edit:</span>
        <button
          type="button"
          onClick={() => setEditMode('standard')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
            editMode === 'standard'
              ? 'bg-siloam-blue text-white shadow-soft'
              : 'bg-siloam-surface border border-siloam-border text-siloam-text-secondary hover:bg-siloam-bg'
          }`}
        >
          Standar
        </button>
        <button
          type="button"
          onClick={() => setEditMode('spreadsheet')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
            editMode === 'spreadsheet'
              ? 'bg-siloam-blue text-white shadow-soft'
              : 'bg-siloam-surface border border-siloam-border text-siloam-text-secondary hover:bg-siloam-bg'
          }`}
        >
          Spreadsheet Quick Edit
        </button>
      </div>

      {editMode === 'standard' ? (
        <>
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Task Master</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setIsTaskModalOpen(true);
                }}
                className="bg-siloam-blue text-white px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-blue/90"
              >
                + New Task
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">SLA (days)</th>
                  <th className="px-4 py-3">System Trigger</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="bg-siloam-surface border-b border-siloam-border hover:bg-siloam-bg">
                    <td className="px-4 py-3 font-medium">{task.name}</td>
                    <td className="px-4 py-3">{task.description}</td>
                    <td className="px-4 py-3">{task.slaToComplete}</td>
                    <td className="px-4 py-3">
                      {task.isSystemTriggered ? formatTaskTriggerEventLabels(task) : '—'}
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(task);
                          setIsTaskModalOpen(true);
                        }}
                        className="text-siloam-blue hover:underline"
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDeleteTask(task.id)} className="text-danger hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Workflow Sets</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingWorkflow(null);
                  setIsWorkflowModalOpen(true);
                }}
                className="bg-siloam-blue text-white px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-blue/90"
              >
                + New Workflow
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Steps</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.id} className="bg-siloam-surface border-b border-siloam-border hover:bg-siloam-bg">
                    <td className="px-4 py-3 font-medium">{wf.name}</td>
                    <td className="px-4 py-3">{wf.steps.length}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWorkflow(wf);
                          setIsWorkflowModalOpen(true);
                        }}
                        className="text-siloam-blue hover:underline"
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDeleteWorkflow(wf.id)} className="text-danger hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <WorkflowSpreadsheetPanel
          tasks={tasks}
          workflows={workflows}
          roles={roles}
          onSaved={onWorkflowConfigChange}
          onEditTaskDetail={(task) => {
            setEditingTask(task);
            setIsTaskModalOpen(true);
          }}
          onEditWorkflowDetail={(workflow) => {
            setEditingWorkflow(workflow);
            setIsWorkflowModalOpen(true);
          }}
        />
      )}

      <TaskEditorModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        task={editingTask}
        allTasks={tasks}
      />

      <WorkflowEditorModal
        isOpen={isWorkflowModalOpen}
        onClose={() => setIsWorkflowModalOpen(false)}
        onSave={handleSaveWorkflow}
        workflow={editingWorkflow}
        allTasks={tasks}
        allRoles={roles}
        allWorkflows={workflows}
      />
    </div>
  );
};
