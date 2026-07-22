/** Stable column ids for Budget HU strategic projects table (localStorage + visibility). */
export const BUDGET_HU_COLUMN_STORAGE_KEY = 'budget-hu-table-columns-v1';

export const BUDGET_HU_TABLE_COLUMN_IDS = {
  projectCode: 'projectCode',
  projectName: 'projectName',
  axCode: 'axCode',
  budgetCategory: 'budgetCategory',
  priority: 'priority',
  budgetPlan: 'budgetPlan',
  budgetCarryForward: 'budgetCarryForward',
  budgetAllocated: 'budgetAllocated',
  remainingToAllocate: 'remainingToAllocate',
  budgetApproved: 'budgetApproved',
  remainingToApproved: 'remainingToApproved',
  consumedBudget: 'consumedBudget',
  remainingToConsume: 'remainingToConsume',
  fs: 'fs',
  assetManagement: 'assetManagement',
  actions: 'actions',
} as const;

export type BudgetHuTableColumnId =
  (typeof BUDGET_HU_TABLE_COLUMN_IDS)[keyof typeof BUDGET_HU_TABLE_COLUMN_IDS];

/** Always shown; excluded from column picker. */
export const BUDGET_HU_PINNED_COLUMN_IDS: BudgetHuTableColumnId[] = [
  BUDGET_HU_TABLE_COLUMN_IDS.assetManagement,
  BUDGET_HU_TABLE_COLUMN_IDS.actions,
];

export const BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS: BudgetHuTableColumnId[] = [
  BUDGET_HU_TABLE_COLUMN_IDS.projectCode,
  BUDGET_HU_TABLE_COLUMN_IDS.projectName,
  BUDGET_HU_TABLE_COLUMN_IDS.axCode,
  BUDGET_HU_TABLE_COLUMN_IDS.budgetCategory,
  BUDGET_HU_TABLE_COLUMN_IDS.priority,
  BUDGET_HU_TABLE_COLUMN_IDS.budgetPlan,
  BUDGET_HU_TABLE_COLUMN_IDS.budgetCarryForward,
  BUDGET_HU_TABLE_COLUMN_IDS.budgetApproved,
  BUDGET_HU_TABLE_COLUMN_IDS.consumedBudget,
  BUDGET_HU_TABLE_COLUMN_IDS.fs,
  ...BUDGET_HU_PINNED_COLUMN_IDS,
];

export const BUDGET_HU_TOGGLEABLE_COLUMNS: { id: BudgetHuTableColumnId; label: string }[] = [
  { id: BUDGET_HU_TABLE_COLUMN_IDS.projectCode, label: 'Project Code' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.projectName, label: 'Project Name' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.axCode, label: 'AX Code' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.budgetCategory, label: 'Budget Category' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.priority, label: 'Priority' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.budgetPlan, label: 'Budget Plan' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.budgetCarryForward, label: 'Budget Carry Forward' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.budgetAllocated, label: 'Budget Allocated to Asset' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.remainingToAllocate, label: 'Remaining to Allocate' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.budgetApproved, label: 'FS Budget' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.remainingToApproved, label: 'Remaining To Approved' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.consumedBudget, label: 'Realization Budget' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.remainingToConsume, label: 'Remaining to Consume' },
  { id: BUDGET_HU_TABLE_COLUMN_IDS.fs, label: 'FS' },
];
