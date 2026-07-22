/** Shared text normalization for duplicate detection (mirrors capexbe). */
export function normalizeSearchText(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase();
}

export const DUPLICATE_SEARCH_MIN_LENGTH = 2;
export const DUPLICATE_SEARCH_DEBOUNCE_MS = 400;
