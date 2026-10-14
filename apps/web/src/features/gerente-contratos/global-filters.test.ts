import { describe, expect, it } from 'vitest';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
import { initialGlobalFilters, projectManagerSummary, selectGlobalContracts } from './global-filters';

const contracts = [
  { contractId: 1, contractNumber: 'CT-1', supplierName: 'Árvore Ltda', value: 100, expiryDate: '2026-09-25' },
  { contractId: 2, contractNumber: 'CT-2', supplierName: 'Beta', value: 200, expiryDate: '2026-12-24' },
  { contractId: 3, contractNumber: 'CT-3', supplierName: 'Gama', value: 300, expiryDate: '2027-03-24' },
  { contractId: 4, contractNumber: 'CT-4', supplierName: 'Delta', value: 400, expiryDate: '2027-09-25' },
  { contractId: 5, contractNumber: 'CT-5', supplierName: 'Sem data', value: null, expiryDate: null },
];
const risk = (contractId: number, saldo: string, vigencia: string) => ({ contractId,
  saldo: { status: saldo }, vigencia });
const summary = { meta: { dataReference: '2026-09-25', dataCoverage: { portfolio: 'AVAILABLE', contractRiskMatrix: 'AVAILABLE',
  activeContracts: 'AVAILABLE', activePortfolioValue: 'UNAVAILABLE', expiringContracts: 'UNAVAILABLE',
  renewalsWithin120Days: 'UNAVAILABLE', renewalDecisionsD90: 'AVAILABLE', registrationCompleteness: 'AVAILABLE' } },
  data: { contracts, cards: { activeContracts: 5, activePortfolioValue: null, expiringContracts: null, renewalsWithin120Days: null },
    contractRiskMatrix: [risk(1, 'CRITICAL', 'OK'), risk(2, 'OK', 'ATTENTION'), risk(3, 'ATTENTION', 'CRITICAL'),
      risk(4, 'OK', 'OK'), risk(5, 'UNAVAILABLE', 'UNAVAILABLE')],
    contractAlerts: [{ contractId: 1 }, { contractId: 3 }], contractBalances: [{ contractId: 1 }, { contractId: 3 }],
    itemBalances: { coverage: 'UNAVAILABLE' }, preventiveQuality: { renewalDecisionsD90: {}, registrationCompleteness: {} },
    expiringContractList: null } } as unknown as ManagerDashboardSummaryResponse;
const load = { meta: { dataCoverage: { inspectors: 'AVAILABLE' } }, data: { inspectors: [
  { userId: 7, name: 'João Árvore', contractIds: [1, 3], activeContracts: 2, pendingOrders: 1 },
  { userId: 8, name: 'Maria', contractIds: [2, 4], activeContracts: 2, pendingOrders: 0 },
] } } as unknown as ManagerFiscalLoadResponse;
const selected = (changes = {}) => [...(selectGlobalContracts(summary, load, { ...initialGlobalFilters, ...changes }) ?? [])];

describe('GC-034 global manager filters', () => {
  it('uses inclusive D0, D+90, D+180 and D+365 and excludes missing expiry', () => {
    expect(selected({ days: 90 })).toEqual([1, 2]);
    expect(selected()).toEqual([1, 2, 3]);
    expect(selected({ days: 365 })).toEqual([1, 2, 3, 4]);
  });
  it('intersects fiscal, risk on saldo or vigencia, window and accent-insensitive search', () => {
    expect(selected({ fiscal: '7', risk: 'CRITICAL' })).toEqual([1, 3]);
    expect(selected({ fiscal: '7', risk: 'CRITICAL', days: 90 })).toEqual([1]);
    expect(selected({ fiscal: '8', risk: 'CRITICAL' })).toEqual([]);
    expect(selected({ search: 'JOAO ARVORE' })).toEqual([1, 3]);
    expect(selected({ search: 'arvore ltda' })).toEqual([1]);
    expect(selected({ search: 'ct-2' })).toEqual([2]);
    expect(selected({ search: '3' })).toEqual([3]);
    expect(selected({ risk: 'UNAVAILABLE', days: 365 })).toEqual([]);
  });
  it('does not infer fiscal or risk selection when source is unavailable', () => {
    expect(selectGlobalContracts(summary, null, { ...initialGlobalFilters, fiscal: '7' })).toBeNull();
    expect(selectGlobalContracts(summary, null, { ...initialGlobalFilters, search: 'CT-1' })).toBeNull();
    const unavailable = structuredClone(summary);
    unavailable.data.contractRiskMatrix = null;
    expect(selectGlobalContracts(unavailable, load, { ...initialGlobalFilters, risk: 'CRITICAL' })).toBeNull();
  });
  it('projects only selected contract relationships and recalculates supported cards', () => {
    const result = projectManagerSummary(summary, new Set([1, 2]));
    expect(result.subset).toBe(true);
    expect(result.summary.data.cards).toMatchObject({ activeContracts: 2, activePortfolioValue: 300,
      renewalsWithin120Days: 2 });
    expect(result.summary.data.contractAlerts?.map(item => item.contractId)).toEqual([1]);
    expect(result.summary.data.contractRiskMatrix?.map(item => item.contractId)).toEqual([1, 2]);
    expect(result.summary.meta.dataCoverage.renewalDecisionsD90).toBe('UNAVAILABLE');
    expect(projectManagerSummary(summary, new Set([5])).summary.data.cards.activePortfolioValue).toBeNull();
  });
});
