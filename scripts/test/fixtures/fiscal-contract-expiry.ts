// Browser-only responses, intercepted by the visual runner; no backend/database fixture.
import { fiscalDashboardSummaryResponseSchema } from '../../../packages/contracts/src';
import { fixtures as itemFixtures } from './fiscal-item-details';

function fixture(reference: string, dates: (string | null)[], labels: string[]) {
  const summary = structuredClone(itemFixtures.committedValue);
  summary.meta.dataReference = reference;
  summary.data.fiscal.name = 'Fixture local de vigência — sem acesso ao banco';
  summary.meta.filtersApplied.contratoId = dates.map((_, index) => index + 201);
  summary.data.cards.activeContracts = dates.length;
  summary.data.contracts = dates.map((expiryDate, index) => ({ contractId: index + 201,
    contractNumber: `CT-${index + 201}`, supplierName: 'Fornecedor de teste', value: 1000, expiryDate }));
  summary.data.contractAlerts = dates.map((expiryDate, index) => ({ contractId: index + 201,
    contractNumber: `CT-${index + 201}`, alertId: index + 301,
    description: 'Pendência já retornada pela API (fixture)', expiryDate, createdAt: null }));
  summary.data.contractBalances = [];
  summary.data.itemBalances = { coverage: 'UNAVAILABLE' };
  return { summary: fiscalDashboardSummaryResponseSchema.parse(summary), labels };
}
const yearBoundary = fixture('2026-12-31', ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-30', null],
  ['Vencido há 1 dia', 'Vence hoje', 'Vence em 1 dia', 'Vence em 30 dias', 'Data de vigência indisponível']);
const leapYear = fixture('2024-02-28', ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', null],
  ['Vencido há 1 dia', 'Vence hoje', 'Vence em 1 dia', 'Vence em 2 dias', 'Data de vigência indisponível']);
const historical = structuredClone(leapYear.summary);
for (const key of Object.keys(historical.meta.dataCoverage) as (keyof typeof historical.meta.dataCoverage)[]) {
  historical.meta.dataCoverage[key] = 'UNAVAILABLE';
}
historical.data.cards = { activeContracts: null, pendingServiceOrders: null, criticalItems: null, overdueActions: null, externalViolations: null };
historical.data.contracts = null;
historical.data.contractAlerts = null;
historical.data.contractBalances = null;
historical.data.priorityQueue = null;
export const fixtures = { yearBoundary, leapYear,
  historicalUnavailable: { summary: fiscalDashboardSummaryResponseSchema.parse(historical), labels: [] } };
