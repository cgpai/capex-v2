/**
 * When Realtime fires for projects/assets, Budget HU refetches must bypass
 * client request-cache and tell Nest to skip Redis page-bundle cache.
 */
let budgetHuFreshFetchDepth = 0;

export function beginBudgetHuFreshFetch(): void {
  budgetHuFreshFetchDepth += 1;
}

export function endBudgetHuFreshFetch(): void {
  budgetHuFreshFetchDepth = Math.max(0, budgetHuFreshFetchDepth - 1);
}

export function isBudgetHuFreshFetch(): boolean {
  return budgetHuFreshFetchDepth > 0;
}

export async function runWithBudgetHuFreshFetch<T>(fn: () => Promise<T>): Promise<T> {
  beginBudgetHuFreshFetch();
  try {
    return await fn();
  } finally {
    endBudgetHuFreshFetch();
  }
}
