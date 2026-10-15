import { expect, it } from 'vitest';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { fiscalOperationalOverview, initialOperationalFilters } from './operational-overview';

const fixture = (): FiscalDashboardSummaryResponse => ({
  meta: { generatedAt: '2026-09-24T12:00:00-03:00', dataReference: '2026-09-24', timezone: 'America/Fortaleza',
    dataCoverage: { activeContracts: 'AVAILABLE', pendingServiceOrders: 'UNAVAILABLE', criticalItems: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE', contracts: 'AVAILABLE', contractBalances: 'AVAILABLE', contractAlerts: 'AVAILABLE' },
    filtersApplied: { unidadeId: null, contratoId: [], includeExternal: false }, source: 'SAC', merCoverage: 'PROPOSTA' },
  data: { fiscal: { userId: 77, name: 'Fiscal' }, cards: { activeContracts: 2, pendingServiceOrders: null, criticalItems: null, overdueActions: null, externalViolations: null },
    priorityQueue: [], contracts: [
      { contractId: 1, contractNumber: 'CT', supplierName: 'Árvore', value: 100, expiryDate: '2026-09-24' },
      { contractId: 2, contractNumber: 'CT', supplierName: 'Outro', value: 200, expiryDate: '2027-01-22' }],
    contractBalances: [
      { contractId: 1, contractNumber: 'CT', contractedValue: 100, consumedValue: 50, balanceValue: 50, balancePct: 50 },
      { contractId: 2, contractNumber: 'CT', contractedValue: 200, consumedValue: 220, balanceValue: -20, balancePct: -10 }],
    contractAlerts: [{ alertId: 3, contractId: 1, contractNumber: 'CT', description: 'Alerta factual', expiryDate: '2026-09-24', createdAt: null }],
  },
});
it('sums only complete authorized balances, retains negatives and does not mutate the response', () => {
  const summary = fixture(); const before = structuredClone(summary);
  expect(fiscalOperationalOverview(summary, initialOperationalFilters).balanceTotal).toBe(30);
  summary.data.contractBalances!.pop();
  expect(fiscalOperationalOverview(summary, initialOperationalFilters).balanceTotal).toBeNull();
  expect(before.data.contractBalances).toHaveLength(2);
  const original = fixture(); fiscalOperationalOverview(original, initialOperationalFilters); expect(original).toEqual(before);
});
it('rejects duplicate, foreign and unsafe monetary rows', () => {
  for (const kind of ['duplicate', 'foreign', 'unsafe', 'fraction']) {
    const summary = fixture(); const rows = summary.data.contractBalances!;
    if (kind === 'duplicate') rows[1].contractId = 1;
    if (kind === 'foreign') rows[1].contractId = 999;
    if (kind === 'unsafe') rows[1].balanceValue = Number.MAX_SAFE_INTEGER;
    if (kind === 'fraction') rows[1].balanceValue = 0.001;
    expect(fiscalOperationalOverview(summary, initialOperationalFilters).balanceTotal).toBeNull();
  }
});
it('filters only operational data by intersection and keeps full portfolio KPI totals', () => {
  const summary = fixture();
  const result = fiscalOperationalOverview(summary, { contract: '1', supplier: 'Árvore', search: 'arvore', days: '30' });
  expect(result.selected?.map(row => row.contractId)).toEqual([1]);
  expect(result.balances?.map(row => row.contractId)).toEqual([1]); expect(result.alerts).toHaveLength(1);
  expect(result.balanceTotal).toBe(30); expect(result.expiring).toBe(2);
  expect(fiscalOperationalOverview(summary, { ...initialOperationalFilters, supplier: 'Outro', contract: '1' }).selected).toEqual([]);
  expect(fiscalOperationalOverview(summary, { ...initialOperationalFilters, contract: '999' }).balances).toEqual([]);
});
it('handles all inclusive factual expiry boundaries and missing dates', () => {
  const summary = fixture();
  for (const [offset, count] of [[-1, 0], [0, 1], [120, 1], [121, 0]] as const) {
    summary.data.contracts = [{ ...summary.data.contracts![0], expiryDate: new Date(Date.parse('2026-09-24T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10) }];
    expect(fiscalOperationalOverview(summary, initialOperationalFilters).expiring).toBe(count);
    expect(fiscalOperationalOverview(summary, { ...initialOperationalFilters, days: '120' }).selected).toHaveLength(count);
  }
  summary.data.contracts![0].expiryDate = null;
  expect(fiscalOperationalOverview(summary, initialOperationalFilters).expiring).toBeNull();
  expect(fiscalOperationalOverview(summary, { ...initialOperationalFilters, days: '120' }).selected).toEqual([]);
});
it('distinguishes empty available and unavailable sources without recovering unselected data', () => {
  const summary = fixture(); summary.data.contracts = []; summary.data.contractBalances = [];
  expect(fiscalOperationalOverview(summary, initialOperationalFilters)).toMatchObject({ selected: [], balances: [], balanceTotal: 0, expiring: 0 });
  const missing = fixture(); missing.meta.dataCoverage.contracts = 'UNAVAILABLE';
  expect(fiscalOperationalOverview(missing, initialOperationalFilters)).toMatchObject({ selected: null, balances: null, alerts: null, balanceTotal: null, expiring: null });
  const noBalances = fixture(); noBalances.meta.dataCoverage.contractBalances = 'UNAVAILABLE'; noBalances.meta.dataCoverage.contractAlerts = 'UNAVAILABLE';
  expect(fiscalOperationalOverview(noBalances, initialOperationalFilters)).toMatchObject({ balances: null, alerts: null, balanceTotal: null });
});
