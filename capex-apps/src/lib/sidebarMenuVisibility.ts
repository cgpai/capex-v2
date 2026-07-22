import { Page } from '../types';
import { NAV_ITEMS } from '../constants';

/** Kunci baris `app_config` untuk JSON `{ [Page]: boolean }`. */
export const SIDEBAR_MENU_VISIBILITY_KEY = 'sidebar_menu_visibility';

/** Halaman yang muncul di sidebar (nav utama + tombol My Profile). */
export const SIDEBAR_CONTROLLED_PAGES: readonly Page[] = [
  ...NAV_ITEMS.map((i) => i.label),
  Page.Profile,
] as const;

const PAGE_ALIASES: Record<string, Page> = {
  dashboard: Page.Dashboard,
  executivesummary: Page.ExecutiveSummary,
  budgetmultiyear: Page.BudgetMultiYear,
  budgetperiod: Page.BudgetPeriod,
  budgetarchetype: Page.BudgetArchetype,
  budgethu: Page.BudgetHU,
  capexprojectlist: Page.CapexProjectList,
  dailymomsummary: Page.DailyMOMSummary,
  mytask: Page.MyTask,
  poupdate: Page.POUpdate,
  grupdate: Page.GRUpdate,
  fsupdate: Page.FSUpdate,
  bddconstruction: Page.BDDConstruction,
  aicontroltower: Page.AIAnalytics,
  aianalytics: Page.AIAnalytics,
  usermonitoring: Page.UserMonitoring,
  datamigration: Page.DataMigration,
  configuration: Page.Configuration,
  myprofile: Page.Profile,
};

function normalizePageKey(key: string): Page | null {
  const raw = (key || '').trim();
  if (!raw) return null;
  // direct exact match to Page values
  const exact = SIDEBAR_CONTROLLED_PAGES.find((p) => p === raw);
  if (exact) return exact;
  // alias match: remove spaces/symbols + lowercase
  const norm = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PAGE_ALIASES[norm] ?? null;
}

/**
 * Normalisasi payload visibilitas agar kompatibel dengan format lama/bervariasi:
 * - object map: { "<page>": boolean }
 * - object list hidden: { hiddenMenus: string[] } / { hidden: string[] }
 */
export function normalizeSidebarMenuVisibility(input: unknown): Partial<Record<Page, boolean>> {
  const out: Partial<Record<Page, boolean>> = {};
  if (!input || typeof input !== 'object') return out;
  const obj = input as Record<string, unknown>;

  for (const [k, v] of Object.entries(obj)) {
    const page = normalizePageKey(k);
    if (page && typeof v === 'boolean') {
      out[page] = v;
    }
  }

  const hiddenRaw = obj.hiddenMenus ?? obj.hidden;
  if (Array.isArray(hiddenRaw)) {
    hiddenRaw.forEach((item) => {
      if (typeof item !== 'string') return;
      const page = normalizePageKey(item);
      if (page) out[page] = false;
    });
  }
  return out;
}

export function getDefaultSidebarMenuVisibility(): Partial<Record<Page, boolean>> {
  const v: Partial<Record<Page, boolean>> = {};
  SIDEBAR_CONTROLLED_PAGES.forEach((p) => {
    v[p] = true;
  });
  return v;
}

/** Apakah item menu sidebar ditampilkan (default: tampil jika tidak dikonfigurasi). */
export function isSidebarMenuEnabled(
  page: Page,
  visibility: Partial<Record<Page, boolean>> | null | undefined
): boolean {
  if (!SIDEBAR_CONTROLLED_PAGES.includes(page)) return true;
  const defaults = getDefaultSidebarMenuVisibility();
  const merged = { ...defaults, ...normalizeSidebarMenuVisibility(visibility) };
  return merged[page] !== false;
}

/** Minimal satu item dari NAV_ITEMS harus aktif agar navigasi utama tidak kosong. */
export function hasAtLeastOneMainNavEnabled(visibility: Partial<Record<Page, boolean>> | undefined): boolean {
  return NAV_ITEMS.some((item) => isSidebarMenuEnabled(item.label, visibility));
}
