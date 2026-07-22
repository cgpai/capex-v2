import type { FsEnrichedProject } from '../../hooks/queries/fetchFsUpdatePageData';
import { formatCurrency } from '../../lib/formatter';
import { isFsUpdateSpecialProject } from './FSUpdateTableRow';

export type FsUpdateSummary = {
  submittedQty: number;
  submittedAmountIdr: number;
  approvedQty: number;
  approvedAmountIdr: number;
  notApprovedQty: number;
};

const APPROVED_FS_STATUSES = new Set(['Approved', 'Approved with Notes']);

export type SortOption = 'projectCode_asc' | 'projectName_asc' | 'huName_asc' | 'budgetPlan_desc';

export type FsEditableProject = FsEnrichedProject & {
  __fsApprovalChecked?: boolean;
};

export const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export function normalizeProjectCodeForLookup(code: string): string {
  return String(code ?? '').trim().toLowerCase();
}

export function findFsProjectByCode(
  projects: FsEnrichedProject[],
  code: string,
): FsEnrichedProject | null {
  const norm = normalizeProjectCodeForLookup(code);
  if (!norm) return null;
  return (
    projects.find((p) => normalizeProjectCodeForLookup(p.projectCode || '') === norm) ?? null
  );
}

export function resolveFsApproval(project: FsEditableProject): boolean {
  if (project.__fsApprovalChecked !== undefined) {
    return project.__fsApprovalChecked;
  }
  const axCode = String(project.axCode ?? '').trim();
  const approvedBudget = Number(project.approvedBudget) || 0;
  return axCode !== '' && approvedBudget > 0;
}

export function applyAutoFsApproval(project: FsEditableProject): FsEditableProject {
  const axCode = String(project.axCode ?? '').trim();
  const approvedBudget = Number(project.approvedBudget) || 0;
  if (project.__fsApprovalChecked !== undefined) {
    return project;
  }
  return {
    ...project,
    fsApproval: axCode !== '' && approvedBudget > 0,
  };
}

export function computeFsUpdateSummary(
  projects: FsEnrichedProject[],
  fsByProjectId: Record<string, { id: string; conclusion: string; amount: number }>,
): FsUpdateSummary {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  let submittedQty = 0;
  let submittedAmountIdr = 0;
  let approvedQty = 0;
  let approvedAmountIdr = 0;

  for (const [projectId, fs] of Object.entries(fsByProjectId)) {
    const project = projectMap.get(projectId);
    if (!project) continue;

    submittedQty += 1;
    const approvedBudget = Number(project.approvedBudget) || 0;

    if (APPROVED_FS_STATUSES.has(fs.conclusion)) {
      approvedQty += 1;
      approvedAmountIdr += approvedBudget;
    } else {
      submittedAmountIdr += approvedBudget;
    }
  }

  return {
    submittedQty,
    submittedAmountIdr,
    approvedQty,
    approvedAmountIdr,
    notApprovedQty: submittedQty - approvedQty,
  };
}

export function filterAndSortFsProjects(
  data: FsEnrichedProject[],
  options: {
    showOnlyNotFSApproved: boolean;
    focusNeedingApproval: boolean;
    debouncedSearch: string;
    selectedHUs: string[];
    meetingArchetype: string | null;
    sortBy: SortOption;
  },
): FsEnrichedProject[] {
  let result = data;

  if (options.showOnlyNotFSApproved) {
    result = result.filter((project) => !resolveFsApproval(project as FsEditableProject));
  }

  if (options.focusNeedingApproval) {
    result = result.filter((project) => (Number(project.approvedBudget) || 0) === 0);
  }

  const lowercasedFilter = options.debouncedSearch.toLowerCase().trim();
  if (lowercasedFilter || options.meetingArchetype || options.selectedHUs.length > 0) {
    result = result.filter((project) => {
      if (
        options.meetingArchetype &&
        normalize(project.archetypeName) !== normalize(options.meetingArchetype)
      ) {
        return false;
      }
      if (
        options.selectedHUs.length > 0 &&
        !options.selectedHUs.some((hu) => normalize(hu) === normalize(project.huName))
      ) {
        return false;
      }
      if (lowercasedFilter) {
        const axCode = String(project.axCode ?? '').toLowerCase();
        const matches =
          project.projectName.toLowerCase().includes(lowercasedFilter) ||
          project.huName.toLowerCase().includes(lowercasedFilter) ||
          project.archetypeName.toLowerCase().includes(lowercasedFilter) ||
          project.projectCode?.toLowerCase().includes(lowercasedFilter) ||
          axCode.includes(lowercasedFilter);
        if (!matches) return false;
      }
      return true;
    });
  }

  return [...result].sort((a, b) => {
    switch (options.sortBy) {
      case 'projectCode_asc':
        return (a.projectCode || '').localeCompare(b.projectCode || '');
      case 'projectName_asc':
        return a.projectName.localeCompare(b.projectName);
      case 'huName_asc':
        return a.huName.localeCompare(b.huName);
      case 'budgetPlan_desc':
        return b.budgetPlan - a.budgetPlan;
      default:
        return 0;
    }
  });
}

const FS_PATCH_FIELDS = [
  'axCode',
  'approvedBudget',
  'targetBudgetStart',
  'budgetRevenuePermonth',
] as const;

export function diffChangedFsProjects(
  original: FsEnrichedProject[],
  merged: FsEnrichedProject[],
): FsEnrichedProject[] {
  const originalMap = new Map(original.map((p) => [p.id, p]));

  return merged.filter((edited) => {
    const orig = originalMap.get(edited.id);
    if (!orig) return true;
    return FS_PATCH_FIELDS.some((field) => edited[field] !== orig[field]);
  });
}

export function toFsProjectSavePatch(project: FsEnrichedProject) {
  return {
    id: String(project.id),
    axCode: project.axCode ?? null,
    approvedBudget: Number(project.approvedBudget) || 0,
    targetBudgetStart: project.targetBudgetStart ?? null,
    budgetRevenuePermonth: Number(project.budgetRevenuePermonth) || 0,
  };
}

export function buildFsChangeSummaryRows(
  original: FsEnrichedProject[],
  edited: FsEnrichedProject[],
): { item: string; before: string; after: string }[] {
  const originalMap = new Map(original.map((p) => [p.id, p]));
  const rows: { item: string; before: string; after: string }[] = [];

  for (const project of edited) {
    const orig = originalMap.get(project.id);
    if (!orig) continue;

    if (orig.axCode !== project.axCode) {
      rows.push({
        item: `${project.projectName} AX Code`,
        before: orig.axCode || '—',
        after: project.axCode || '—',
      });
    }
    if (orig.approvedBudget !== project.approvedBudget) {
      rows.push({
        item: `${project.projectName} Approved Budget`,
        before: formatCurrency(orig.approvedBudget),
        after: formatCurrency(project.approvedBudget),
      });
    }
    if ((orig.targetBudgetStart ?? '') !== (project.targetBudgetStart ?? '')) {
      rows.push({
        item: `${project.projectName} Target Budget Start`,
        before: orig.targetBudgetStart || '—',
        after: project.targetBudgetStart || '—',
      });
    }
    if ((orig.budgetRevenuePermonth ?? 0) !== (project.budgetRevenuePermonth ?? 0)) {
      rows.push({
        item: `${project.projectName} Budget Revenue/Month`,
        before: formatCurrency(orig.budgetRevenuePermonth ?? 0),
        after: formatCurrency(project.budgetRevenuePermonth ?? 0),
      });
    }
  }

  return rows;
}

export function projectsWithNewFsApproval(
  original: FsEnrichedProject[],
  merged: FsEnrichedProject[],
): FsEnrichedProject[] {
  const originalMap = new Map(original.map((p) => [p.id, p]));
  return merged.filter((project) => {
    const orig = originalMap.get(project.id);
    const wasApproved = resolveFsApproval((orig ?? project) as FsEditableProject);
    const isApproved = resolveFsApproval(project as FsEditableProject);
    return !wasApproved && isApproved;
  });
}

export { isFsUpdateSpecialProject };
