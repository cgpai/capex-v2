/** Known category name → short label (case-insensitive match). */
const KNOWN_CATEGORY_ABBREVIATIONS: Record<string, string> = {
  'revenue maintenance': 'RM',
  'revenue growth': 'RG',
  'strategic growth': 'SG',
  'strategic pipeline': 'SP',
  'general & routine': 'GR',
  'general and routine': 'GR',
  'it infrastructure': 'IT',
  'facility upgrade': 'FU',
  'medical equipment': 'ME',
  'digital transformation': 'DT',
};

function acronymFromWords(name: string, maxLen = 4): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, maxLen).toUpperCase();
  return words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, maxLen);
}

/** Short label for table display; full name via title/tooltip. */
export function abbreviateBudgetCategoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '—';
  const known = KNOWN_CATEGORY_ABBREVIATIONS[trimmed.toLowerCase()];
  if (known) return known;
  return acronymFromWords(trimmed);
}
