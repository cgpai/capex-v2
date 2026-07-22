/**
 * Project code format: {HU}.{YY}.{nn}
 * - HU: hospital unit code
 * - YY: 2-digit calendar year (from budget period name)
 * - nn: 2-digit running number (01–99) within HU+YY; routine aggregator project uses "RA" (assets use HU.YY.00.nnn).
 */

export function yyFromPeriodName(periodName: string): string {
    const y = periodName.match(/\d{4}/)?.[0] || String(new Date().getFullYear());
    return y.slice(-2);
}

/** Largest numeric third segment for codes HU.YY.nn (ignores routine HU.YY.RA and non-numeric suffixes). */
export function maxNnForHuYy(
    projects: readonly { projectCode?: string; isRoutineAssetAggregator?: boolean }[],
    huCode: string,
    yy: string
): number {
    let max = 0;
    for (const p of projects) {
        if (p.isRoutineAssetAggregator) continue;
        const code = p.projectCode || '';
        const parts = code.split('.');
        if (parts.length < 3 || parts[0] !== huCode || parts[1] !== yy) continue;
        const n = parseInt(parts[2], 10);
        if (!Number.isNaN(n) && n > max) max = n;
    }
    return max;
}
