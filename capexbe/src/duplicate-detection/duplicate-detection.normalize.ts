/** Shared text normalization for duplicate detection (FE + BE). */
export function normalizeSearchText(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeSearchText(text)
      .split(' ')
      .filter((w) => w.length > 0),
  );
}

/** 0–1 token overlap ratio for lightweight fuzzy matching. */
export function fuzzyTokenScore(a: string, b: string): number {
  const wordsA = tokenSet(a);
  const wordsB = tokenSet(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap += 1;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

/** Higher = better match. Used to rank search hits. */
export function scoreDuplicateMatch(normalizedQuery: string, ...fields: string[]): number {
  if (!normalizedQuery || normalizedQuery.length < 2) return 0;
  let best = 0;
  for (const field of fields) {
    const n = normalizeSearchText(field);
    if (!n) continue;
    if (n === normalizedQuery) best = Math.max(best, 100);
    else if (n.startsWith(normalizedQuery)) best = Math.max(best, 92);
    else if (normalizedQuery.startsWith(n)) best = Math.max(best, 88);
    else if (n.includes(normalizedQuery)) best = Math.max(best, 80);
    else if (normalizedQuery.includes(n) && n.length >= 4) best = Math.max(best, 72);
    else {
      const fuzzy = fuzzyTokenScore(normalizedQuery, n);
      if (fuzzy >= 0.5) best = Math.max(best, Math.floor(50 + fuzzy * 40));
    }
  }
  return best;
}
