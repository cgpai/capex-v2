import type {
  AssetTaskStatus,
  BudgetCategoryConfig,
  FeasibilityStudy,
  HospitalUnit,
  Project,
  TaskLog,
  User,
  UserRole,
  WorkflowSet,
} from '../../../types';
import { TaskCurrentStatus } from '../../../types';
import {
  isRoutineAssetProject,
  sumHuCategoryLiveAggregates,
  sumHuCategoryProjectBudgetPlan,
  sumHuTotalConsumed,
  sumProjectBudgetAllocated,
} from '../../../lib/budgetCategoryAggregates';
import { resolveUnitCategoryBudgetPlan } from '../../../screens/BudgetHU/budgetHuHelpers';

export interface UnitKpiStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalAssets: number;
  assetsWithPo: number;
  assetsReceived: number;
  assetsNotStarted: number;
  totalBudgetPlan: number;
  totalCarryForward: number;
  totalBudget: number;
  totalAllocated: number;
  totalApproved: number;
  totalConsumed: number;
  openTasks: number;
}

export interface CategoryBudgetRow {
  categoryId: string;
  categoryName: string;
  budgetPlan: number;
  carryForward: number;
  total: number;
  allocated: number;
  approved: number;
  consumed: number;
  utilizationPct: number;
}

export interface FsStatusSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  notSubmitted: number;
}

export interface AllocationAlert {
  projectCode: string;
  projectName: string;
  remainingToAllocate: number;
}

export interface TeamMemberRow {
  user: User;
  role: string;
  source: string;
  completed: number;
  pending: number;
}

export interface InsightBlock {
  id: string;
  tone: 'positive' | 'warning' | 'critical' | 'neutral';
  title: string;
  detail: string;
}

export interface UnitPerformanceSummary {
  kpis: UnitKpiStats;
  categoryRows: CategoryBudgetRow[];
  fsSummary: FsStatusSummary;
  allocationAlerts: AllocationAlert[];
  teamRows: TeamMemberRow[];
  insights: InsightBlock[];
}

function isApprovedFs(conclusion: string | undefined): boolean {
  return conclusion === 'Approved' || conclusion === 'Approved with Notes';
}

function isRejectedFs(conclusion: string | undefined): boolean {
  return conclusion === 'Rejected';
}

function isPendingFs(conclusion: string | undefined): boolean {
  return conclusion === 'Pending';
}

export function computeUnitKpis(
  hospitalUnit: HospitalUnit,
  activeCategories: BudgetCategoryConfig[] = [],
): UnitKpiStats {
  let totalProjects = 0;
  let activeProjects = 0;
  let completedProjects = 0;
  let totalAssets = 0;
  let assetsWithPo = 0;
  let assetsReceived = 0;
  let assetsNotStarted = 0;
  let totalBudgetPlan = 0;
  let totalCarryForward = 0;
  let totalAllocated = 0;
  let totalApproved = 0;
  let totalConsumed = 0;

  hospitalUnit.projects.forEach((project) => {
    if (!isRoutineAssetProject(project) || (project.assets?.length ?? 0) > 0) {
      totalProjects += 1;
      if (project.completionRate === 100) completedProjects += 1;
      else if (project.completionRate > 0) activeProjects += 1;
    }

    project.assets?.forEach((asset) => {
      totalAssets += 1;
      if (asset.poNumber || (asset.consumedBudget || 0) > 0) assetsWithPo += 1;
      if (asset.isGoodsReceived) assetsReceived += 1;
      if ((asset.consumedBudget || 0) === 0 && !asset.poNumber) assetsNotStarted += 1;
    });
  });

  if (activeCategories.length > 0) {
    for (const cat of activeCategories) {
      totalBudgetPlan += resolveUnitCategoryBudgetPlan(hospitalUnit, cat.id);
      const live = sumHuCategoryLiveAggregates(hospitalUnit, cat.id);
      totalCarryForward += live.budgetCarryForward;
      totalAllocated += sumHuCategoryProjectBudgetPlan(hospitalUnit, cat.id);
      totalApproved += live.approvedBudget;
      totalConsumed += live.consumedBudget;
    }
  } else {
    hospitalUnit.projects.forEach((project) => {
      if (isRoutineAssetProject(project)) return;
      totalBudgetPlan += project.budgetPlan || 0;
      totalCarryForward += project.budgetCarryForward || 0;
      totalAllocated += sumProjectBudgetAllocated(project);
      totalApproved += project.approvedBudget || 0;
    });
    totalConsumed = sumHuTotalConsumed(hospitalUnit);
  }

  const totalBudget = totalBudgetPlan + totalCarryForward;

  return {
    totalProjects,
    activeProjects,
    completedProjects,
    totalAssets,
    assetsWithPo,
    assetsReceived,
    assetsNotStarted,
    totalBudgetPlan,
    totalCarryForward,
    totalBudget,
    totalAllocated,
    totalApproved,
    totalConsumed,
    openTasks: 0,
  };
}

export function computeCategoryRows(
  hospitalUnit: HospitalUnit,
  activeCategories: BudgetCategoryConfig[],
): CategoryBudgetRow[] {
  const categoryNameById = new Map(activeCategories.map((c) => [c.id, c.name]));

  return activeCategories.map((cat) => {
    const live = sumHuCategoryLiveAggregates(hospitalUnit, cat.id);
    const allocated = sumHuCategoryProjectBudgetPlan(hospitalUnit, cat.id);
    const budgetPlan = resolveUnitCategoryBudgetPlan(hospitalUnit, cat.id);
    const carryForward = live.budgetCarryForward;
    const total = budgetPlan + carryForward;
    const consumed = live.consumedBudget;

    return {
      categoryId: cat.id,
      categoryName: categoryNameById.get(cat.id) || cat.name,
      budgetPlan,
      carryForward,
      total,
      allocated,
      approved: live.approvedBudget,
      consumed,
      utilizationPct: total > 0 ? (consumed / total) * 100 : 0,
    };
  });
}

export function computeFsSummary(
  strategicProjects: Project[],
  fsDataByProjectId: Map<string, FeasibilityStudy>,
): FsStatusSummary {
  const summary: FsStatusSummary = {
    total: strategicProjects.length,
    approved: 0,
    pending: 0,
    rejected: 0,
    notSubmitted: 0,
  };

  strategicProjects.forEach((project) => {
    const fs = fsDataByProjectId.get(project.id);
    if (!fs) {
      summary.notSubmitted += 1;
      return;
    }
    const conclusion = String(fs.conclusion || '');
    if (isApprovedFs(conclusion)) summary.approved += 1;
    else if (isRejectedFs(conclusion)) summary.rejected += 1;
    else if (isPendingFs(conclusion)) summary.pending += 1;
    else summary.notSubmitted += 1;
  });

  return summary;
}

export function computeAllocationAlerts(projects: Project[], limit = 5): AllocationAlert[] {
  return projects
    .filter((p) => !p.isRoutineAssetAggregator && !p.isPipelineProject)
    .map((project) => {
      const ceiling = (project.budgetPlan || 0) + (project.budgetCarryForward || 0);
      const remaining = ceiling - (project.budgetAllocated || 0);
      return {
        projectCode: project.projectCode,
        projectName: project.projectName,
        remainingToAllocate: remaining,
      };
    })
    .filter((row) => row.remainingToAllocate > 0)
    .sort((a, b) => b.remainingToAllocate - a.remainingToAllocate)
    .slice(0, limit);
}

type TeamMemberMap = Map<string, TeamMemberRow>;

function scopeWeight(source: string): number {
  if (source === 'Direct (Unit)') return 3;
  if (source === 'Network') return 2;
  if (source === 'Global (HO)') return 1;
  return 0;
}

function addTeamMember(map: TeamMemberMap, user: User, role: string, source: string) {
  const key = `${user.id}-${role}`;
  const existing = map.get(key);
  const newWeight = scopeWeight(source);
  const currentWeight = existing ? scopeWeight(existing.source) : 0;
  if (!existing || newWeight > currentWeight) {
    map.set(key, {
      user,
      role,
      source,
      completed: existing?.completed || 0,
      pending: existing?.pending || 0,
    });
  }
}

export function computeTeamRows(params: {
  hospitalUnit: HospitalUnit;
  allUsers: User[];
  allRoles: UserRole[];
  allLogs: TaskLog[];
  allStatuses: AssetTaskStatus[];
  allWorkflows: WorkflowSet[];
  archetypeName?: string | null;
}): TeamMemberRow[] {
  const { hospitalUnit, allUsers, allRoles, allLogs, allStatuses, allWorkflows, archetypeName } =
    params;

  const assetIds = new Set<string>();
  hospitalUnit.projects.forEach((p) => p.assets.forEach((a) => assetIds.add(a.id)));

  const teamMembersMap: TeamMemberMap = new Map();

  allUsers.forEach((user) => {
    user.assignments.forEach((assignment) => {
      const scopes = assignment.assignedScopes;
      if (scopes.includes('All')) {
        addTeamMember(teamMembersMap, user, assignment.roleName, 'Global (HO)');
      }
      if (archetypeName && scopes.includes(archetypeName)) {
        addTeamMember(teamMembersMap, user, assignment.roleName, 'Network');
      }
      if (
        scopes.includes(hospitalUnit.name) ||
        (hospitalUnit.code && scopes.includes(hospitalUnit.code))
      ) {
        addTeamMember(teamMembersMap, user, assignment.roleName, 'Direct (Unit)');
      }
    });
  });

  allLogs
    .filter((log) => assetIds.has(log.assetId))
    .forEach((log) => {
      if (!log.completedByUserId || !log.completedByUserRole) return;
      const key = `${log.completedByUserId}-${log.completedByUserRole}`;
      const member = teamMembersMap.get(key);
      if (member) member.completed += 1;
    });

  const openTasks = allStatuses.filter(
    (s) => assetIds.has(s.assetId) && s.status === TaskCurrentStatus.Open,
  );

  openTasks.forEach((status) => {
    let assetWorkflowId = '';
    for (const project of hospitalUnit.projects) {
      const asset = project.assets.find((a) => a.id === status.assetId);
      if (asset) {
        assetWorkflowId = asset.workflowSetId;
        break;
      }
    }

    const workflow = allWorkflows.find((w) => w.id === assetWorkflowId);
    const step = workflow?.steps.find((s) => s.taskId === status.taskId);
    if (!step) return;

    step.roleIds.forEach((roleId) => {
      const roleDef = allRoles.find((r) => r.id === roleId);
      if (!roleDef) return;
      teamMembersMap.forEach((member) => {
        if (member.role === roleDef.roleName) member.pending += 1;
      });
    });
  });

  return Array.from(teamMembersMap.values()).sort((a, b) => {
    if (a.role < b.role) return -1;
    if (a.role > b.role) return 1;
    return a.user.username.localeCompare(b.user.username);
  });
}

export function buildInsightBlocks(params: {
  kpis: UnitKpiStats;
  fsSummary: FsStatusSummary;
  allocationAlerts: AllocationAlert[];
  teamRows: TeamMemberRow[];
  openTasks: number;
}): InsightBlock[] {
  const { kpis, fsSummary, allocationAlerts, teamRows, openTasks } = params;
  const insights: InsightBlock[] = [];

  const utilization =
    kpis.totalBudget > 0 ? (kpis.totalConsumed / kpis.totalBudget) * 100 : 0;

  insights.push({
    id: 'budget-utilization',
    tone:
      utilization > 90 ? 'critical' : utilization < 30 && kpis.totalBudget > 0 ? 'warning' : 'positive',
    title: 'Utilisasi Anggaran',
    detail:
      kpis.totalBudget > 0
        ? `${utilization.toFixed(1)}% dari total anggaran (plan + carry forward) telah terealisasi.`
        : 'Belum ada rencana anggaran yang tercatat untuk unit ini.',
  });

  const unallocated = kpis.totalBudget - kpis.totalAllocated;
  if (unallocated > 0) {
    insights.push({
      id: 'unallocated-budget',
      tone: 'warning',
      title: 'Sisa Belum Dialokasikan',
      detail: `Masih ada anggaran yang belum dialokasikan ke asset sebesar Rp ${Math.round(unallocated).toLocaleString('id-ID')}.`,
    });
  }

  if (kpis.totalAssets > 0) {
    const poRate = (kpis.assetsWithPo / kpis.totalAssets) * 100;
    insights.push({
      id: 'po-coverage',
      tone: poRate < 40 ? 'warning' : 'neutral',
      title: 'Cakupan PO',
      detail: `${kpis.assetsWithPo} dari ${kpis.totalAssets} asset (${poRate.toFixed(0)}%) sudah memiliki PO atau realisasi.`,
    });

    if (kpis.assetsWithPo > 0) {
      const grRate = (kpis.assetsReceived / kpis.assetsWithPo) * 100;
      insights.push({
        id: 'gr-efficiency',
        tone: grRate < 40 ? 'critical' : grRate >= 80 ? 'positive' : 'neutral',
        title: 'Goods Receipt',
        detail: `${kpis.assetsReceived} asset siap pakai dari ${kpis.assetsWithPo} asset ber-PO (${grRate.toFixed(0)}%).`,
      });
    }
  }

  if (kpis.assetsNotStarted > 0) {
    insights.push({
      id: 'assets-not-started',
      tone: 'warning',
      title: 'Asset Belum Dimulai',
      detail: `${kpis.assetsNotStarted} asset belum memiliki PO maupun realisasi anggaran.`,
    });
  }

  if (fsSummary.pending > 0) {
    insights.push({
      id: 'fs-pending',
      tone: 'warning',
      title: 'FS Menunggu Persetujuan',
      detail: `${fsSummary.pending} project strategis berstatus FS Pending.`,
    });
  }

  if (fsSummary.notSubmitted > 0) {
    insights.push({
      id: 'fs-missing',
      tone: 'neutral',
      title: 'FS Belum Diajukan',
      detail: `${fsSummary.notSubmitted} project strategis belum memiliki FS.`,
    });
  }

  if (allocationAlerts.length > 0) {
    const top = allocationAlerts[0];
    insights.push({
      id: 'top-allocation-gap',
      tone: 'warning',
      title: 'Gap Alokasi Terbesar',
      detail: `${top.projectCode} — ${top.projectName}: sisa alokasi Rp ${Math.round(top.remainingToAllocate).toLocaleString('id-ID')}.`,
    });
  }

  const bottleneckRoles = Array.from(
    new Set(teamRows.filter((m) => m.pending > 3).map((m) => m.role)),
  );
  if (bottleneckRoles.length > 0) {
    insights.push({
      id: 'role-bottleneck',
      tone: 'critical',
      title: 'Bottleneck Task',
      detail: `Task terbuka menumpuk pada role: ${bottleneckRoles.join(', ')}.`,
    });
  }

  if (openTasks > 0) {
    insights.push({
      id: 'open-tasks',
      tone: openTasks > 10 ? 'critical' : 'neutral',
      title: 'Task Terbuka',
      detail: `${openTasks} workflow task masih berstatus Open di unit ini.`,
    });
  }

  const topPerformer = [...teamRows].sort((a, b) => b.completed - a.completed)[0];
  if (topPerformer && topPerformer.completed >= 3) {
    insights.push({
      id: 'top-performer',
      tone: 'positive',
      title: 'Kontributor Aktif',
      detail: `${topPerformer.user.username} (${topPerformer.role}) mencatat ${topPerformer.completed} task selesai.`,
    });
  }

  return insights;
}

export function buildUnitPerformanceSummary(params: {
  hospitalUnit: HospitalUnit;
  activeCategories: BudgetCategoryConfig[];
  fsDataByProjectId: Map<string, FeasibilityStudy>;
  allUsers: User[];
  allRoles: UserRole[];
  allLogs: TaskLog[];
  allStatuses: AssetTaskStatus[];
  allWorkflows: WorkflowSet[];
  archetypeName?: string | null;
}): UnitPerformanceSummary {
  const strategicProjects = params.hospitalUnit.projects.filter(
    (p) => !p.isRoutineAssetAggregator && !p.isPipelineProject,
  );

  const kpis = computeUnitKpis(params.hospitalUnit, params.activeCategories);
  const openTasks = params.allStatuses.filter((s) => {
    const assetIds = new Set(
      params.hospitalUnit.projects.flatMap((p) => p.assets.map((a) => a.id)),
    );
    return assetIds.has(s.assetId) && s.status === TaskCurrentStatus.Open;
  }).length;
  kpis.openTasks = openTasks;

  const categoryRows = computeCategoryRows(params.hospitalUnit, params.activeCategories);
  const fsSummary = computeFsSummary(strategicProjects, params.fsDataByProjectId);
  const allocationAlerts = computeAllocationAlerts(strategicProjects);
  const teamRows = computeTeamRows({
    hospitalUnit: params.hospitalUnit,
    allUsers: params.allUsers,
    allRoles: params.allRoles,
    allLogs: params.allLogs,
    allStatuses: params.allStatuses,
    allWorkflows: params.allWorkflows,
    archetypeName: params.archetypeName,
  });

  const insights = buildInsightBlocks({
    kpis,
    fsSummary,
    allocationAlerts,
    teamRows,
    openTasks,
  });

  return {
    kpis,
    categoryRows,
    fsSummary,
    allocationAlerts,
    teamRows,
    insights,
  };
}
