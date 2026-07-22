import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import type { BudgetItem, BudgetMultiYear, BudgetPeriod, User, UserRole } from '@/types';

const STORAGE_KEY = 'capex.appBootstrap.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseUsers(raw: unknown): User[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((o) => ({
    id: Number(o.id),
    username: typeof o.username === 'string' ? o.username : '',
    email: typeof o.email === 'string' ? o.email : '',
    phoneNumber: typeof o.phoneNumber === 'string' ? o.phoneNumber : undefined,
    assignments: Array.isArray(o.assignments) ? (o.assignments as User['assignments']) : [],
  })).filter((u) => Number.isFinite(u.id) && u.username);
}

function parseRoles(raw: unknown): UserRole[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = Number(item.id);
      const roleName = typeof item.roleName === 'string' ? item.roleName : '';
      if (!Number.isFinite(id) || !roleName) return null;
      return {
        id,
        roleName,
        permissions: Array.isArray(item.permissions)
          ? (item.permissions as UserRole['permissions'])
          : [],
      };
    })
    .filter((r): r is UserRole => r != null);
}

function parseBudgetItem(raw: unknown): BudgetItem | null {
  if (!isRecord(raw)) return null;
  const source = raw;
  const readNum = (camel: string, snake: string) => {
    const val = source[camel] ?? source[snake];
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const budgetPlan = readNum('budgetPlan', 'budget_plan');
  const budgetCarryForward = readNum('budgetCarryForward', 'budget_carry_forward');
  const budgetAllocated = readNum('budgetAllocated', 'budget_allocated');
  const approvedBudget = readNum('approvedBudget', 'approved_budget');
  const consumedBudget = readNum('consumedBudget', 'consumed_budget');
  if (
    budgetPlan == null ||
    budgetCarryForward == null ||
    budgetAllocated == null ||
    approvedBudget == null ||
    consumedBudget == null
  ) {
    return null;
  }
  return {
    budgetPlan,
    budgetCarryForward,
    budgetAllocated,
    approvedBudget,
    consumedBudget,
    ...(typeof source.assetCount === 'number' ? { assetCount: source.assetCount } : {}),
    ...(typeof source.noBudgetAssetCount === 'number' ? { noBudgetAssetCount: source.noBudgetAssetCount } : {}),
  };
}

function parseMultiYears(raw: unknown): BudgetMultiYear[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const name = typeof item.name === 'string' ? item.name : '';
      const startYear = Number(item.startYear ?? item.start_year);
      const endYear = Number(item.endYear ?? item.end_year);
      const budget = parseBudgetItem(item.budget);
      if (!name || !Number.isFinite(startYear) || !Number.isFinite(endYear) || !budget) return null;
      return { name, startYear, endYear, budget };
    })
    .filter((r): r is BudgetMultiYear => r != null);
}

function parsePeriods(raw: unknown): BudgetPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const periodName = typeof item.periodName === 'string' ? item.periodName : '';
      const multiYearName = typeof item.multiYearName === 'string' ? item.multiYearName : '';
      const startDate = typeof item.startDate === 'string' ? item.startDate : '';
      const endDate = typeof item.endDate === 'string' ? item.endDate : '';
      if (!periodName) return null;
      const budget: Record<string, BudgetItem> = {};
      if (isRecord(item.budget)) {
        for (const [key, value] of Object.entries(item.budget)) {
          const parsed = parseBudgetItem(value);
          if (parsed) budget[key] = parsed;
        }
      }
      return {
        periodName,
        multiYearName,
        startDate,
        endDate,
        budget,
        archetypes: Array.isArray(item.archetypes) ? (item.archetypes as BudgetPeriod['archetypes']) : [],
      };
    })
    .filter((r): r is BudgetPeriod => r != null);
}

/** Payload bootstrap terakhir — shell app + TanStack Query instant setelah F5. */
export function readCachedBootstrap(): AppBootstrapPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!isRecord(o)) return null;
    const users = parseUsers(o.users);
    const roles = parseRoles(o.roles);
    const multiYears = parseMultiYears(o.multiYears);
    const allPeriods = parsePeriods(o.allPeriods);
    if (!users.length && !roles.length && !allPeriods.length) return null;
    return { users, roles, multiYears, allPeriods };
  } catch {
    return null;
  }
}

export function writeCachedBootstrap(payload: AppBootstrapPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedBootstrap(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function hasCachedAppShell(): boolean {
  return readCachedBootstrap() != null;
}
