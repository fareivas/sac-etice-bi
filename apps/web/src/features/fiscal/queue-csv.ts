import { csvReferenceSuffix, downloadCsv, encodeCsv } from '../../lib/csv';
import type { filterFiscalQueue } from './use-fiscal-queue-filters';

type VisibleQueue = ReturnType<typeof filterFiscalQueue>;
const generalReason = 'Decisão fiscal pendente no Processo 1';

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
  return encodeCsv(rows);
}

export function downloadFiscalQueueCsv(visible: VisibleQueue, reference: string) {
  if (!visible.length) return;
  downloadCsv(fiscalQueueCsv(visible, reference), `fila-fiscal-${csvReferenceSuffix(reference)}.csv`);
}
