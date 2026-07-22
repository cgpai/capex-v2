const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

/** Placeholder kosong dari Excel: –, —, -, N/A, dll. */
const EMPTY_CELL_PATTERN = /^[\s.\u2010-\u2015\u2212\-–—―]*$|^#N\/A$|^N\/A$|^na$/i;

export const isEmptyMigrationCellValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number' && !Number.isFinite(value)) return true;
  const raw = String(value).trim();
  if (!raw) return true;
  return EMPTY_CELL_PATTERN.test(raw);
};

export const normalizeMigrationTaskName = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const toLocalDateString = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Sama dengan capexapp dataManagementService.parseExcelDateValue */
export const parseExcelDateValue = (value: unknown): string | null => {
  if (isEmptyMigrationCellValue(value)) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateString(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = EXCEL_EPOCH_UTC_MS + Math.round(value * 86400000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return toLocalDateString(d);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 1000) {
      const ms = EXCEL_EPOCH_UTC_MS + Math.round(numeric * 86400000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return toLocalDateString(d);
    }
  }

  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const yearRaw = Number(m[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);
    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    if (!Number.isNaN(d.getTime())) return toLocalDateString(d);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return toLocalDateString(fallback);
  return null;
};

/** Kolom DATE opsional (Reschedule) → YYYY-MM-DD atau null. */
export const parseOptionalMigrationDate = (value: unknown): string | null => {
  if (isEmptyMigrationCellValue(value)) return null;
  return parseExcelDateValue(value);
};

/** Parse angka dari Excel (number, Rp, format ID 1.234.567, US 1,234,567). */
export const parseMigrationNumberValue = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/[Rp\s\u00A0]/gi, '').trim();
  if (!s) return 0;

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return parseFloat(s.replace(/,/g, '')) || 0;
  }

  const cleaned = s.replace(/[^0-9,-]+/g, '').replace(/,(?=.*,)/g, '');
  const normalized =
    cleaned.includes(',') && !cleaned.includes('.') ? cleaned.replace(',', '.') : cleaned;
  return parseFloat(normalized) || 0;
};

/** Completion Date Time → ISO string; default now jika kosong. */
export const parseMigrationCompletionIso = (
  value: unknown,
  fallback: Date = new Date(),
): string => {
  if (isEmptyMigrationCellValue(value)) return fallback.toISOString();

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = EXCEL_EPOCH_UTC_MS + Math.round(value * 86400000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const raw = String(value).trim();

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 1000) {
      const ms = EXCEL_EPOCH_UTC_MS + Math.round(numeric * 86400000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const yearRaw = Number(m[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);
    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const dateOnly = parseExcelDateValue(value);
  if (dateOnly) {
    const d = new Date(`${dateOnly}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const fallbackParsed = new Date(raw);
  if (!Number.isNaN(fallbackParsed.getTime())) return fallbackParsed.toISOString();

  throw new Error(`Invalid completion date: ${raw}`);
};
