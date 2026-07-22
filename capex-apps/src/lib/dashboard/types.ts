export type DashboardChartSlice = { name: string; value: number; color: string };

export type DashboardCategoryBar = {
  id?: string;
  name: string;
  approved: number;
  consumed: number;
};

export type DashboardSankeyLink = { source: string; target: string; value: number };

export type DashboardStats = {
  totalBudget: number;
  totalConsumed: number;
  projectCount: number;
  projectStatusData: DashboardChartSlice[];
  budgetByCategory: DashboardCategoryBar[];
  sankeyData: DashboardSankeyLink[];
};
