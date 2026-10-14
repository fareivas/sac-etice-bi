import { expect, it } from 'vitest';
import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { contractOccurrences, occurrenceCoverage } from './occurrences';

function summary() {
  return {
    meta: { dataCoverage: { contractAlerts: 'AVAILABLE', contractRiskMatrix: 'AVAILABLE' } },
    data: {
      contractAlerts: [
        { alertId: 5, contractId: 2, contractNumber: 'CT-10', type: 'vigencia', status: 'aberta', description: 'Primeiro alerta' },
        { alertId: 8, contractId: 2, contractNumber: 'CT-10', type: 'saldo', status: 'em_tratamento', description: 'Segundo alerta' },
        { alertId: 3, contractId: 1, contractNumber: 'CT-2', type: null, status: 'aberta', description: null },
      ],
      contractRiskMatrix: [
        { contractId: 2, contractNumber: 'CT-10', supplierName: 'Fornecedor B', saldo: { status: 'CRITICAL' }, vigencia: 'CRITICAL' },
        { contractId: 1, contractNumber: 'CT-2', supplierName: 'Fornecedor A', saldo: { status: 'ATTENTION' }, vigencia: 'OK' },
        { contractId: 3, contractNumber: 'CT-3', supplierName: null, saldo: { status: 'UNAVAILABLE' }, vigencia: 'UNAVAILABLE' },
      ],
    },
  } as unknown as ManagerDashboardSummaryResponse;
}

it('preserves alert and matrix identities, groups by contract and orders without priority', () => {
  const result = contractOccurrences(summary(), false);
  expect(result.rows.map(row => row.key)).toEqual([
    'alerta:3', 'alerta:5', 'alerta:8', 'matriz:2:Saldo', 'matriz:2:Vigência',
  ]);
  expect(result.rows.map(row => row.contractId)).toEqual([1, 2, 2, 2, 2]);
  expect(result.rows[1]).toMatchObject({ signal: 'Alerta 5 · vigencia · aberta', detail: 'Primeiro alerta', supplierName: 'Fornecedor B' });
  expect(result.rows[2].detail).toBe('Segundo alerta');
  expect(result.rows[0].detail).toBe('Descrição indisponível');
});

it('keeps source coverage independent and distinguishes empty, partial and unavailable', () => {
  const partial = summary();
  partial.data.contractAlerts = null;
  partial.meta.dataCoverage.contractAlerts = 'UNAVAILABLE';
  expect(contractOccurrences(partial, false)).toMatchObject({ state: 'partial', alertsAvailable: false, matrixAvailable: true });
  expect(contractOccurrences(partial, false).rows.map(row => row.key)).toEqual(['matriz:2:Saldo', 'matriz:2:Vigência']);
  expect(occurrenceCoverage(contractOccurrences(partial, false))).toContain('Cobertura parcial');
  partial.data.contractRiskMatrix = null;
  partial.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE';
  expect(contractOccurrences(partial, false).state).toBe('sources-unavailable');
  expect(contractOccurrences(partial, true).rows).toEqual([]);
  expect(contractOccurrences(partial, true).state).toBe('scope-unavailable');
  const empty = summary();
  empty.data.contractAlerts = [];
  empty.data.contractRiskMatrix = [];
  expect(contractOccurrences(empty, false).state).toBe('empty');
  expect(contractOccurrences(empty, false, true).state).toBe('empty-scope');
});
