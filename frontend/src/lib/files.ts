// Unduhan berkas, CSV (dengan pencegahan formula injection), dan Excel (.xlsx, dimuat saat dibutuhkan).

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Teks yang diawali = + - @ diberi apostrof agar tidak dijalankan sebagai rumus di Excel/Sheets.
const safeText = (v: unknown) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s; };

export function downloadCSV(name: string, rows: unknown[][]) {
  const cell = (v: unknown) => '"' + safeText(v).replace(/"/g, '""') + '"';
  download(name, '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

export function parseCSV(input: string): string[][] {
  const text = String(input || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

export interface XlsxSheet { name: string; rows: unknown[][]; widths?: number[]; head?: boolean }

export async function downloadXlsx(name: string, sheets: XlsxSheet[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  type Cell = { value: string | number; type: StringConstructor | NumberConstructor; fontWeight?: 'bold'; backgroundColor?: string; color?: string } | null;
  const data = sheets.map(sh => ({
    sheet: sh.name,
    columns: sh.widths ? sh.widths.map(width => ({ width })) : undefined,
    data: sh.rows.map((r, i) => r.map((v): Cell => (i === 0 && sh.head !== false
      ? { value: String(v), type: String, fontWeight: 'bold', backgroundColor: '#00529C', color: '#FFFFFF' }
      : typeof v === 'number' && isFinite(v) ? { value: v, type: Number }
      : v == null || v === '' ? null : { value: safeText(v), type: String })))
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const write = writeXlsxFile as any;
  const out = data.length === 1 ? write(data[0].data, { sheet: data[0].sheet, columns: data[0].columns }) : write(data);
  const blob: Blob = await out.toBlob();
  download(name, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** Baca semua sheet dari file .xlsx → [{ sheet, data: baris[][] }]. */
export async function readXlsx(file: File): Promise<{ sheet: string; data: unknown[][] }[]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const out = await readXlsxFile(file);
  return out.map(s => ({ sheet: s.sheet, data: s.data as unknown[][] }));
}
