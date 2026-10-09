import { useMemo, useState } from 'react';
import type { FiscalItemBalance, FiscalItemBalances } from '@sac-etice-bi/contracts';

type Criteria = Extract<FiscalItemBalances, { coverage: 'AVAILABLE' }>['criterio'];
export type ItemSortKey = 'source' | 'identity' | 'balance' | 'ratio';
export type ItemSortDirection = 'asc' | 'desc';
export const itemSortLabels = { source: 'Ordem da resposta', identity: 'Contrato / item (IDs)', balance: 'Saldo disponível', ratio: 'Percentual disponível' };

export function displayedItemBalance(item: FiscalItemBalance, criteria: Criteria) {
  return criteria.dimensao === 'quantidade'
    ? criteria.base === 'medido' ? item.quantityMeasuredBalance : item.quantityBalance
    : criteria.base === 'medido' ? item.valueMeasuredBalance : item.valueBalance;
}
export const displayedItemRatio = (item: FiscalItemBalance, criteria: Criteria) => criteria.base === 'medido' ? item.pctSaldoMedido : item.pctSaldo;
const identity = (a: FiscalItemBalance, b: FiscalItemBalance) => a.contractId - b.contractId || a.itemId - b.itemId;

export function sortFiscalItems(items: readonly FiscalItemBalance[], criteria: Criteria, key: ItemSortKey, direction: ItemSortDirection) {
  if (key === 'source') return items;
  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === 'identity') return sign * identity(a, b);
    const left = key === 'balance' ? displayedItemBalance(a, criteria) : displayedItemRatio(a, criteria);
    const right = key === 'balance' ? displayedItemBalance(b, criteria) : displayedItemRatio(b, criteria);
    if (left === null || right === null) return left === right ? identity(a, b) : left === null ? 1 : -1;
    return sign * (left - right) || identity(a, b);
  });
}

export function useItemBalanceSort(items: readonly FiscalItemBalance[], balances: FiscalItemBalances | undefined, context: string | null) {
  const [stored, setStored] = useState({ context: null as string | null, key: 'source' as ItemSortKey, direction: 'asc' as ItemSortDirection });
  let selection = stored;
  if (context !== null && stored.context !== context) {
    selection = { context, key: 'source', direction: 'asc' };
    setStored(selection);
  }
  const { key, direction } = selection;
  const orderedItems = useMemo(() => balances?.coverage === 'AVAILABLE'
    ? sortFiscalItems(items, balances.criterio, key, direction) : items, [items, balances, key, direction]);
  return { orderedItems, key, direction, setSort: (change: { key?: ItemSortKey; direction?: ItemSortDirection }) => setStored(current => ({ ...current, ...change })) };
}
