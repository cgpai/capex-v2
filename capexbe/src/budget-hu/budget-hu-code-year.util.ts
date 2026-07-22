/** 2-digit year from budget period name (e.g. "2026" → "26"). */
export function yyFromPeriodName(periodName: string): string {
  const y = periodName.match(/\d{4}/)?.[0] || String(new Date().getFullYear());
  return y.slice(-2);
}
