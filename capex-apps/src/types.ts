
import React from 'react';

export enum Page {
  Dashboard = 'Dashboard',
  ExecutiveSummary = 'CEO Dashboard',
  BudgetMultiYear = 'Multi-Year Budget',
  BudgetPeriod = 'Budget Period',
  BudgetArchetype = 'Budget Network',
  BudgetHU = 'Budget HU',
  CapexProjectList = 'Capex Project List',
  DailyMOMSummary = 'Daily MOM Summary',
  MyTask = 'My Task',
  POUpdate = 'PO Update',
  GRUpdate = 'GR Update',
  FSUpdate = 'FS Update',
  FSApproval = 'FS Approval',
  FSRealization = 'FS Realization',
  BDDConstruction = 'BDD Construction',
  AIAnalytics = 'AI Control Tower',
  UserMonitoring = 'User Monitoring',
  DataMigration = 'Data Migration', 
  Configuration = 'Configuration',
  Profile = 'My Profile',
}

// Mapping Page to HierarchyLevel for permission checking
export const PAGE_TO_HIERARCHY_MAP: Record<Page, HierarchyLevel> = {
  [Page.Dashboard]: 'Dashboard',
  [Page.ExecutiveSummary]: 'Executive Summary',
  [Page.BudgetMultiYear]: 'Multi-Year Budget',
  [Page.BudgetPeriod]: 'Budget Period',
  [Page.BudgetArchetype]: 'Budget Archetype',
  [Page.BudgetHU]: 'Budget HU',
  [Page.CapexProjectList]: 'Capex Project List',
  [Page.DailyMOMSummary]: 'Daily MOM Summary',
  [Page.MyTask]: 'My Task',
  [Page.POUpdate]: 'PO Update',
  [Page.GRUpdate]: 'GR Update',
  [Page.FSUpdate]: 'FS Update',
  [Page.FSApproval]: 'FS Approval',
  [Page.FSRealization]: 'FS Realization',
  [Page.BDDConstruction]: 'BDD Construction',
  [Page.AIAnalytics]: 'AI Control Tower',
  [Page.UserMonitoring]: 'User Monitoring',
  [Page.DataMigration]: 'Data Migration',
  [Page.Configuration]: 'Configuration',
  [Page.Profile]: 'My Profile',
};

export interface OfflineDataItem {
    id: string; 
    datasetName: string; 
    originalRow: Record<string, any>; 
    processedRow?: Partial<Project>; 
    status: 'Raw' | 'Processed' | 'Synced';
    uploadedAt: string;
}

export interface Notification {
    id: string;
    userId: number;
    message: string;
    type: 'task' | 'budget' | 'approval';
    isRead: boolean;
    createdAt: string; 
    linkToPage?: Page;
}

export interface BudgetCategoryConfig {
  id: string; 
  name: string; 
  isActive: boolean;
}

export interface ProjectPriorityConfig {
    id: string;
    name: string;
    isActive: boolean;
}

export interface AssetTagConfig {
    id: string;
    name: string;
    color: string; // Tailwind color class e.g. "bg-red-100 text-red-800"
}

export interface MasterCatalogueItem {
    id: string;
    rdsCode: string;
    name: string;
    category: string; 
    price: number;
}

export interface RoomConfig {
    id: string;
    name: string;
}

export interface BudgetItem {
  budgetPlan: number;
  budgetCarryForward: number;

  budgetAllocated: number;
  approvedBudget: number;
  consumedBudget: number;
  assetCount?: number;
  noBudgetAssetCount?: number;
}

export interface BudgetSummaryRow extends BudgetItem {
    categoryId: string;
    type: string; 
}

export enum ProjectStatus {
  OnTrack,
  AtRisk,
  OffTrack,
}

export enum ProjectType {
  GeneralAndRoutine = "General & Regular Assets",
  Strategic = "Strategic Projects",
  ProjectPipeline = "Project Pipeline",
}

export type BDDPriority = string | null;

export interface Asset {
  id: string;
  assetCode: string;
  assetName: string;
  description?: string;
  budgetPlan: number;
  budgetAllocated: number;
  consumedBudget: number;
  workflowSetId: string;
  budgetCategoryId: string;
  endTargetDate?: string;
  catalogueId?: string; 
  poNumber?: string;
  cprId?: string;
  /** ISO date (YYYY-MM-DD) when PO was issued/updated */
  poDate?: string;
  isGoodsReceived?: boolean;
  bddPriority?: BDDPriority;
  assetTypeId?: string | null;
  qty?: number; // Quantity of assets ordered (default: 1)
  receivedQty?: number; // Quantity of assets received (default: 0)
  /** Optional lifecycle flag from DB (e.g. Cancel) — used to hide assets from Capex list. */
  lifecycleStatus?: string | null;
}

export interface EnrichedAsset extends Asset {
    projectId: string;
    projectName: string;
    huName: string;
    archetypeName: string;
    projectCode: string;
    completionRate?: number;
    actionableTaskCount?: number;
    projectionEndDate?: string;
    assetTypeGroupName?: string;
    /** From joined project row — used when page bundle omits full `projects[]`. */
    projectPriorityId?: string;
}

export interface Project {
  id: string;
  /** FK to hospital_units.id — present on flat DB rows from getAllProjects */
  hospitalUnitId?: string;
  /** FK/ID to budget_periods.period_name */
  periodName?: string;
  assetCode: string;
  axCode?: string;
  projectName: string;
  assetName: string;
  completionRate: number;
  taskToDo: string;
  owner: string;
  targetStart: string;
  endDate: string;
  status: ProjectStatus;
  plan: string;
  projectCode: string;
  budgetPlan: number;
  budgetCarryForward: number;
  budgetAllocated: number;
  approvedBudget: number;
  consumedBudget: number;
  revenueProjection: number;
  targetBudgetStart?: string; // date (Target budget Start)
  budgetRevenuePermonth?: number; // currency (Budget revenue permonth)
  priorityId: string;
  type: ProjectType;
  budgetCategoryId: string;
  assets: Asset[];
  isRoutineAssetAggregator?: boolean;
  categoryBudgetPlan?: Record<string, number>;
  isPipelineProject?: boolean;
  stage?: number;
  pipelineData?: {
    roomId: string;
    catalogueId: string;
    qty: number;
  }[];
}

/** Feasibility study entity (`public.feasibility_studies`). */
export type FSConclusion = 'Pending' | 'Approved' | 'Approved with Notes' | 'Rejected';

export interface FeasibilityStudy {
  id: string;
  projectId: string;
  fsType: string;
  amount: number;
  irr: number;
  paybackPeriod: number;
  npv: number;
  roi: number;
  plannedRevenueStartDate: string;
  actualRevenueStartDate?: string | null;
  monthlyRevenuePlan: number;
  /** Planned throughput (Qty Object). */
  throughput?: number;
  conclusion: FSConclusion | string;
  followUpAction?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FSRealization {
  id: string;
  fsId: string;
  month: string;
  actualRevenue: number;
  /** Actual throughput (Qty Object) for the month. */
  actualThroughput?: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface HospitalUnit {
  id: string;
  name: string;
  code: string;
  budget: Record<string, BudgetItem>;
  projects: Project[];
  /** When true, Budget HU shows Pipeline Equipment Planning above routine assets. */
  isPipeline?: boolean;
}

export const PIPELINE_ARCHETYPE_ID = 'PIPE';

export interface Archetype {
    id: string;
    name: string;
    budget: Record<string, BudgetItem>;
    units: HospitalUnit[];
}

export interface BudgetMultiYear {
  name: string;
  startYear: number;
  endYear: number;
  budget: BudgetItem;
}

export interface BudgetPeriod {
  periodName: string;
  multiYearName: string;
  startDate: string;
  endDate: string;
  budget: Record<string, BudgetItem>;
  archetypes: Archetype[];
}

export interface UserAssignment {
    roleName: string;
    assignedScopes: string[];
}

export interface User {
    id: number;
    username: string;
    password?: string; 
    email: string;
    phoneNumber?: string;
    assignments: UserAssignment[];
}

export type HierarchyLevel =
    // Screen Access (separated per page)
    | 'Dashboard'
    | 'Executive Summary'
    | 'Multi-Year Budget'
    | 'Budget Period'
    | 'Budget Archetype'
    | 'Budget HU'
    | 'My Profile'
    // Budget & Financial
    | 'Siloam'
    | 'Archetype'
    | 'HU'
    | 'Budget'
    // Project & Asset Management
    | 'Project'
    | 'Asset'
    | 'Capex Project List'
    | 'Daily MOM Summary'
    | 'BDD Construction'
    // Task Management
    | 'My Task'
    // Purchase & Financial Updates
    | 'Purchase Order'
    | 'PO Update'
    | 'GR Update'
    | 'FS Update'
    | 'FS Approval'
    | 'FS Realization'
    // Planning & Analytics
    | 'Pipeline Planning'
    | 'AI Control Tower'
    // Administration
    | 'User Management'
    | 'Role Management'
    | 'Master Data'
    | 'Workflow'
    | 'Data Migration'
    | 'User Monitoring'
    | 'Configuration';

export const HIERARCHY_LEVELS: HierarchyLevel[] = [
    // Screen Access (separated per page)
    'Dashboard', 'Executive Summary', 'Multi-Year Budget', 'Budget Period', 'Budget Archetype', 'Budget HU', 'My Profile',
    // Budget & Financial
    'Siloam', 'Archetype', 'HU', 'Budget',
    // Project & Asset Management
    'Project', 'Asset', 'Capex Project List', 'Daily MOM Summary', 'BDD Construction',
    // Task Management
    'My Task',
    // Purchase & Financial Updates
    'Purchase Order', 'PO Update', 'GR Update', 'FS Update', 'FS Approval', 'FS Realization',
    // Planning & Analytics
    'Pipeline Planning', 'AI Control Tower',
    // Administration
    'User Management', 'Role Management', 'Master Data', 'Workflow', 'Data Migration', 'User Monitoring', 'Configuration'
];


export type PermissionLevel = 'Hide' | 'View Only' | 'View & Update' | 'View, Update & Create' | 'View, Update, Create & Delete';

export const PERMISSION_LEVELS: PermissionLevel[] = ['Hide', 'View Only', 'View & Update', 'View, Update & Create', 'View, Update, Create & Delete'];

export interface Permission {
    hierarchy: HierarchyLevel;
    permission: PermissionLevel;
}

export interface UserRole {
    id: number;
    roleName: string;
    permissions: Permission[];
}

export interface RegionalConfig {
    id: string;
    code: string;
    name: string;
}

export interface HospitalUnitConfig {
    id: string;
    code: string;
    name: string;
    archetypeId: string;
    regionalId: string;
    huNumber?: string;
    /** When true, this unit is designated as a Pipeline HU. */
    isPipeline?: boolean;
}

export interface ArchetypeConfig {
    id: string;
    code: string;
    name: string;
}

export const SYSTEM_TRIGGER_EVENTS = [
    { value: 'BUDGET_APPROVED', label: 'Project Budget Approved' },
    { value: 'PO_CREATED', label: 'Purchase Order Created' },
    { value: 'ASSET_CREATED', label: 'Asset Record Created' },
    { value: 'ASSET_BUDGET_PLAN_FILLED', label: 'Asset Budget Plan Filled' },
    { value: 'PO_GOODS_RECEIVED', label: 'PO Goods Received (GR)' },
    { value: 'FS_REQUEST', label: 'Feasibility Study Requested' },
    { value: 'FS_APPROVAL', label: 'When FS Approval' },
] as const;

/** FS conclusions that count as a completed approval decision on FS Approval screen. */
export const FINAL_FS_APPROVAL_CONCLUSIONS: FSConclusion[] = [
    'Approved',
    'Approved with Notes',
    'Rejected',
];

export type SystemTriggerEvent = typeof SYSTEM_TRIGGER_EVENTS[number]['value'];


export interface Task {
    id: string;
    name: string;
    description: string;
    slaToComplete: number;
    isSystemTriggered?: boolean;
    /** @deprecated Legacy single trigger — use triggerEvents. Still read for backward compatibility. */
    triggerEvent?: SystemTriggerEvent;
    /** System events that auto-complete this task (any one event is sufficient). */
    triggerEvents?: SystemTriggerEvent[];
}

export interface WorkflowStep {
    order: number;
    taskId: string;
    roleIds: number[];
    slaToComplete: number;
    triggeringTaskIds: string[];
    taskScore: number;
    milestoneScore?: number;
}

export interface WorkflowSet {
    id: string;
    name: string;
    steps: WorkflowStep[];
}

export interface AssetTypeGroupConfig {
    id: string;
    name: string;
}

export interface AssetTypeConfig {
    id: string;
    name: string;
    workflowSetId: string;
    isActive: boolean;
    groupId?: string;
}

export interface AppConfig {
    key: string;
    value: any;
}

export enum TaskCurrentStatus {
    Locked = 'Locked',
    Open = 'Open',
    Done = 'Done'
}

export interface AssetTaskStatus {
    id: string; 
    assetId: string;
    taskId: string;
    status: TaskCurrentStatus;
    startDate?: string; 
    targetEndDate?: string;
    /** Per-asset SLA days; does not modify workflow/task default SLA in Configuration. */
    slaToCompleteOverride?: number | null;
    completedAt?: string;
    logId?: string; 
    reportedNotYetByUserId?: number;
    reportedNotYetByUsername?: string;
    rescheduledEndDate?: string;
    rescheduleReason?: string;
}

export interface TaskLogRemarkEdit {
    editedAt: string;
    editedByUserId?: number;
    editedByUsername?: string;
    previousRemark: string;
    newRemark: string;
}

export interface TaskLog {
    id: string; 
    assetId: string;
    taskId: string;
    remark: string;
    completedAt: string; 
    completedByUserId?: number;
    completedByUsername?: string;
    completedByUserRole?: string;
    completedByType?: 'User' | 'System';
    /** Append-only history when remark is edited after completion. */
    remarkEditHistory?: TaskLogRemarkEdit[];
}

export interface MOM {
    id: string;
    assetId: string;
    content: string;
    createdAt: string;
    createdByUserId: number;
    createdByUsername: string;
}

/** Satu baris ringkasan MOM harian (asset + project + isi MOM). */
export interface DailyMOMSummaryRow {
    mom: MOM;
    assetCode: string;
    assetName: string;
    projectCode: string;
    projectName: string;
    archetypeName: string;
    huName: string;
}

export enum AdhocTaskStatus {
    Open = 'Open',
    Done = 'Done',
}

export interface AdhocTask {
    id: string;
    assetId: string;
    description: string;
    assignedToUserId: number;
    assignedToUsername: string;
    dueDate: string;
    status: AdhocTaskStatus;
    createdAt: string;
    createdByUserId: number;
    createdByUsername: string;
    completedAt?: string;
    completionRemark?: string;
}

export interface AuditLog {
    id: string;
    entityId: string; 
    entityType: 'Project' | 'Asset' | 'Migration';
    action: 'Create' | 'Update' | 'Delete' | 'Import';
    fieldName: string; 
    oldValue: string | number | null | undefined;
    newValue: string | number | null | undefined;
    changedBy: string; 
    timestamp: string; 
}

export interface AuditLogDetail {
    type: 'audit';
    log: AuditLog;
    date: string;
}

export interface WorkflowTaskDetail {
    type: 'workflow';
    task: Task;
    step: WorkflowStep;
    statusInfo: AssetTaskStatus;
    log: TaskLog | null;
    date: string;
}

export interface MOMDetail {
    type: 'mom';
    mom: MOM;
    date: string;
}

export interface AdhocTaskDetail {
    type: 'adhoc';
    adhocTask: AdhocTask;
    date: string;
}

export type TimelineItem = WorkflowTaskDetail | MOMDetail | AdhocTaskDetail | AuditLogDetail;

export interface ChangeSummary {
    title: string;
    changes: {
        item: string;
        before: string;
        after: string;
    }[];
}

export interface UserTask {
    type: 'workflow' | 'adhoc';
    id: string; 
    taskName: string;
    description: string;
    
    assetId: string;
    assetCode: string;
    assetName: string;
    projectCode: string;
    projectName: string;
    huName: string;
    archetypeName: string;

    startDate: string; 
    targetEndDate: string; 
    status: TaskCurrentStatus | AdhocTaskStatus;
    
    workflowStep?: WorkflowStep;
    assignedRoles?: UserRole[];

    adhocTask?: AdhocTask;
}

export interface Vendor {
    id: string;
    name: string;
    address: string;
    contactPerson: string;
    contactEmail: string;
    contactPhone?: string;
    npwp?: string;
}

export interface POItem {
    catalogueId: string;
    rdsCode: string;
    name: string;
    qty: number;
    price: number;
    subtotal: number;
    remarks?: string;
    receivedQty: number;
}

export type POStatus = 'Active' | 'Canceled' | 'Partially Received' | 'Completed';

export interface PurchaseOrder {
    id: string; 
    poNumber: string; 
    projectId: string;
    stage: number;
    vendorId: string;
    vendorName: string; 
    items: POItem[];
    totalValue: number;
    status: POStatus;
    createdAt: string; 
    shippingAddress: string;
    remarks?: string;
}

export interface GlobalAnalyticsResponse {
    executiveSummary: {
        totalActiveProjects: number;
        projectsAtRisk: number;
        overallProgress: number; 
        budgetUtilization: number; 
        topBottleneck: string;
        bestPerformingArea: string;
    };
    dimensionalAnalysis: {
        projects: { name: string; status: string; trend: string }[];
        units: { name: string; performance: string; issue: string }[];
        roles: { name: string; workload: string; avgDelay: string }[];
    };
    risks: {
        description: string;
        impact: string;
        severity: 'High' | 'Medium' | 'Low';
    }[];
    recommendations: {
        action: string;
        owner: string;
        urgency: 'High' | 'Medium' | 'Low';
        systemTrigger?: string;
    }[];
    narrative: string;
    lastUpdated: string;
}

export interface UserActivityMetric {
    userId: number;
    username: string;
    roleName: string;
    email: string;
    unitNames?: string[];
    archetypeNames?: string[];
    lastActiveAt: string | null;
    totalActions: number;
    taskCompletionCount: number;
    adhocTaskCreatedCount: number;
    engagementScore: number;
    status: 'Active' | 'Dormant' | 'Inactive';
    isOnline?: boolean;
}

export interface UserMonitoringScopeSummary {
    key: string;
    label: string;
    total: number;
    online: number;
    active: number;
    dormant: number;
    inactive: number;
}

export interface UserMonitoringPageBundle {
    summary: {
        totalUsers: number;
        onlineNow: number;
        activeUsers: number;
        dormantUsers: number;
        inactiveUsers: number;
    };
    archetypeSummary: UserMonitoringScopeSummary[];
    unitSummary: UserMonitoringScopeSummary[];
    archetypes: { id: string; name: string }[];
    hospitalUnits: { id: string; name: string; archetypeId: string }[];
}

export interface UserMonitoringUsersPage {
    rows: UserActivityMetric[];
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
}

export interface RolePerformanceMetric {
    unitName: string;
    roleName: string;
    usersCount: number;
    tasksCompleted: number;
    tasksOverdue: number;
    tasksOpen: number;
    healthStatus: 'Good' | 'Fair' | 'Bottleneck';
}