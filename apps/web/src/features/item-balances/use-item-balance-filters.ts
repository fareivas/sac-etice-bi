import { useMemo, useState } from 'react';
import type { FiscalItemBalance, FiscalItemBalances } from '@sac-etice-bi/contracts';

const emptyItems: FiscalItemBalance[] = [];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function sumMoney(values: (number | null)[]): number | null {
  if (values.some(value => value === null)) return null;
  const parts = values.map(value => {
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const [whole, fraction = ''] = mantissa.replace('-', '').split('.');
    const scale = Math.max(0, fraction.length - Number(exponent));
    const digits = BigInt(whole + fraction) * (value! < 0 ? -1n : 1n);
    const shift = Number(exponent) - fraction.length;
    return { digits: shift > 0 ? digits * 10n ** BigInt(shift) : digits, scale: shift > 0 ? 0 : scale };
  });
  const scale = Math.max(2, ...parts.map(part => part.scale));
  const sum = parts.reduce((total, part) => total + part.digits * 10n ** BigInt(scale - part.scale), 0n);
  const divisor = 10n ** BigInt(scale - 2);
  const cents = (sum < 0n ? -1n : 1n) * ((sum < 0n ? -sum : sum) + divisor / 2n) / divisor;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(cents) / 100;
}

export function filteredAggregates(items: FiscalItemBalance[]) {
  const count = items.length;
  return {
    itemCount: count,
    contractedValueRows: items.filter(item => item.valueContracted !== null).length,
    committedBalanceRows: items.filter(item => item.valueBalance !== null).length,
    // A API já aplica a convenção medição ausente = zero no saldo; cobertura segue o saldo calculável.
    measuredBalanceRows: items.filter(item => item.valueMeasuredBalance !== null).length,
    totalContratado: sumMoney(items.map(item => item.valueContracted)),
    saldoComprometido: sumMoney(items.map(item => item.valueBalance)),
    saldoMedido: sumMoney(items.map(item => item.valueMeasuredBalance)),
  };
}

type ItemFilters = { context: string | null; supplier: string; contract: string; band: string; search: string };
const emptyFilters = (context: string | null): ItemFilters => ({ context, supplier: '', contract: '', band: '', search: '' });

export function useItemBalanceFilters(itemBalances: FiscalItemBalances | undefined, context: string | null, preserveMissingOptions = false) {
  const [storedFilters, setFilters] = useState<ItemFilters>(() => emptyFilters(null));
  const items = itemBalances?.coverage === 'AVAILABLE' ? itemBalances.itens : emptyItems;
  const suppliers = useMemo(() => [...new Set(items.map(item => item.supplierName).filter((name): name is string => name !== null))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [items]);
  const contracts = useMemo(() => [...new Map(items.map(item => [item.contractId, item.contractNumber] as const)).entries()]
    .sort((a, b) => a[0] - b[0]), [items]);
  let filters = storedFilters;
  if (context !== null && filters.context !== context) {
    filters = emptyFilters(context);
    setFilters(filters);
  } else if (!preserveMissingOptions && itemBalances?.coverage === 'AVAILABLE') {
    const supplier = suppliers.includes(filters.supplier) ? filters.supplier : '';
    const contract = contracts.some(([id]) => String(id) === filters.contract) ? filters.contract : '';
    if (supplier !== filters.supplier || contract !== filters.contract) {
      filters = { ...filters, supplier, contract };
      setFilters(filters);
    }
  }
  const { supplier, contract, band, search } = filters;
  const missingSupplier = Boolean(supplier && itemBalances?.coverage === 'AVAILABLE' && !suppliers.includes(supplier));
  const missingContract = Boolean(contract && itemBalances?.coverage === 'AVAILABLE' && !contracts.some(([id]) => String(id) === contract));
  const setFilter = (change: Partial<ItemFilters>) => setFilters(current => ({ ...current, ...change }));
  const activeFilters = Boolean(supplier || contract || band || search.trim());
  const itemsBeforeBand = useMemo(() => {
    const query = normalize(search.trim());
    return items.filter(item =>
      (!supplier || item.supplierName === supplier) &&
      (!contract || String(item.contractId) === contract) &&
      (!query || [item.specification, item.contractNumber, item.supplierName, item.sequence === null ? null : String(item.sequence)]
        .some(value => value !== null && normalize(value).includes(query))));
  }, [items, supplier, contract, search]);
  const filteredItems = useMemo(() => band ? itemsBeforeBand.filter(item => item.faixa === band) : itemsBeforeBand, [itemsBeforeBand, band]);
  const distributionBeforeBand = useMemo(() => ({
    adequado: itemsBeforeBand.filter(item => item.faixa === 'adequado').length,
    atencao: itemsBeforeBand.filter(item => item.faixa === 'atencao').length,
    critico: itemsBeforeBand.filter(item => item.faixa === 'critico').length,
    nao_verificavel: itemsBeforeBand.filter(item => item.faixa === 'nao_verificavel').length,
  }), [itemsBeforeBand]);
  const distribution = useMemo(() => ({
    adequado: filteredItems.filter(item => item.faixa === 'adequado').length,
    atencao: filteredItems.filter(item => item.faixa === 'atencao').length,
    critico: filteredItems.filter(item => item.faixa === 'critico').length,
    nao_verificavel: filteredItems.filter(item => item.faixa === 'nao_verificavel').length,
  }), [filteredItems]);
  // filter() preserva ordem, referências e multiplicidade dos itens da API.
  const allItemsSelected = filteredItems.length === items.length && filteredItems.every((item, index) => item === items[index]);
  const aggregates = useMemo(() => filteredItems.length === 0 ? filteredAggregates([])
    : itemBalances?.coverage === 'AVAILABLE' && allItemsSelected ? itemBalances.agregados
      : filteredAggregates(filteredItems), [filteredItems, itemBalances, allItemsSelected]);
  const clearFilters = () => setFilters(emptyFilters(context));
  return { items, suppliers, contracts, missingSupplier, missingContract, supplier, contract, band, search, setFilter, activeFilters,
    filteredItems, distribution, distributionBeforeBand, aggregates, allItemsSelected, clearFilters };
}
