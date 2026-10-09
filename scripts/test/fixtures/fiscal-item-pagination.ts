// Test-only portfolio with 51 items, constructed by the existing service. No database access.
import { fiscalDashboardSummaryResponseSchema } from '../../../packages/contracts/src';
import { composeItemBalances, type RawBalanceItem } from '../../../services/api/src/shared/item-balances';
import { fixture as queueFixture } from './fiscal-queue-filters';
import { fiscalItemsCsv } from '../../../apps/web/src/features/fiscal/item-balances-csv';
const rows: RawBalanceItem[] = Array.from({ length: 51 }, (_, index) => {
  const balance = 900 - index * 10;
  return { itemId: 1001 + index, contractId: index < 30 ? 2 : 184,
    contractNumber: index < 30 ? '13/2025' : '20/2022', supplierName: index < 30 ? 'Fornecedor A' : 'Fornecedor B',
    sequence: index + 1, specification: `Serviço ${String(index + 1).padStart(2, '0')} de teste`, unit: 'h',
    valueContracted: 1000, valueConsumed: 1000 - balance, valueMeasured: 200, valueBalance: balance,
    quantityContracted: 10, quantityConsumed: (1000 - balance) / 100, quantityMeasured: 2, quantityBalance: balance / 100,
    statusVerificacao: 'verificado', blockedAt: null, blockReason: null,
    raw: { valueContracted: '1000', valueBalance: String(balance), valueMeasured: '200',
      quantityContracted: '10', quantityBalance: String(balance / 100), quantityMeasured: '2' } };
});
const summary = structuredClone(queueFixture);
summary.data.itemBalances = composeItemBalances(rows, { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 });
export const fixture = fiscalDashboardSummaryResponseSchema.parse(summary);
export { responseForRequest } from './fiscal-queue-filters';
export function expectedCsv(summary: typeof fixture, ids: number[]) {
  const balances = summary.data.itemBalances;
  if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing test source');
  return fiscalItemsCsv(ids.map(id => balances.itens.find(item => item.itemId === id)!), summary.meta.dataReference, balances.criterio);
}
