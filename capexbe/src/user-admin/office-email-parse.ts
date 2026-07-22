import * as XLSX from 'xlsx';

const EMAIL_CELL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function collectEmailsFromWorkbook(wb: XLSX.WorkBook): Set<string> {
  const emails = new Set<string>();
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown[][];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const s = cell == null ? '' : String(cell);
        const found = s.match(EMAIL_CELL_RE);
        if (!found) continue;
        for (const addr of found) emails.add(addr.toLowerCase());
      }
    }
  }
  return emails;
}

export function readWorkbookFromUpload(buffer: Buffer, filename: string): XLSX.WorkBook {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return XLSX.read(buffer.toString('utf8'), { type: 'string' });
  }
  return XLSX.read(buffer, { type: 'buffer' });
}
