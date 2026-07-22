export type ExecutiveDashboardUnitRow = {
  unitCode: string;
  unitName: string;
  budget: number;
  consumed: number;
  utilizationPct: number;
};

export type ExecutiveDashboardCancelledAsset = {
  id: string;
  assetCode: string;
  assetName: string;
  projectName: string;
  unitCode: string;
};

export type ExecutiveDashboardCapexDonutSlice = {
  id: string;
  name: string;
  value: number;
  color: string;
  pct: number;
};

export type ExecutiveDashboardCapexStatus = {
  projectCount: number;
  assetCount: number;
  fsApprovalCount: number;
  poSentCount: number;
  readyToUseCount: number;
  cancelledCount: number;
  cancelledAssets: ExecutiveDashboardCancelledAsset[];
  donutSlices: ExecutiveDashboardCapexDonutSlice[];
  avgApprovalDays: number | null;
  overdueSlaCount: number;
};

export type ExecutiveDashboardCategorySlice = {
  id: string;
  name: string;
  value: number;
  pct: number;
};

export type ExecutiveDashboardMonthlyPoint = {
  month: string;
  label: string;
  realization: number;
  priorYear: number;
  budgetTarget: number;
};

export type ExecutiveDashboardTopInvestment = {
  id: string;
  projectName: string;
  unitCode: string;
  amount: number;
  statusLabel: string;
};

export type ExecutiveDashboardAlert = {
  severity: 'red' | 'yellow';
  title: string;
  detail: string;
};

export type ExecutiveDashboardMetrics = {
  summary: {
    totalBudget: number;
    budgetAllocationToProject: number;
    budgetApproval: number;
    budgetConsumed: number;
    budgetRevenuePerMonth: number;
    utilizationPct: number;
    totalCapexSubmission: number;
    pendingApprovalValue: number;
    approvedValue: number;
    rejectedCount: number;
    waitingApprovalCount: number;
  };
  budgetByUnit: ExecutiveDashboardUnitRow[];
  capexStatus: ExecutiveDashboardCapexStatus;
  categoryBreakdown: ExecutiveDashboardCategorySlice[];
  monthlyTrend: ExecutiveDashboardMonthlyPoint[];
  topInvestments: ExecutiveDashboardTopInvestment[];
  topUnits: ExecutiveDashboardUnitRow[];
  alerts: ExecutiveDashboardAlert[];
  updatedAt: string;
  periodMeta?: {
    periodName: string;
    startDate: string;
    endDate: string;
    multiYearName: string;
  } | null;
};

export const EMPTY_EXECUTIVE_DASHBOARD: ExecutiveDashboardMetrics = {
  summary: {
    totalBudget: 0,
    budgetAllocationToProject: 0,
    budgetApproval: 0,
    budgetConsumed: 0,
    budgetRevenuePerMonth: 0,
    utilizationPct: 0,
    totalCapexSubmission: 0,
    pendingApprovalValue: 0,
    approvedValue: 0,
    rejectedCount: 0,
    waitingApprovalCount: 0,
  },
  budgetByUnit: [],
  capexStatus: {
    projectCount: 0,
    assetCount: 0,
    fsApprovalCount: 0,
    poSentCount: 0,
    readyToUseCount: 0,
    cancelledCount: 0,
    cancelledAssets: [],
    donutSlices: [],
    avgApprovalDays: null,
    overdueSlaCount: 0,
  },
  categoryBreakdown: [],
  monthlyTrend: [],
  topInvestments: [],
  topUnits: [],
  alerts: [],
  updatedAt: '',
};

export const CAPEX_PIPELINE_COLORS: Record<string, string> = {
  'Belum FS Approval': '#94A3B8',
  'Sudah FS Approval': '#00A3E0',
  'Sudah PO': '#F59E0B',
  'Ready to Use': '#28A745',
  Cancel: '#DC3545',
};

export const CATEGORY_CHART_COLORS = [
  '#00529B',
  '#00A3E0',
  '#007A5E',
  '#F2C744',
  '#F26F21',
  '#7C3AED',
  '#EC4899',
  '#64748B',
];
