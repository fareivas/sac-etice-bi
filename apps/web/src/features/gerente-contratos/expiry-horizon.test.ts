import { expect, it } from 'vitest';
import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { expiryHorizon } from './expiry-horizon';
const manager: ManagerDashboardSummaryResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
    filtersApplied: { contratoId: [] }, dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE', expiringContracts: 'AVAILABLE',
      renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE', itemBalances: 'UNAVAILABLE', renewalDecisionsD90: 'UNAVAILABLE',
      registrationCompleteness: 'UNAVAILABLE', contractRiskMatrix: 'AVAILABLE' } },
  data: { manager: { userId: 1, name: 'Gestora' },
    cards: { activeContracts: 1, activePortfolioValue: 1000, expiringContracts: 1, renewalsWithin120Days: 1 },
    contracts: [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X', value: 1000, expiryDate: '2026-10-25' }],
    expiringContractList: [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X', value: 1000, expiryDate: '2026-10-25' }],
    contractAlerts: [], contractBalances: [], itemBalances: { coverage: 'UNAVAILABLE' },
    preventiveQuality: { renewalDecisionsD90: null, registrationCompleteness: null },
    contractRiskMatrix: [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X', saldo: { status: 'CRITICAL', partialCoverage: false, reason: null },
      vigencia: 'OK', sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }],
  },
};


const date = (days: number) => new Date(Date.parse(`${manager.meta.dataReference}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
function fixture(days: (number | null)[]) {
  const summary = structuredClone(manager);
  summary.meta.dataCoverage.portfolio = 'AVAILABLE';
  summary.data.contracts = days.map((day, index) => ({ contractId: index + 1, contractNumber: `CT-${index + 1}`,
    supplierName: null, value: null, expiryDate: day === null ? null : date(day) }));
  return summary;
}
const ids = (summary: ManagerDashboardSummaryResponse) => new Set(summary.data.contracts!.map(row => row.contractId));
it('classifies every inclusive boundary and excludes past and D181 dates without mutation', () => {
  const summary = fixture([-1, 0, 30, 31, 60, 61, 90, 91, 120, 121, 180, 181]);
  const before = structuredClone(summary);
  const result = expiryHorizon(summary, ids(summary), 180);
  expect(result.total).toBe(10);
  expect(result.bands.map(band => band.count)).toEqual([2, 2, 2, 2, 2]);
  expect(result.rows.map(row => row.days)).toEqual([0, 30, 31, 60, 61, 90, 91, 120, 121, 180]);
  expect(summary).toEqual(before);
});
it.each([90, 180, 365] as const)('intersects the global %s-day window', days => {
  const summary = fixture([0, 30, 31, 60, 61, 90, 91, 120, 121, 180, 181]);
  const result = expiryHorizon(summary, ids(summary), days);
  expect(result.effectiveDays).toBe(Math.min(days, 180));
  expect(result.total).toBe(days === 90 ? 6 : 10);
  expect(result.bands.map(band => band.outside)).toEqual([false, false, false, days === 90, days === 90]);
  expect(result.bands.slice(3).map(band => band.count)).toEqual(days === 90 ? [null, null] : [2, 2]);
});
it('deduplicates, isolates authorized IDs and sorts by days, number and ID', () => {
  const summary = fixture([30, 0, 30, 30]);
  summary.data.contracts![0].contractNumber = 'CT-2';
  summary.data.contracts![2].contractNumber = 'CT-1';
  summary.data.contracts![3].contractNumber = 'CT-1';
  summary.data.contracts!.push({ ...summary.data.contracts![0] });
  const result = expiryHorizon(summary, new Set([1, 2, 3, 4, 999]), 180);
  expect(result.rows.map(row => row.contractId)).toEqual([2, 3, 4, 1]);
  expect(result.total).toBe(4);
  expect(expiryHorizon(summary, new Set([3, 999]), 180).rows.map(row => row.contractId)).toEqual([3]);
});
it('checks coverage on the original portfolio independently of renewal coverage', () => {
  const summary = fixture([null, 30]);
  summary.meta.dataCoverage.renewalsWithin120Days = 'AVAILABLE';
  const result = expiryHorizon(summary, new Set([2]), 180);
  expect(result.partial).toBe(true);
  expect(result.total).toBeNull();
  expect(result.bands[0].count).toBe(1);
  expect(result.rows).toHaveLength(1);
  expect(expiryHorizon(summary, new Set(), 180).total).toBeNull();
});
it('distinguishes available empty portfolio and empty selection from unavailable sources', () => {
  const empty = fixture([]);
  expect(expiryHorizon(empty, new Set(), 180)).toMatchObject({ available: true, total: 0, rows: [], partial: false });
  const summary = fixture([30]);
  expect(expiryHorizon(summary, new Set(), 180)).toMatchObject({ available: true, total: 0, rows: [] });
  expect(expiryHorizon(summary, null, 180)).toMatchObject({ available: false, total: null, rows: [] });
  summary.meta.dataCoverage.portfolio = 'UNAVAILABLE';
  expect(expiryHorizon(summary, ids(summary), 180)).toMatchObject({ available: false, total: null, rows: [] });
  summary.meta.dataCoverage.portfolio = 'AVAILABLE';
  summary.data.contracts = null;
  expect(expiryHorizon(summary, new Set([1]), 180)).toMatchObject({ available: false, total: null, rows: [] });
});
