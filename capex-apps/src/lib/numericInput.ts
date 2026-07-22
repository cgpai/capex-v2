/**
 * Normalizes numeric typing to prevent leading zeros (e.g. "0123" → "123").
 * Preserves "0", decimals ("0.5"), and negative values.
 */
export function normalizeNumericTyping(value: string): string {
  if (!value) return value;

  const negative = value.startsWith('-');
  let body = negative ? value.slice(1) : value;

  if (body.includes('.')) {
    const [intPart, ...rest] = body.split('.');
    const decPart = rest.join('.');
    const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0';
    body = decPart.length > 0 ? `${normalizedInt}.${decPart}` : normalizedInt;
  } else {
    body = body.replace(/^0+(?=\d)/, '') || body;
  }

  return negative ? `-${body}` : body;
}

/** Parse a numeric input string; returns 0 for empty/invalid. */
export function parseNumericInput(value: string): number {
  const normalized = normalizeNumericTyping(value.trim());
  if (!normalized || normalized === '-' || normalized === '.') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Format a number for controlled numeric text inputs (no grouping). */
export function formatNumericForInput(value: number | null | undefined): string {
  if (value === null || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }
  return String(value);
}

const groupedIntegerFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format integer amounts with Indonesian thousand separators (e.g. 1.000.000.000). */
export function formatGroupedNumberForInput(value: number | null | undefined): string {
  if (value === null || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }
  return groupedIntegerFormatter.format(value);
}

/** Parse grouped integer input; strips thousand separators and non-digits. */
export function parseGroupedNumericInput(value: string): number {
  if (!value) return 0;
  const digitsOnly = value.replace(/[^\d-]/g, '');
  if (!digitsOnly || digitsOnly === '-') return 0;
  const parsed = parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Pick display/parse helpers based on grouping mode. */
export function formatNumericForInputMode(
  value: number | null | undefined,
  groupThousands: boolean,
): string {
  return groupThousands ? formatGroupedNumberForInput(value) : formatNumericForInput(value);
}

export function parseNumericInputMode(value: string, groupThousands: boolean): number {
  return groupThousands ? parseGroupedNumericInput(value) : parseNumericInput(value);
}

/** Clamp a parsed number to optional min/max bounds. */
export function clampNumericValue(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}
