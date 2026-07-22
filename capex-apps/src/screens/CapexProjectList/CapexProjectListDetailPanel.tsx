'use client';

import React, { lazy, memo, Suspense } from 'react';
import type {
  Asset,
  AssetTypeConfig,
  BudgetCategoryConfig,
  EnrichedAsset,
  MOM,
  Project,
  ProjectPriorityConfig,
  User,
  UserRole,
  WorkflowSet,
} from '@/types';
import type { WhatsAppReminderPayload } from '@/lib/whatsappReminder';
import { userCanEditProjectPriority } from '@/lib/projectPriorityPolicy';
import type { ProjectListTriggerTaskSaveParams } from './handleProjectListTriggerTaskSave';

const AssetTaskTimelineLazy = lazy(() =>
  import('@/components/organisms/AssetTaskTimeline/AssetTaskTimeline').then((m) => ({
    default: m.AssetTaskTimeline,
  })),
);
const AddMomModalLazy = lazy(() =>
  import('@/components/organisms/AddMomModal/AddMomModal').then((m) => ({
    default: m.AddMomModal,
  })),
);
const AddAdhocTaskModalLazy = lazy(() =>
  import('@/components/organisms/AddAdhocTaskModal/AddAdhocTaskModal').then((m) => ({
    default: m.AddAdhocTaskModal,
  })),
);
const AssetTimelineModalLazy = lazy(() =>
  import('@/components/organisms/AssetTimelineModal/AssetTimelineModal').then((m) => ({
    default: m.AssetTimelineModal,
  })),
);
const ProjectSummaryModalLazy = lazy(() =>
  import('@/components/organisms/AIAnalysisModal/AIAnalysisModal').then((m) => ({
    default: m.ProjectSummaryModal,
  })),
);
const ProjectEditorModalLazy = lazy(() =>
  import('@/components/organisms/ProjectEditorModal/ProjectEditorModal').then((m) => ({
    default: m.ProjectEditorModal,
  })),
);
const AssetDetailEditorModalLazy = lazy(() =>
  import('@/components/organisms/AssetDetailEditorModal/AssetDetailEditorModal').then((m) => ({
    default: m.AssetDetailEditorModal,
  })),
);

const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const BackIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path
      fillRule="evenodd"
      d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm14.25 6a.75.75 0 01-.22.53l-2.25 2.25a.75.75 0 11-1.06-1.06L15.44 12l-1.72-1.72a.75.75 0 111.06-1.06l2.25 2.25c.141.14.22.331.22.53zm-10.28 0a.75.75 0 01.22-.53l2.25-2.25a.75.75 0 111.06 1.06L8.56 12l1.72 1.72a.75.75 0 11-1.06 1.06l-2.25-2.25a.75.75 0 01-.22-.53z"
      clipRule="evenodd"
    />
  </svg>
);

export type CapexProjectListDetailPanelProps = {
  selectedAsset: EnrichedAsset | null;
  selectedProject: Project | null;
  currentUser: User;
  allRoles: UserRole[];
  allWorkflows: WorkflowSet[];
  masterUsers: User[];
  allCategories: BudgetCategoryConfig[];
  allAssetTypes: AssetTypeConfig[];
  priorities: ProjectPriorityConfig[];
  timelineRefreshNonce: number;
  isMomModalOpen: boolean;
  momEditTarget: MOM | null;
  isAdhocTaskModalOpen: boolean;
  isTimelineModalOpen: boolean;
  isActionPopupOpen: boolean;
  isProjectEditorOpen: boolean;
  isAssetEditorOpen: boolean;
  isSummaryModalOpen: boolean;
  canManageAssetTasks: boolean;
  canShowActionMenu: boolean;
  canEditProjectMeta: boolean;
  canEditAssetMeta: boolean;
  canEditPriorityOnProject: boolean;
  onClose: () => void;
  onOpenTimelineModal: () => void;
  onOpenSummaryModal: () => void;
  onOpenActionPopup: () => void;
  onCloseActionPopup: () => void;
  onOpenMomModal: () => void;
  onCloseMomModal: () => void;
  onOpenAdhocModal: () => void;
  onCloseAdhocModal: () => void;
  onCloseTimelineModal: () => void;
  onCloseSummaryModal: () => void;
  onCloseProjectEditor: () => void;
  onCloseAssetEditor: () => void;
  onTaskUpdate: (assetId?: string) => void;
  onWhatsAppReminder: (payload: WhatsAppReminderPayload) => void;
  onMomAdded: () => void;
  onTaskAdded: () => void;
  onEditMom: (mom: MOM) => void;
  onAddMomFromSummary: () => void;
  onQuickEditTargetDate: () => void;
  onQuickEditPriority: () => void;
  onOpenProjectEditor: () => void;
  onOpenAssetEditor: () => void;
  onSaveProject: (project: Project) => void;
  onSaveAsset: (asset: Asset) => void;
  onTriggerDataSave?: (
    params: Omit<ProjectListTriggerTaskSaveParams, 'currentUser' | 'periodName'>,
  ) => Promise<void>;
};

function CapexProjectListDetailPanelInner({
  selectedAsset,
  selectedProject,
  currentUser,
  allRoles,
  allWorkflows,
  masterUsers,
  allCategories,
  allAssetTypes,
  priorities,
  timelineRefreshNonce,
  isMomModalOpen,
  momEditTarget,
  isAdhocTaskModalOpen,
  isTimelineModalOpen,
  isActionPopupOpen,
  isProjectEditorOpen,
  isAssetEditorOpen,
  isSummaryModalOpen,
  canManageAssetTasks,
  canShowActionMenu,
  canEditProjectMeta,
  canEditAssetMeta,
  canEditPriorityOnProject,
  onClose,
  onOpenTimelineModal,
  onOpenSummaryModal,
  onOpenActionPopup,
  onCloseActionPopup,
  onOpenMomModal,
  onCloseMomModal,
  onOpenAdhocModal,
  onCloseAdhocModal,
  onCloseTimelineModal,
  onCloseSummaryModal,
  onCloseProjectEditor,
  onCloseAssetEditor,
  onTaskUpdate,
  onWhatsAppReminder,
  onMomAdded,
  onTaskAdded,
  onEditMom,
  onAddMomFromSummary,
  onQuickEditTargetDate,
  onQuickEditPriority,
  onOpenProjectEditor,
  onOpenAssetEditor,
  onSaveProject,
  onSaveAsset,
  onTriggerDataSave,
}: CapexProjectListDetailPanelProps) {
  if (!selectedAsset) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 md:p-6 border-b border-siloam-border flex-shrink-0">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition md:hidden"
              title="Back to list"
            >
              <BackIcon />
            </button>
            <div className="overflow-hidden">
              <h2
                className="text-xl md:text-2xl font-bold text-siloam-text-primary truncate"
                title={selectedAsset.assetName}
              >
                {selectedAsset.assetName}
              </h2>
              <p className="text-sm text-siloam-text-secondary truncate">
                {selectedAsset.assetCode} - {selectedAsset.projectName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition hidden md:block"
            title="Close Panel"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex items-center space-x-2 mt-4 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={onOpenTimelineModal}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-purple-700 transition whitespace-nowrap"
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={onOpenSummaryModal}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:shadow-lg transition whitespace-nowrap flex items-center gap-1"
          >
            <InfoIcon /> Ringkasan Proyek
          </button>
          {canShowActionMenu ? (
            <div className="relative">
              <button
                type="button"
                data-tour="cpl-detail-actions"
                onClick={onOpenActionPopup}
                className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-600 transition whitespace-nowrap"
                aria-expanded={isActionPopupOpen}
                aria-haspopup="dialog"
              >
                Aksi
              </button>
            </div>
          ) : null}
          {canManageAssetTasks ? (
            <>
              <button
                type="button"
                onClick={onOpenMomModal}
                className="bg-siloam-sidebar text-siloam-text-primary px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-border transition whitespace-nowrap"
              >
                Add MOM
              </button>
              <button
                type="button"
                onClick={onOpenAdhocModal}
                className="bg-siloam-blue text-white px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-blue/90 transition whitespace-nowrap"
              >
                Add Adhoc Task
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="p-6 text-sm text-siloam-text-secondary">Memuat timeline tugas…</div>
          }
        >
          <AssetTaskTimelineLazy
            key={`${selectedAsset.id}-${timelineRefreshNonce}`}
            asset={selectedAsset}
            project={selectedProject}
            currentUser={currentUser}
            allRoles={allRoles}
            onTaskUpdate={onTaskUpdate}
            onWhatsAppReminder={onWhatsAppReminder}
            onTriggerDataSave={onTriggerDataSave}
          />
        </Suspense>
      </div>

      {isMomModalOpen ? (
        <Suspense fallback={null}>
          <AddMomModalLazy
            isOpen={isMomModalOpen}
            onClose={onCloseMomModal}
            assetId={selectedAsset.id}
            asset={selectedAsset}
            project={selectedProject}
            currentUser={currentUser}
            editingMom={momEditTarget}
            onMomAdded={onMomAdded}
          />
        </Suspense>
      ) : null}

      {isAdhocTaskModalOpen ? (
        <Suspense fallback={null}>
          <AddAdhocTaskModalLazy
            isOpen={isAdhocTaskModalOpen}
            onClose={onCloseAdhocModal}
            assetId={selectedAsset.id}
            asset={selectedAsset}
            project={selectedProject}
            currentUser={currentUser}
            allUsers={masterUsers}
            onTaskAdded={onTaskAdded}
          />
        </Suspense>
      ) : null}

      {isTimelineModalOpen ? (
        <Suspense fallback={null}>
          <AssetTimelineModalLazy
            isOpen={isTimelineModalOpen}
            onClose={onCloseTimelineModal}
            asset={selectedAsset}
          />
        </Suspense>
      ) : null}

      {isSummaryModalOpen ? (
        <Suspense fallback={null}>
          <ProjectSummaryModalLazy
            isOpen={isSummaryModalOpen}
            onClose={onCloseSummaryModal}
            asset={selectedAsset}
            project={selectedProject}
            allWorkflows={allWorkflows}
            currentUser={currentUser}
            onAddMom={onAddMomFromSummary}
            onEditMom={onEditMom}
          />
        </Suspense>
      ) : null}

      {isActionPopupOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Menu aksi asset"
          onClick={onCloseActionPopup}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-siloam-border bg-siloam-surface shadow-soft p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-siloam-text-primary">Aksi</h3>
              <button
                type="button"
                onClick={onCloseActionPopup}
                className="px-2 py-1 text-sm rounded hover:bg-siloam-bg"
              >
                Tutup
              </button>
            </div>
            <div className="space-y-2">
              {canEditAssetMeta ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActionPopup();
                    void onQuickEditTargetDate();
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded border border-siloam-border hover:bg-siloam-bg"
                >
                  Edit Target Date
                </button>
              ) : null}
              {canEditPriorityOnProject ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActionPopup();
                    void onQuickEditPriority();
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded border border-siloam-border hover:bg-siloam-bg"
                >
                  Edit Priority
                </button>
              ) : null}
              {canEditProjectMeta ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActionPopup();
                    onOpenProjectEditor();
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded border border-siloam-border hover:bg-siloam-bg"
                >
                  Edit Project
                </button>
              ) : null}
              {canEditAssetMeta ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActionPopup();
                    onOpenAssetEditor();
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded border border-siloam-border hover:bg-siloam-bg"
                >
                  Edit Asset
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isProjectEditorOpen ? (
        <Suspense fallback={null}>
          <ProjectEditorModalLazy
            isOpen={isProjectEditorOpen}
            onClose={onCloseProjectEditor}
            onSave={onSaveProject}
            project={selectedProject}
            allCategories={allCategories}
            allPriorities={priorities}
            allUsers={masterUsers}
            canEditPriority={userCanEditProjectPriority(currentUser)}
          />
        </Suspense>
      ) : null}

      {isAssetEditorOpen ? (
        <Suspense fallback={null}>
          <AssetDetailEditorModalLazy
            isOpen={isAssetEditorOpen}
            onClose={onCloseAssetEditor}
            onSave={onSaveAsset}
            asset={selectedAsset}
            project={selectedProject}
            allWorkflows={allWorkflows}
            allAssetTypes={allAssetTypes}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export const CapexProjectListDetailPanel = memo(CapexProjectListDetailPanelInner);
CapexProjectListDetailPanel.displayName = 'CapexProjectListDetailPanel';
