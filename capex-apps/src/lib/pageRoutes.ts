import { Page } from '../types';

/** Segmen URL (tanpa slash) per screen; Dashboard = root `/`. */
export const PAGE_TO_SLUG: Record<Page, string> = {
  [Page.Dashboard]: '',
  [Page.ExecutiveSummary]: 'executive-summary',
  [Page.BudgetMultiYear]: 'multi-year-budget',
  [Page.BudgetPeriod]: 'budget-period',
  [Page.BudgetArchetype]: 'budget-archetype',
  [Page.BudgetHU]: 'budget-hu',
  [Page.CapexProjectList]: 'capex-project-list',
  [Page.DailyMOMSummary]: 'daily-mom-summary',
  [Page.MyTask]: 'my-task',
  [Page.POUpdate]: 'po-update',
  [Page.GRUpdate]: 'gr-update',
  [Page.FSUpdate]: 'fs-update',
  [Page.FSApproval]: 'fs-approval',
  [Page.FSRealization]: 'fs-realization',
  [Page.BDDConstruction]: 'bdd-construction',
  [Page.AIAnalytics]: 'ai-analytics',
  [Page.UserMonitoring]: 'user-monitoring',
  [Page.DataMigration]: 'data-migration',
  [Page.Configuration]: 'configuration',
  [Page.Profile]: 'profile',
};

export const SLUG_TO_PAGE: Record<string, Page> = (() => {
  const m: Record<string, Page> = {};
  (Object.entries(PAGE_TO_SLUG) as [Page, string][]).forEach(([page, slug]) => {
    if (slug) m[slug] = page;
  });
  return m;
})();

/** Path Next.js → screen (slug pertama). Tidak dikenal → Dashboard. */
export function pathnameToPage(pathname: string): Page {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  const first = trimmed.split('/').filter(Boolean)[0] ?? '';
  if (!first) return Page.Dashboard;
  return SLUG_TO_PAGE[first] ?? Page.Dashboard;
}

/** Screen → href untuk `router.push` / `<Link href>` */
export function pageToHref(page: Page): string {
  const slug = PAGE_TO_SLUG[page];
  return slug ? `/${slug}` : '/';
}
