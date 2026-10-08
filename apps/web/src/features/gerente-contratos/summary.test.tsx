import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
import { ManagerDashboardView } from './summary';

const base: ManagerDashboardSummaryResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
    source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [] },
    dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE',
      expiringContracts: 'AVAILABLE', renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE' } },
  data: { manager: { userId: 1, name: 'Gestora' },
    cards: { activeContracts: 0, activePortfolioValue: 0, expiringContracts: 0, renewalsWithin120Days: 0 },
    contracts: [], expiringContractList: [], contractAlerts: [], contractBalances: [] },
};
const render = (summary: ManagerDashboardSummaryResponse) =>
  renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary }} />);

it('renders available zero and an empty expiry list', () => {
  const html = render(base);
  expect(html).toContain('Gestora');
  expect(html).toContain('Vencimento nos próximos 120 dias');
  expect(html).toContain('Nenhum contrato na janela');
  expect(html).toContain('>0</strong>');
});
it('renders the actual count and summary list without renewal claims', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base,
    data: { ...base.data,
      cards: { ...base.data.cards, activeContracts: 1, expiringContracts: 1, renewalsWithin120Days: 1 },
      expiringContractList: [{ contractId: 17, contractNumber: 'CT-17', supplierName: 'Fornecedor X', value: 100, expiryDate: '2027-01-23' }] } };
  const html = render(summary);
  expect(html).toContain('CT-17');
  expect(html).toContain('Fornecedor X');
  expect(html).toContain('2027-01-23');
  expect(html).not.toContain('Renovação iniciada');
});
it('renders unavailable when vigencia_fim cannot classify the portfolio', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base,
    meta: { ...base.meta, dataCoverage: { ...base.meta.dataCoverage,
      expiringContracts: 'UNAVAILABLE', renewalsWithin120Days: 'UNAVAILABLE' } },
    data: { ...base.data, cards: { ...base.data.cards, expiringContracts: null, renewalsWithin120Days: null },
      expiringContractList: null } };
  const html = render(summary);
  expect(html).toContain('Indisponível');
  expect(html).not.toContain('Nenhum contrato na janela');
});

it('renders official fiscal load fields and unavailable capacity', () => {
  const load: ManagerFiscalLoadResponse = {
    meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25',
      timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
      dataCoverage: { inspectors: 'AVAILABLE', activeContracts: 'AVAILABLE', pendingOrders: 'AVAILABLE',
        capacity: 'UNAVAILABLE', weightedLoad: 'UNAVAILABLE', criticality: 'UNAVAILABLE',
        ranking: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' } },
    data: { inspectors: [{ userId: 7, name: 'Fiscal Sete', activeContracts: 2, pendingOrders: 3,
      capacity: null, weightedLoad: null, criticality: null, ranking: null, overdueActions: null }] },
  };
  const html = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, load }} />);
  expect(html).toContain('Contratos vigentes');
  expect(html).toContain('<td>Fiscal Sete</td><td>2</td><td>3</td><td>Indisponível</td>');
});

it('renders factual supplier value and unavailable supplier indicators', () => {
  const suppliers = {
    meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
      source: 'SAC' as const, merCoverage: 'PROPOSTA' as const,
      pagination: { page: 1, pageSize: 25, totalItems: 1 },
      dataCoverage: { suppliers: 'AVAILABLE' as const, vigentValue: 'AVAILABLE' as const,
        abcClass: 'UNAVAILABLE' as const, openFinancialAmount: 'UNAVAILABLE' as const,
        openCriticalRisks: 'UNAVAILABLE' as const } },
    data: { suppliers: [{ supplierId: 7, name: 'Fornecedor Real', vigentValue: 100,
      abcClass: null, openFinancialAmount: null, openCriticalRisks: null }] },
  };
  const html = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, suppliers }} />);
  expect(html).toContain('Fornecedores da carteira');
  expect(html).toContain('<td>Fornecedor Real</td><td>100</td><td>Indisponível</td><td>Indisponível</td><td>Indisponível</td>');
  expect(html).not.toContain('Curva ABC');
});

it('renders real alerts, balance amounts and the financial chart while preserving existing sections', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base, data: { ...base.data,
    contractAlerts: [{ alertId: 206, contractId: 41, contractNumber: 'CT-41', type: 'designacao_ausente', status: 'em_tratamento', description: 'Pendência de teste', expiryDate: '2026-10-20', createdAt: '2026-10-01T12:00:00Z' }],
    contractBalances: [{ contractId: 41, contractNumber: 'CT-41', contractedValue: 200, consumedValue: 50, balanceValue: 150, balancePct: 75 }] } };
  const html = render(summary).replaceAll('\u00a0', ' ');
  for (const label of ['Alertas contratuais', 'designacao_ausente', 'em_tratamento', 'Pendência de teste', '2026-10-20', 'Saldos da carteira', 'R$ 200,00', 'R$ 50,00', 'R$ 150,00', '75%', 'Fiscais e distribuição da carteira', 'Fornecedores da carteira', 'Contratos vigentes da carteira']) expect(html).toContain(label);
  expect(html).toContain('aria-label="Distribuição financeira por contrato"');
  expect(html).toContain('<rect');
  expect(html).not.toContain('Classificação de risco');
});

it('distinguishes empty lists from unavailable coverage and omits the chart in both cases', () => {
  const empty = render(base);
  expect(empty).toContain('Nenhum alerta contratual no recorte');
  expect(empty).toContain('Nenhum saldo contratual no recorte');
  expect(empty).not.toContain('<svg');
  const unavailable: ManagerDashboardSummaryResponse = { ...base,
    meta: { ...base.meta, dataCoverage: { ...base.meta.dataCoverage, contractAlerts: 'UNAVAILABLE', contractBalances: 'UNAVAILABLE' } },
    data: { ...base.data, contractAlerts: null, contractBalances: null } };
  const html = render(unavailable);
  expect(html).toMatch(/Alertas contratuais[\s\S]*?Indisponível[\s\S]*?<\/section>/);
  expect(html).toMatch(/Saldos da carteira[\s\S]*?Indisponível[\s\S]*?<\/section>/);
  expect(html).not.toContain('Nenhum alerta contratual');
  expect(html).not.toContain('Nenhum saldo contratual');
  expect(html).not.toContain('<svg');
});
