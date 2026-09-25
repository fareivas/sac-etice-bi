import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { ManagerDashboardView } from './summary';

const base: ManagerDashboardSummaryResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
    source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [] },
    dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE',
      expiringContracts: 'AVAILABLE', renewalsWithin120Days: 'AVAILABLE' } },
  data: { manager: { userId: 1, name: 'Gestora' },
    cards: { activeContracts: 0, activePortfolioValue: 0, expiringContracts: 0, renewalsWithin120Days: 0 },
    contracts: [], expiringContractList: [] },
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
