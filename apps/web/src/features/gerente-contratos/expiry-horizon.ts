import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { daysFromReference, type GlobalFilters } from './global-filters';

const ranges = [
  { label: 'D0–30', start: 0, end: 30 },
  { label: 'D31–60', start: 31, end: 60 },
  { label: 'D61–90', start: 61, end: 90 },
  { label: 'D91–120', start: 91, end: 120 },
  { label: 'D121–180', start: 121, end: 180 },
] as const;
type Contract = NonNullable<ManagerDashboardSummaryResponse['data']['contracts']>[number];
export type ExpiryRow = Contract & { days: number; band: string };

export function expiryHorizon(summary: ManagerDashboardSummaryResponse, selectedIds: ReadonlySet<number> | null,
  globalDays: GlobalFilters['days']) {
  const effectiveDays = Math.min(globalDays, 180);
  const contracts = summary.data.contracts;
  const available = summary.meta.dataCoverage.portfolio === 'AVAILABLE' && contracts !== null && selectedIds !== null;
  const partial = available && contracts.some(contract => daysFromReference(contract.expiryDate, summary.meta.dataReference) === null);
  const rows: ExpiryRow[] = [];
  const seen = new Set<number>();
  if (available) for (const contract of contracts) {
    if (seen.has(contract.contractId)) continue;
    seen.add(contract.contractId);
    const days = daysFromReference(contract.expiryDate, summary.meta.dataReference);
    if (!selectedIds.has(contract.contractId) || days === null || days < 0 || days > effectiveDays) continue;
    rows.push({ ...contract, days, band: ranges.find(range => days <= range.end)!.label });
  }
  rows.sort((a, b) => a.days - b.days ||
    (a.contractNumber ?? String(a.contractId)).localeCompare(b.contractNumber ?? String(b.contractId), 'pt-BR', { numeric: true }) || a.contractId - b.contractId);
  return { available, partial, effectiveDays, rows, total: available && !partial ? rows.length : null,
    emptyMessage: contracts?.length === 0 ? 'Carteira autorizada sem contratos.' : 'Nenhum contrato no recorte selecionado.',
    bands: ranges.map(range => ({ ...range, outside: range.start > effectiveDays,
      count: available && range.start <= effectiveDays ? rows.filter(row => row.band === range.label).length : null })),
  };
}
