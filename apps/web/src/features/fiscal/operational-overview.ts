import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { daysFromReference } from '../gerente-contratos/global-filters';

export type OperationalFilters = { contract: string; supplier: string; days: string; search: string };
export const initialOperationalFilters: OperationalFilters = { contract: '', supplier: '', days: '', search: '' };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function fiscalOperationalOverview(summary: FiscalDashboardSummaryResponse, filters: OperationalFilters) {
  const contracts = summary.meta.dataCoverage.contracts === 'AVAILABLE' ? summary.data.contracts : null;
  const unique = contracts && new Map(contracts.map(row => [row.contractId, row]));
  const selected = unique ? [...unique.values()].filter(row => {
    if (filters.contract && String(row.contractId) !== filters.contract) return false;
    if (filters.supplier && row.supplierName !== filters.supplier) return false;
    if (filters.days) {
      const days = daysFromReference(row.expiryDate, summary.meta.dataReference);
      if (days === null || days < 0 || days > Number(filters.days)) return false;
    }
    return !filters.search.trim() || normalize([row.contractNumber, row.contractId, row.supplierName].join(' ')).includes(normalize(filters.search.trim()));
  }) : null;
  const ids = selected && new Set(selected.map(row => row.contractId));
  const balanceSource = summary.meta.dataCoverage.contractBalances === 'AVAILABLE' ? summary.data.contractBalances : null;
  const balances = ids && balanceSource ? balanceSource.filter(row => ids.has(row.contractId)) : null;
  const alerts = ids && summary.meta.dataCoverage.contractAlerts === 'AVAILABLE' && summary.data.contractAlerts
    ? summary.data.contractAlerts.filter(row => ids.has(row.contractId)) : null;
  // A total requires exactly one balance for every authorized contract, never a partial sum.
  let balanceTotal: number | null = null;
  if (unique && contracts?.length === unique.size && balanceSource && balanceSource.length === unique.size &&
      new Set(balanceSource.map(row => row.contractId)).size === unique.size && balanceSource.every(row => unique.has(row.contractId))) {
    let cents = 0;
    const complete = balanceSource.every(row => {
      const value = Math.round(row.balanceValue * 100);
      if (!Number.isSafeInteger(value) || Math.abs(value / 100 - row.balanceValue) > 1e-6 || !Number.isSafeInteger(cents + value)) return false;
      cents += value; return true;
    });
    if (complete) balanceTotal = cents / 100;
  }
  const expiryComplete = contracts !== null && contracts.every(row => daysFromReference(row.expiryDate, summary.meta.dataReference) !== null);
  const expiring = expiryComplete ? [...unique!.values()].filter(row => {
    const days = daysFromReference(row.expiryDate, summary.meta.dataReference)!;
    return days >= 0 && days <= 120;
  }).length : null;
  return { contracts: unique ? [...unique.values()] : null, selected, balances, alerts, balanceTotal, expiring,
    suppliers: [...new Set(contracts?.flatMap(row => row.supplierName === null ? [] : [row.supplierName]) ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')) };
}
