// Browser-only test fixtures. They are never imported by the application or written to a database.
import { composeItemBalances, type RawBalanceItem } from '../../../services/api/src/shared/item-balances';
import { fiscalDashboardSummaryResponseSchema } from '../../../packages/contracts/src';

function row(id: number, balance: number | null, measured: number | null): RawBalanceItem {
  const total = balance === null ? null : 1000;
  const consumed = balance === null ? null : 1000 - balance;
  return {
    itemId: id, contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor de teste',
    sequence: id - 100, specification: `Item de teste ${id}`, unit: balance === null ? null : 'h',
    valueContracted: total, valueConsumed: consumed, valueMeasured: measured, valueBalance: balance,
    quantityContracted: total === null ? null : total / 100,
    quantityConsumed: consumed === null ? null : consumed / 100,
    quantityMeasured: measured === null ? null : measured / 100,
    quantityBalance: balance === null ? null : balance / 100,
    statusVerificacao: balance === null ? null : 'verificado', blockedAt: null, blockReason: null,
    raw: {
      valueContracted: total === null ? null : String(total), valueBalance: balance === null ? null : String(balance),
      valueMeasured: measured === null ? null : String(measured),
      quantityContracted: total === null ? null : String(total / 100),
      quantityBalance: balance === null ? null : String(balance / 100),
      quantityMeasured: measured === null ? null : String(measured / 100),
    },
  };
}
const rows = [row(101, 800, 150), row(102, 400, 500), row(103, 0, 1000), row(104, null, null)];
function fixture(base: 'comprometido' | 'medido', dimensao: 'valor' | 'quantidade', attention: number, critical: number) {
  const selectedRows = base === 'medido'
    ? [{ ...rows[0], valueMeasured: null, quantityMeasured: null,
      raw: { ...rows[0].raw, valueMeasured: null, quantityMeasured: null } }, ...rows.slice(1)]
    : rows;
  return fiscalDashboardSummaryResponseSchema.parse({
    meta: { generatedAt: '2026-10-08T12:00:00-03:00', dataReference: '2026-10-08', timezone: 'America/Fortaleza',
      source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [2], unidadeId: null, includeExternal: false },
      dataCoverage: { activeContracts: 'AVAILABLE', pendingServiceOrders: 'AVAILABLE', criticalItems: 'UNAVAILABLE',
        overdueActions: 'UNAVAILABLE', contracts: 'AVAILABLE', contractBalances: 'AVAILABLE', contractAlerts: 'AVAILABLE' } },
    data: { fiscal: { userId: 77, name: 'Fixture visual local — sem acesso ao banco' },
      cards: { activeContracts: 1, pendingServiceOrders: 0, criticalItems: null, overdueActions: null, externalViolations: null },
      priorityQueue: [], contractAlerts: [],
      contracts: [{ contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor de teste', value: 300000, expiryDate: '2027-10-08' }],
      contractBalances: [{ contractId: 2, contractNumber: '13/2025', contractedValue: 300000, consumedValue: 0, balanceValue: 300000, balancePct: 100 }],
      itemBalances: composeItemBalances(selectedRows, { base, dimensao, limiar_atencao: attention, limiar_critico: critical }),
    },
  });
}
export const fixtures = {
  committedValue: fixture('comprometido', 'valor', .6, .1),
  measuredQuantity: fixture('medido', 'quantidade', .75, .2),
};
