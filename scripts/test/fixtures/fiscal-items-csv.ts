// Isolated fixtures for CSV validation; never imported by the application.
import { fiscalDashboardSummaryResponseSchema } from '../../../packages/contracts/src';
import { composeItemBalances, type RawBalanceItem } from '../../../services/api/src/shared/item-balances';
import { fixture as queueFixture } from './fiscal-queue-filters';
import { fixtures as itemFixtures } from './fiscal-item-details';
import { fiscalItemsCsv } from '../../../apps/web/src/features/fiscal/item-balances-csv';

const negative: RawBalanceItem = {
  itemId: 105, contractId: 2, contractNumber: '13/2025', supplierName: 'Zeta', sequence: 5,
  specification: 'Saldo negativo legítimo', unit: 'h',
  valueContracted: 1000, valueConsumed: 1100, valueMeasured: 1200, valueBalance: -100,
  quantityContracted: 10, quantityConsumed: 11, quantityMeasured: 12, quantityBalance: -1,
  statusVerificacao: 'verificado', blockedAt: null, blockReason: null,
  raw: { valueContracted: '1000', valueBalance: '-100', valueMeasured: '1200',
    quantityContracted: '10', quantityBalance: '-1', quantityMeasured: '12' },
};
function fixture(source: typeof itemFixtures.committedValue) {
  const result = structuredClone(queueFixture);
  result.data.itemBalances = structuredClone(source.data.itemBalances);
  if (result.data.itemBalances?.coverage === 'AVAILABLE') {
    const balances = result.data.itemBalances;
    balances.itens[0].specification = '=Serviço; "café"\nNova linha';
    balances.itens[0].statusVerificacao = '@verificação';
    const extra = composeItemBalances([negative], balances.criterio);
    if (extra.coverage === 'AVAILABLE') balances.itens.push(extra.itens[0]);
    // Financial aggregates are irrelevant to CSV, but keep the fixture internally representative.
    balances.agregados.itemCount = balances.itens.length;
    balances.resumo.critico += 1;
    balances.agregados.totalContratado = (balances.agregados.totalContratado ?? 0) + 1000;
    balances.agregados.saldoComprometido = (balances.agregados.saldoComprometido ?? 0) - 100;
    balances.agregados.saldoMedido = (balances.agregados.saldoMedido ?? 0) - 200;
    balances.agregados.completeValueRows += 1;
    balances.agregados.contractedValueRows += 1;
    balances.agregados.committedBalanceRows += 1;
    balances.agregados.measuredBalanceRows += 1;
  }
  return fiscalDashboardSummaryResponseSchema.parse(result);
}
export const fixtures = { committedValue: fixture(itemFixtures.committedValue), measuredQuantity: fixture(itemFixtures.measuredQuantity) };
export { responseForRequest } from './fiscal-queue-filters';
export function expectedCsv(summary: typeof queueFixture, itemIds: number[]) {
  const balances = summary.data.itemBalances;
  if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing fixture item source');
  return fiscalItemsCsv(itemIds.map(id => balances.itens.find(item => item.itemId === id)!), summary.meta.dataReference, balances.criterio);
}
