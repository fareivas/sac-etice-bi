import type { FiscalItemBalance, FiscalItemBalances } from '@sac-etice-bi/contracts';
import { csvReferenceSuffix, downloadCsv, encodeCsv } from '../../lib/csv';

type Criteria = Extract<FiscalItemBalances, { coverage: 'AVAILABLE' }>['criterio'];

/** Serializes only response values, with no classification, balance or missing-measurement calculations. */
export function fiscalItemsCsv(items: readonly FiscalItemBalance[], reference: string, criteria: Criteria) {
  return encodeCsv([
    ['Data de referência', 'ID do contrato', 'Contrato', 'ID do item', 'Sequência do item', 'Fornecedor', 'Descrição', 'Unidade',
      'Valor contratado', 'Valor consumido', 'Valor medido', 'Saldo comprometido em valor', 'Saldo medido em valor',
      'Quantidade contratada', 'Quantidade consumida', 'Quantidade medida', 'Saldo comprometido em quantidade', 'Saldo medido em quantidade',
      'Saldo comprometido / contratado (razão decimal)', 'Saldo medido / contratado (razão decimal)', 'Faixa', 'Status de verificação',
      'Bloqueado em', 'Motivo do bloqueio', 'Base da classificação', 'Dimensão da classificação',
      'Limiar de atenção (decimal, provisório)', 'Limiar crítico (decimal, provisório)'],
    ...items.map(item => [reference, item.contractId, item.contractNumber, item.itemId, item.sequence,
      item.supplierName, item.specification, item.unit, item.valueContracted, item.valueConsumed, item.valueMeasured,
      item.valueBalance, item.valueMeasuredBalance, item.quantityContracted, item.quantityConsumed, item.quantityMeasured,
      item.quantityBalance, item.quantityMeasuredBalance, item.pctSaldo, item.pctSaldoMedido,
      item.faixa, item.statusVerificacao, item.blockedAt, item.blockReason,
      criteria.base, criteria.dimensao, criteria.limiar_atencao, criteria.limiar_critico]),
  ]);
}

export function downloadFiscalItemsCsv(items: readonly FiscalItemBalance[], reference: string, criteria: Criteria) {
  if (!items.length) return;
  downloadCsv(fiscalItemsCsv(items, reference, criteria), `itens-fiscal-${csvReferenceSuffix(reference)}.csv`);
}
