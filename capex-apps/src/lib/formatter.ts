/**
 * Formats a number into a currency string (IDR).
 * @param value - The number to format.
 * @returns A formatted currency string, e.g., "Rp 1.000.000".
 */
export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return 'Rp 0';
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Budget view: full nominal IDR with dot thousand separators (e.g. Rp 1.234.567.890).
 * Use in KPI cards, tables, and tooltips where users need to read exact amounts.
 */
export const formatBudgetView = formatCurrency;

/**
 * Parses a formatted currency string (IDR) into a number.
 * @param value - The formatted string, e.g., "Rp 1.000.000".
 * @returns The parsed number.
 */
export const parseCurrency = (value: string): number => {
    if (typeof value !== 'string') return 0;
    // Remove "Rp", whitespace, and thousand separators "."
    const numericString = value.replace(/Rp\s*|\./g, '');
    return parseInt(numericString, 10) || 0;
};

/** Scaled amount for display (max 1 decimal, trailing .0 removed). */
function formatScaledAmount(scaled: number): string {
  const rounded = Math.round(scaled * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(1);
}

/**
 * Budget view format with international scale suffix (IDR).
 * - >= 1_000_000 → Rp 75Mn (including billions, e.g. Rp 1500Mn)
 * - >= 1_000 → Rp 500K
 * - < 1_000 → full Rp format
 */
export const formatAbbreviatedCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return 'Rp 0';
  }

  const sign = value < 0 ? '-' : '';
  const absValue = Math.abs(value);

  if (absValue < 1_000) {
    return formatCurrency(value);
  }

  let scaled: number;
  let suffix: string;
  if (absValue >= 1_000_000) {
    scaled = absValue / 1_000_000;
    suffix = 'Mn';
  } else {
    scaled = absValue / 1_000;
    suffix = 'K';
  }

  return `${sign}Rp ${formatScaledAmount(scaled)}${suffix}`;
};

/** Alias for table/view budget display (abbreviated scale). */
export const formatScaledCurrency = formatAbbreviatedCurrency;