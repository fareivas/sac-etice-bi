export type CsvCell = string | number | null | undefined;

// Numbers retain their sign. Only source text receives formula protection.
function cell(value: CsvCell) {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function encodeCsv(rows: readonly (readonly CsvCell[])[]) {
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

export const csvReferenceSuffix = (reference: string) => reference.replace(/[^0-9-]/g, '') || 'sem-data';

export function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Release after the browser has started consuming the download URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
