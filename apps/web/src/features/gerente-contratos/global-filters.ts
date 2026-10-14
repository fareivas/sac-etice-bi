import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
import { filteredAggregates } from '../item-balances/use-item-balance-filters';

export type GlobalFilters = { fiscal: string; risk: string; days: 90 | 180 | 365; search: string };
export const initialGlobalFilters: GlobalFilters = { fiscal: '', risk: '', days: 180, search: '' };
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function daysFromReference(date: string | null, reference: string): number | null {
  if (date === null) return null;
  const start = Date.parse(`${reference}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const days = (end - start) / 86_400_000;
  return Number.isInteger(days) ? days : null;
}

export function selectGlobalContracts(summary: ManagerDashboardSummaryResponse,
  load: ManagerFiscalLoadResponse | null | undefined, filters: GlobalFilters): Set<number> | null {
  const contracts = summary.data.contracts;
  if (summary.meta.dataCoverage.portfolio !== 'AVAILABLE' || contracts === null) return null;
  const inspectors = load?.meta.dataCoverage.inspectors === 'AVAILABLE' ? load.data.inspectors : null;
  const fiscal = filters.fiscal ? inspectors?.find(item => String(item.userId) === filters.fiscal) : null;
  if (filters.fiscal && (!fiscal || !fiscal.contractIds)) return null;
  const matrix = summary.meta.dataCoverage.contractRiskMatrix === 'AVAILABLE' ? summary.data.contractRiskMatrix : null;
  if (filters.risk && matrix === null) return null;
  const riskById = new Map(matrix?.map(row => [row.contractId, row]) ?? []);
  const query = normalize(filters.search.trim());
  if (query && (!inspectors || inspectors.some(item => !item.contractIds))) return null;
  const fiscalIds = new Set(fiscal?.contractIds ?? []);
  return new Set(contracts.filter(contract => {
    const days = daysFromReference(contract.expiryDate, summary.meta.dataReference);
    if (days === null || days < 0 || days > filters.days) return false;
    if (filters.fiscal && !fiscalIds.has(contract.contractId)) return false;
    if (filters.risk) {
      const row = riskById.get(contract.contractId);
      if (!row || (row.saldo.status !== filters.risk && row.vigencia !== filters.risk)) return false;
    }
    if (query) {
      const fiscalNames = inspectors!.filter(item => item.contractIds!.includes(contract.contractId))
        .map(item => item.name ?? '');
      if (![contract.contractNumber ?? '', String(contract.contractId), contract.supplierName ?? '', ...fiscalNames]
        .some(value => normalize(value).includes(query))) return false;
    }
    return true;
  }).map(contract => contract.contractId));
}

function sumValues(values: (number | null)[]): number | null {
  if (values.some(value => value === null)) return null;
  let cents = 0;
  for (const value of values) {
    const next = Math.round(value! * 100);
    if (!Number.isSafeInteger(next) || Math.abs(next / 100 - value!) > 1e-6 ||
      !Number.isSafeInteger(cents + next)) return null;
    cents += next;
  }
  return cents / 100;
}

export function projectManagerSummary(summary: ManagerDashboardSummaryResponse, ids: Set<number>) {
  const contracts = summary.data.contracts;
  if (contracts === null || (ids.size === contracts.length && contracts.every(item => ids.has(item.contractId))))
    return { summary, subset: false };
  const selected = contracts.filter(item => ids.has(item.contractId));
  const value = sumValues(selected.map(item => item.value));
  const expiryAvailable = selected.every(item => item.expiryDate !== null);
  const expiring = expiryAvailable ? selected.filter(item => {
    const days = daysFromReference(item.expiryDate, summary.meta.dataReference);
    return days !== null && days >= 0 && days <= 120;
  }) : null;
  const itemBalances = summary.data.itemBalances;
  const items = itemBalances.coverage === 'AVAILABLE' ? (() => {
    const itens = itemBalances.itens.filter(item => ids.has(item.contractId));
    return { ...itemBalances, itens, agregados: { ...itemBalances.agregados, ...filteredAggregates(itens),
      completeValueRows: itens.filter(item => item.valueContracted !== null && item.valueBalance !== null).length },
      resumo: { adequado: itens.filter(item => item.faixa === 'adequado').length,
        atencao: itens.filter(item => item.faixa === 'atencao').length,
        critico: itens.filter(item => item.faixa === 'critico').length,
        nao_verificavel: itens.filter(item => item.faixa === 'nao_verificavel').length } };
  })() : itemBalances;
  const projected: ManagerDashboardSummaryResponse = {
    ...summary,
    meta: { ...summary.meta, dataCoverage: { ...summary.meta.dataCoverage,
      activeContracts: 'AVAILABLE', activePortfolioValue: value === null ? 'UNAVAILABLE' : 'AVAILABLE',
      expiringContracts: expiring === null ? 'UNAVAILABLE' : 'AVAILABLE',
      renewalsWithin120Days: expiring === null ? 'UNAVAILABLE' : 'AVAILABLE',
      renewalDecisionsD90: 'UNAVAILABLE', registrationCompleteness: 'UNAVAILABLE' } },
    data: { ...summary.data,
      cards: { activeContracts: selected.length, activePortfolioValue: value,
        expiringContracts: expiring?.length ?? null, renewalsWithin120Days: expiring?.length ?? null },
      contracts: selected, expiringContractList: expiring,
      contractAlerts: summary.data.contractAlerts?.filter(item => ids.has(item.contractId)) ?? null,
      contractBalances: summary.data.contractBalances?.filter(item => ids.has(item.contractId)) ?? null,
      contractRiskMatrix: summary.data.contractRiskMatrix?.filter(item => ids.has(item.contractId)) ?? null,
      itemBalances: items,
      preventiveQuality: { renewalDecisionsD90: null, registrationCompleteness: null },
    },
  };
  return { summary: projected, subset: true };
}
