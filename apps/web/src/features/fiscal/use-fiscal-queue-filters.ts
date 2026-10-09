import { useMemo, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';

type Queue = NonNullable<FiscalDashboardSummaryResponse['data']['priorityQueue']>;
export type QueueFilters = { contract: string; status: '' | 'aberta' | 'em_tratamento'; search: string };
const emptyQueue: Queue = [];
const emptyFilters = (context: string | null) => ({ context, contract: '', status: '' as QueueFilters['status'], search: '' });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const queueContractKey = (id: number | null) => id === null ? 'unidentified' : String(id);

/** Select orders and their matching pendencies without mutating the authorized API response. */
export function filterFiscalQueue(queue: Queue, filters: QueueFilters) {
  const query = normalize(filters.search.trim());
  return queue.flatMap(item => {
    if (filters.contract && queueContractKey(item.contractId) !== filters.contract) return [];
    const orderMatches = !query || [String(item.serviceOrderId), `OS ${item.serviceOrderId}`, `OS ID ${item.serviceOrderId}`,
      item.contractNumber, item.contractId === null ? null : String(item.contractId),
      item.contractId === null ? null : `Contrato ID ${item.contractId}`, item.supplierName]
      .some(value => value !== null && normalize(value).includes(query));
    const pendencies = item.pendencies.filter(pendency =>
      (!filters.status || pendency.status === filters.status) &&
      (orderMatches || (pendency.description !== null && normalize(pendency.description).includes(query))));
    return pendencies.length ? [{ item, pendencies, hiddenCount: item.pendencies.length - pendencies.length }] : [];
  });
}

export function useFiscalQueueFilters(queue: Queue | null | undefined, context: string | null) {
  const rows = queue ?? emptyQueue;
  const [storedFilters, setFilters] = useState(() => emptyFilters(null));
  const contracts = useMemo(() => [...new Map(rows.map(item => [item.contractId, item.contractNumber] as const)).entries()]
    .sort((a, b) => a[0] === null ? 1 : b[0] === null ? -1 : a[0] - b[0]), [rows]);
  let filters = storedFilters;
  if (context !== null && filters.context !== context) {
    filters = emptyFilters(context);
    setFilters(filters);
  } else if (queue !== null && queue !== undefined && filters.contract &&
      !contracts.some(([id]) => queueContractKey(id) === filters.contract)) {
    filters = { ...filters, contract: '' };
    setFilters(filters);
  }
  const { contract, status, search } = filters;
  const visible = useMemo(() => filterFiscalQueue(rows, { contract, status, search }), [rows, contract, status, search]);
  const setFilter = (change: Partial<QueueFilters>) => setFilters(current => ({ ...current, ...change }));
  const clearFilters = () => setFilters(emptyFilters(context));
  return { contracts, contract, status, search, visible, setFilter, clearFilters,
    activeFilters: Boolean(contract || status || search.trim()), totalOrders: rows.length };
}
