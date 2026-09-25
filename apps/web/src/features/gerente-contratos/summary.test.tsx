import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { ManagerDashboardView } from './summary';

it('renders available zero, unavailable expiry, and missing values distinctly', () => {
  const summary: ManagerDashboardSummaryResponse = {
    meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
      source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [] },
      dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE', expiringContracts: 'UNAVAILABLE' } },
    data: { manager: { userId: 1, name: 'Gestora' }, cards: { activeContracts: 0, activePortfolioValue: 0, expiringContracts: null },
      contracts: [], expiringContractList: null },
  };
  const html = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary }} />);
  expect(html).toContain('Gestora');
  expect(html).toContain('Nenhum contrato vigente');
  expect(html).toContain('>0</strong>');
  expect(html).toContain('Indisponível');
});
