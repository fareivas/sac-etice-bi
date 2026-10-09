import type { filterFiscalQueue } from './use-fiscal-queue-filters';

type VisibleQueue = ReturnType<typeof filterFiscalQueue>;
const generalReason = 'Decisão fiscal pendente no Processo 1';

// Quote every cell and neutralize formula prefixes, including after whitespace/control characters.
function cell(value: string | number | null | undefined) {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function fiscalQueueCsv(visible: VisibleQueue, reference: string) {
  const rows: (string | number | null | undefined)[][] = [
    ['Data de referência', 'ID da OS', 'ID do contrato', 'Contrato', 'Fornecedor', 'ID da pendência', 'Descrição', 'Status'],
  ];
  for (const { item, pendencies } of visible) {
    const base = [reference, item.serviceOrderId, item.contractId, item.contractNumber, item.supplierName];
    if (!pendencies.length) rows.push([...base, null, generalReason, null]);
    else for (const pendency of pendencies) rows.push([...base, pendency.pendencyId,
      pendency.description?.trim() ? pendency.description : generalReason, pendency.status]);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function downloadFiscalQueueCsv(visible: VisibleQueue, reference: string) {
  if (!visible.length) return;
  const url = URL.createObjectURL(new Blob([fiscalQueueCsv(visible, reference)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fila-fiscal-${reference.replace(/[^0-9-]/g, '') || 'sem-data'}.csv`;
  document.body.append(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Release after the browser has started consuming the download URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
