import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Project,
  Asset,
  WorkflowSet,
  AssetTypeConfig,
  AssetTaskStatus,
  BudgetCategoryConfig,
} from '../../../types';
import { SpreadsheetTable, SpreadsheetColumn } from '../SpreadsheetTable/SpreadsheetTable';
import * as configService from '../../../services/configService';
import { AssetDetailEditorModal } from '../AssetDetailEditorModal/AssetDetailEditorModal';
import { DeleteAssetConfirmModal } from '../DeleteAssetConfirmModal/DeleteAssetConfirmModal';
import * as taskService from '../../../services/taskService';
import {
  newAssetId,
  nextAssetCode,
  normalizeProjectAssets,
} from '../../../utils/assetCodeUtils';
import {
  activeAssetTypeOptions,
  applyAssetTypeToAsset,
  defaultRoutineAssetTypeId,
  resolveAssetTypeId,
  syncAssetsWithSelectedTypes,
} from '../../../utils/routineAssetTypeUtils';
import { sortAssetsByCode, filterAssets } from '../../../screens/BudgetHU/budgetHuHelpers';
import { useDebouncedValue } from '../../../screens/BudgetHU/useDebouncedValue';

const ASSET_SEARCH_DEBOUNCE_MS = 200;

interface AssetEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onAssetsChange: (updatedAssets: Asset[]) => void;
  isEditable: boolean;
  showToast: (message: string, type?: 'success' | 'error') => void;
  allWorkflows: WorkflowSet[];
  allAssetTypes: AssetTypeConfig[];
  activeCategories?: BudgetCategoryConfig[];
  periodName?: string;
  userId?: number;
  huId?: string | null;
  onUseExistingAsset?: (asset: Asset) => void;
}

export const AssetEditorModal: React.FC<AssetEditorModalProps> = ({
  isOpen,
  onClose,
  project,
  onAssetsChange,
  isEditable,
  showToast,
  allWorkflows,
  allAssetTypes,
  activeCategories = [],
  periodName = '',
  userId = 0,
  huId = null,
  onUseExistingAsset,
}) => {
  const [assets, setAssets] = useState<Asset[]>(project.assets);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [assetTaskStatuses, setAssetTaskStatuses] = useState<AssetTaskStatus[]>([]);
  const [allTasks, setAllTasks] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingDeleteCheck, setIsLoadingDeleteCheck] = useState(false);
  const [defaultWorkflowId, setDefaultWorkflowId] = useState<string>('');
  const [assetSearch, setAssetSearch] = useState('');
  const debouncedAssetSearch = useDebouncedValue(assetSearch, ASSET_SEARCH_DEBOUNCE_MS);
  /** Skip re-hydrating from parent when the change originated from this modal (prevents input reset). */
  const skipAssetsSyncRef = useRef(false);

  const assetDefaults = useMemo(
    () => ({
      budgetCategoryId:
        activeCategories[0]?.id || project.budgetCategoryId || 'cat-routine',
      workflowSetId: defaultWorkflowId || allWorkflows[0]?.id || '',
    }),
    [activeCategories, project.budgetCategoryId, defaultWorkflowId, allWorkflows],
  );

  const categoryOptions = useMemo(
    () => activeCategories.map((c) => ({ value: c.id, label: c.name })),
    [activeCategories],
  );

  const assetTypeOptions = useMemo(
    () => activeAssetTypeOptions(allAssetTypes),
    [allAssetTypes],
  );

  useEffect(() => {
    if (!isOpen) return;
    setAssetSearch('');
    if (skipAssetsSyncRef.current) {
      skipAssetsSyncRef.current = false;
      return;
    }
    setAssets(sortAssetsByCode(syncAssetsWithSelectedTypes(project.assets, allAssetTypes)));
    void configService.getAppConfig('defaultRoutineWorkflowId').then((cfg) => {
      if (cfg?.value) setDefaultWorkflowId(String(cfg.value));
    });
  }, [project.assets, isOpen, allAssetTypes]);

  const visibleAssets = useMemo(
    () => filterAssets(sortAssetsByCode(assets), debouncedAssetSearch, activeCategories),
    [assets, debouncedAssetSearch, activeCategories],
  );

  const commitAssets = useCallback(
    (next: Asset[]) => {
      const typed = syncAssetsWithSelectedTypes(next, allAssetTypes);
      const normalized = normalizeProjectAssets(project.projectCode, typed, assetDefaults);
      const sorted = sortAssetsByCode(normalized);
      skipAssetsSyncRef.current = true;
      setAssets(sorted);
      onAssetsChange(sorted);
    },
    [allAssetTypes, assetDefaults, onAssetsChange, project.projectCode],
  );

  const handleDataChange = useCallback(
    (updatedVisible: Asset[]) => {
      const visibleIds = new Set(visibleAssets.map((a) => a.id));
      const updatedById = new Map(updatedVisible.map((a) => [a.id, a]));
      const next = assets.map((a) => {
        if (!visibleIds.has(a.id)) return a;
        return updatedById.get(a.id) ?? a;
      });
      commitAssets(next);
    },
    [assets, visibleAssets, commitAssets],
  );

  const handleSaveAsset = useCallback(
    (updatedAsset: Asset) => {
      const exists = assets.some((a) => a.id === updatedAsset.id);
      const next = exists
        ? assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
        : [...assets, updatedAsset];
      commitAssets(next);
    },
    [assets, commitAssets],
  );

  const handleAddAsset = useCallback(() => {
    const assetTypeId = defaultRoutineAssetTypeId(allAssetTypes, defaultWorkflowId);
    if (!assetTypeId) {
      showToast('Belum ada asset type aktif. Atur di halaman Configuration.', 'error');
      return;
    }
    const draft = applyAssetTypeToAsset(
      {
        id: newAssetId(project.projectCode),
        assetCode: nextAssetCode(project.projectCode, assets),
        assetName: '',
        description: '',
        budgetPlan: 0,
        budgetAllocated: 0,
        consumedBudget: 0,
        workflowSetId: '',
        assetTypeId,
        budgetCategoryId: assetDefaults.budgetCategoryId,
        endTargetDate: project.endDate,
        qty: 1,
        receivedQty: 0,
      },
      assetTypeId,
      allAssetTypes,
    );
    setIsCreatingAsset(true);
    setEditingAsset(draft);
  }, [allAssetTypes, assetDefaults.budgetCategoryId, assets, defaultWorkflowId, project.endDate, project.projectCode, showToast]);

  const handleDeleteAsset = useCallback(
    async (asset: Asset) => {
      setIsLoadingDeleteCheck(true);
      try {
        const taskStatuses = await taskService.getAssetTaskStatusesForAsset(asset.id);
        setAssetTaskStatuses(taskStatuses);
        const tasks = await configService.getAllTasks();
        setAllTasks(tasks.map((t) => ({ id: t.id, name: t.name })));
        setAssetToDelete(asset);
      } catch (error) {
        console.error('Error checking asset status:', error);
        showToast('Failed to check asset status. Please try again.', 'error');
      } finally {
        setIsLoadingDeleteCheck(false);
      }
    },
    [showToast],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!assetToDelete) return;
    commitAssets(assets.filter((a) => a.id !== assetToDelete.id));
    showToast('Asset dihapus dari daftar. Klik Save Changes untuk menyimpan.', 'success');
    setAssetToDelete(null);
    setAssetTaskStatuses([]);
  }, [assetToDelete, assets, commitAssets, showToast]);

  const assetColumns: SpreadsheetColumn<Asset>[] = useMemo(
    () => [
      { header: 'Asset Code', accessor: 'assetCode' },
      { header: 'Asset Name', accessor: 'assetName', isEditable },
      {
        header: 'Category',
        accessor: 'budgetCategoryId',
        isEditable: isEditable && categoryOptions.length > 0,
        editorType: 'select',
        selectOptions: categoryOptions,
      },
      { header: 'Budget Plan', accessor: 'budgetPlan', isNumeric: true, isEditable },
      {
        header: 'Type',
        accessor: 'assetTypeId',
        isEditable: isEditable && assetTypeOptions.length > 0,
        editorType: 'select',
        selectOptions: assetTypeOptions,
        formatCellDisplay: (_value, item) => {
          const typeId = resolveAssetTypeId(item, allAssetTypes);
          const label = allAssetTypes.find((at) => at.id === typeId)?.name;
          return label || '—';
        },
      },
      { header: 'End Target Date', accessor: 'endTargetDate', isEditable, editorType: 'date' },
      { header: 'Consumed Budget', accessor: 'consumedBudget', isNumeric: true, isEditable },
      {
        header: 'Remaining to Consume',
        accessor: (asset) => (asset.budgetPlan || 0) - (asset.consumedBudget || 0),
        isNumeric: true,
      },
      {
        header: 'Actions',
        accessor: (item) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCreatingAsset(false);
                setEditingAsset(item);
              }}
              className="text-siloam-blue hover:underline text-xs font-semibold"
            >
              Edit
            </button>
            {isEditable ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteAsset(item);
                }}
                className="text-danger hover:underline text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoadingDeleteCheck}
              >
                {isLoadingDeleteCheck ? 'Checking...' : 'Delete'}
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [
      categoryOptions,
      handleDeleteAsset,
      isEditable,
      isLoadingDeleteCheck,
      allAssetTypes,
      assetTypeOptions,
    ],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-siloam-text-primary">
            Manage Assets for: {project.projectName}
          </h3>
          {isEditable ? (
            <button
              type="button"
              onClick={handleAddAsset}
              className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90"
            >
              + Add Asset
            </button>
          ) : null}
        </div>
        <div className="mb-4">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Cari asset berdasarkan kode, nama, kategori, atau deskripsi..."
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              className="w-full px-4 py-2 pl-10 border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue text-sm"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-siloam-text-secondary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {assetSearch ? (
              <button
                type="button"
                onClick={() => setAssetSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-siloam-text-secondary hover:text-siloam-text-primary"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
          {debouncedAssetSearch.trim() ? (
            <p className="mt-2 text-xs text-siloam-text-secondary">
              Menampilkan {visibleAssets.length} dari {assets.length} asset
            </p>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibleAssets.length > 0 ? (
            <SpreadsheetTable
              columns={assetColumns}
              data={visibleAssets}
              onDataChange={handleDataChange}
              rowHeaderAccessor="assetName"
            />
          ) : (
            <p className="text-center text-siloam-text-secondary py-6 text-sm">
              {debouncedAssetSearch.trim()
                ? `Tidak ada asset yang cocok dengan "${debouncedAssetSearch.trim()}"`
                : 'Belum ada asset.'}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90"
          >
            Close
          </button>
        </div>
      </div>
      {editingAsset ? (
        <AssetDetailEditorModal
          isOpen={!!editingAsset}
          onClose={() => {
            setEditingAsset(null);
            setIsCreatingAsset(false);
          }}
          asset={editingAsset}
          project={project}
          allWorkflows={allWorkflows}
          allAssetTypes={allAssetTypes}
          isCreating={isCreatingAsset}
          periodName={periodName}
          userId={userId}
          huId={huId}
          onUseExistingAsset={
            onUseExistingAsset
              ? (existing) => {
                  onUseExistingAsset(existing);
                  setEditingAsset(null);
                  setIsCreatingAsset(false);
                }
              : undefined
          }
          onSave={(updatedAsset) => {
            handleSaveAsset(updatedAsset);
            setEditingAsset(null);
            setIsCreatingAsset(false);
            showToast(
              isCreatingAsset ? 'Routine asset added successfully!' : 'Routine asset updated successfully!',
              'success',
            );
          }}
        />
      ) : null}

      <DeleteAssetConfirmModal
        isOpen={!!assetToDelete}
        onClose={() => {
          setAssetToDelete(null);
          setAssetTaskStatuses([]);
        }}
        onConfirm={handleConfirmDelete}
        asset={assetToDelete}
        taskStatuses={assetTaskStatuses}
        allTasks={allTasks}
      />
    </div>
  );
};
