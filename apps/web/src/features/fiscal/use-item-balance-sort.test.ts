import { expect, it } from 'vitest';
import { sortFiscalItems } from './use-item-balance-sort';
import { fixtures } from '../../../../../scripts/test/fixtures/fiscal-items-csv';
const balances = fixtures.committedValue.data.itemBalances;
if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing fixture');
const { itens, criterio } = balances;
const ids = (rows: readonly (typeof itens)[number][]) => rows.map(item => item.itemId);

it('keeps original order/references by default and never mutates response rows during sorting', () => {
  const original = structuredClone(itens);
  expect(sortFiscalItems(itens, criterio, 'source', 'desc')).toBe(itens);
  expect(ids(sortFiscalItems(itens, criterio, 'balance', 'asc'))).toEqual([105, 103, 102, 101, 104]);
  expect(itens).toEqual(original);
});
it.each([
  ['balance', 'asc', [105, 103, 102, 101, 104]], ['balance', 'desc', [101, 102, 103, 105, 104]],
  ['ratio', 'asc', [105, 103, 102, 101, 104]], ['ratio', 'desc', [101, 102, 103, 105, 104]],
] as const)('sorts %s %s numerically with negatives/zero and missing values always last', (key, direction, expected) => {
  expect(ids(sortFiscalItems(itens, criterio, key, direction))).toEqual(expected);
});
it.each(['asc', 'desc'] as const)('breaks numeric and missing-value ties by ascending contract/item IDs in %s', direction => {
  const rows = [
    { ...itens[0], contractId: 10, itemId: 3, valueBalance: 2.00002, pctSaldo: .00002 },
    { ...itens[0], contractId: 2, itemId: 20, valueBalance: 2.00001, pctSaldo: .00001 },
    { ...itens[0], contractId: 2, itemId: 10, valueBalance: 2.00001, pctSaldo: .00001 },
    { ...itens[3], contractId: 10, itemId: 5 }, { ...itens[3], contractId: 2, itemId: 4 },
  ];
  for (const key of ['balance', 'ratio'] as const) {
    expect(ids(sortFiscalItems(rows, criterio, key, direction))).toEqual(direction === 'asc' ? [10, 20, 3, 4, 5] : [3, 10, 20, 4, 5]);
  }
});
it('orders identification by numeric contract ID then item ID, independently of formatted numbers or sequence', () => {
  const rows = [{ ...itens[0], contractId: 10, itemId: 2, contractNumber: '1', sequence: 1 },
    { ...itens[0], contractId: 2, itemId: 10, contractNumber: null, sequence: null },
    { ...itens[0], contractId: 2, itemId: 2, contractNumber: '99', sequence: 20 }];
  expect(ids(sortFiscalItems(rows, criterio, 'identity', 'asc'))).toEqual([2, 10, 2]);
  expect(sortFiscalItems(rows, criterio, 'identity', 'desc').map(row => [row.contractId, row.itemId])).toEqual([[10, 2], [2, 10], [2, 2]]);
});
it.each([
  ['comprometido', 'valor', 'valueBalance'], ['comprometido', 'quantidade', 'quantityBalance'],
  ['medido', 'valor', 'valueMeasuredBalance'], ['medido', 'quantidade', 'quantityMeasuredBalance'],
] as const)('uses exactly the displayed balance for %s/%s without recalculating', (base, dimensao, field) => {
  const rows = [{ ...itens[0], itemId: 1, valueBalance: 10, quantityBalance: 30, valueMeasuredBalance: 20, quantityMeasuredBalance: 40 },
    { ...itens[0], itemId: 2, valueBalance: 11, quantityBalance: 31, valueMeasuredBalance: 21, quantityMeasuredBalance: 41, [field]: -1 }];
  expect(ids(sortFiscalItems(rows, { ...criterio, base, dimensao }, 'balance', 'asc'))).toEqual([2, 1]);
  expect(rows.map(row => row.faixa)).toEqual(['adequado', 'adequado']);
});
it('uses the returned ratio for the selected base and leaves missing measured ratios last', () => {
  const rows = [{ ...itens[0], itemId: 1, pctSaldo: .1, pctSaldoMedido: .9 },
    { ...itens[0], itemId: 2, pctSaldo: .9, pctSaldoMedido: .1 }, { ...itens[0], itemId: 3, pctSaldoMedido: null }];
  expect(ids(sortFiscalItems(rows, { ...criterio, base: 'medido', dimensao: 'quantidade' }, 'ratio', 'desc'))).toEqual([1, 2, 3]);
});
