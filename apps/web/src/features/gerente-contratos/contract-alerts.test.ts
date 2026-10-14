// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { alertAgeDays, alertTypeKey, formatAlertRegistered, managerAlertsCsv, selectContractAlerts,
  type AlertFilters, type ContractAlert } from './contract-alerts';

const alert = (alertId: number, contractId: number, contractNumber: string | null,
  createdAt: string | null, change: Partial<ContractAlert> = {}): ContractAlert => ({
  alertId, contractId, contractNumber, type: 'vigencia', description: 'Renovação pendente',
  status: 'aberta', expiryDate: '2026-11-30', createdAt, ...change,
});
const all: AlertFilters = { contract: '', type: '', status: '', search: '' };
const rows = [
  alert(8, 2, 'CT-10', '2026-09-20T12:00:00-03:00'),
  alert(4, 1, 'CT-2', '2026-09-19T12:00:00-03:00', { type: 'designacao_ausente', status: 'em_tratamento', description: 'Fiscal Árvore' }),
  alert(3, 1, 'CT-2', '2026-09-19T12:00:00-03:00', { type: null, description: null, expiryDate: null }),
  alert(9, 3, 'CT-2', null, { type: 'vigencia', description: 'Outra carteira' }),
  alert(2, 1, 'CT-2', null, { type: 'vigencia', description: 'Sem data' }),
];

it('groups by contract ID, sorts contract numbers naturally, and keeps each alert once in creation/ID order', () => {
  const result = selectContractAlerts(rows, all);
  expect(result.groups.map(group => group.contractId)).toEqual([1, 3, 2]);
  expect(result.groups[0].alerts.map(item => item.alertId)).toEqual([3, 4, 2]);
  expect(result.visible.map(item => item.alertId)).toEqual([3, 4, 2, 9, 8]);
  expect(new Set(result.visible.map(item => item.alertId)).size).toBe(rows.length);
  expect(rows.map(item => item.alertId)).toEqual([8, 4, 3, 9, 2]);
});

it('combines contract, type, state and accent/case insensitive text without changing the source', () => {
  expect(selectContractAlerts(rows, { ...all, contract: '1' }).visible.map(item => item.alertId)).toEqual([3, 4, 2]);
  expect(selectContractAlerts(rows, { ...all, type: alertTypeKey(null) }).visible.map(item => item.alertId)).toEqual([3]);
  expect(selectContractAlerts(rows, { ...all, status: 'em_tratamento' }).visible.map(item => item.alertId)).toEqual([4]);
  for (const search of ['ARVORE', 'árvore', 'EM TRATAMENTO', 'designacao_ausente', 'ct-2'])
    expect(selectContractAlerts(rows, { ...all, search }).visible.length).toBeGreaterThan(0);
  expect(selectContractAlerts(rows, { contract: '1', type: alertTypeKey('designacao_ausente'),
    status: 'em_tratamento', search: 'FISCAL ARVORE' }).visible.map(item => item.alertId)).toEqual([4]);
  expect(selectContractAlerts(rows, { ...all, contract: '2', type: alertTypeKey(null) }).visible).toEqual([]);
});

it('formats registration in the dashboard timezone and only computes reliable calendar age', () => {
  expect(formatAlertRegistered('2026-10-01T02:00:00Z', 'America/Fortaleza')).toContain('30/09/2026');
  expect(alertAgeDays('2026-10-01T02:00:00Z', '2026-10-02', 'America/Fortaleza')).toBe(2);
  expect(alertAgeDays('2026-10-02T23:00:00Z', '2026-10-02', 'America/Fortaleza')).toBe(0);
  expect(alertAgeDays('2026-10-04T02:00:00Z', '2026-10-02', 'America/Fortaleza')).toBeNull();
  expect(alertAgeDays(null, '2026-10-02', 'America/Fortaleza')).toBeNull();
  expect(alertAgeDays('2026-10-01T02:00:00Z', 'sem-data', 'America/Fortaleza')).toBeNull();
  expect(formatAlertRegistered(null, 'America/Fortaleza')).toBe('Indisponível');
});

it('exports exactly the ordered visible rows with safe quotes, line breaks and nulls', () => {
  const injected = alert(20, 1, 'CT-2', '2026-09-19T12:00:00-03:00',
    { type: 'A;B', description: '=SOMA("x")\nsegunda linha' });
  const visible = selectContractAlerts([...rows, injected], { ...all, contract: '1' }).visible;
  const csv = managerAlertsCsv(visible, 'America/Fortaleza');
  expect(csv).toContain('"Contrato";"Tipo";"Estado";"Descrição";"Data de registro";"Vencimento contratual"');
  expect(csv).toContain('"CT-2";"A;B";"aberta";"\'=SOMA(""x"")\nsegunda linha"');
  expect(csv).toContain('"Indisponível"');
  expect(csv.split('"CT-2";').length - 1).toBe(4);
  expect(csv).not.toContain('CT-10');
  expect(csv.charCodeAt(0)).toBe(0xFEFF);
});
