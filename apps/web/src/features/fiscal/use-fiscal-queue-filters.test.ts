import { expect, it } from 'vitest';
import { filterFiscalQueue, type QueueFilters } from './use-fiscal-queue-filters';
import { fixture } from '../../../../../scripts/test/fixtures/fiscal-queue-filters';
const queue = fixture.data.priorityQueue!;
const empty: QueueFilters = { contract: '', status: '', search: '' };
const filter = (change: Partial<QueueFilters>) => filterFiscalQueue(queue, { ...empty, ...change });

it('preserves one row per OS, order, all pendencies and the original API response', () => {
  const original = structuredClone(queue);
  const result = filter({});
  expect(result.map(row => row.item.serviceOrderId)).toEqual([11, 12, 13, 14]);
  expect(result.map(row => row.hiddenCount)).toEqual([0, 0, 0, 0]);
  expect(result[0].pendencies).toEqual(queue[0].pendencies);
  filter({ status: 'aberta', search: 'Documento' });
  expect(queue).toEqual(original);
});
it.each([
  ['aberta', [11, 12, 14], [[101, 103], [201], [401]], [1, 1, 0]],
  ['em_tratamento', [11, 12, 13], [[102], [202], [301]], [2, 1, 0]],
] as const)('selects %s pendencies within each order', (status, ids, pendencies, hidden) => {
  const result = filter({ status });
  expect(result.map(row => row.item.serviceOrderId)).toEqual(ids);
  expect(result.map(row => row.pendencies.map(p => p.pendencyId))).toEqual(pendencies);
  expect(result.map(row => row.hiddenCount)).toEqual(hidden);
});
it('intersects status and description on the same pendency rather than mixing matches from different pendencies', () => {
  const result = filter({ status: 'em_tratamento', search: '  DÓCUMENTO  ' });
  expect(result.map(row => row.item.serviceOrderId)).toEqual([12]);
  expect(result[0].pendencies.map(p => p.pendencyId)).toEqual([202]);
  expect(result[0].hiddenCount).toBe(1);
});
it('searches descriptions and marks other pendencies hidden without deduplicating orders by contract', () => {
  const result = filter({ search: 'documento' });
  expect(result.map(row => row.item.serviceOrderId)).toEqual([11, 12]);
  expect(result.map(row => row.pendencies.map(p => p.pendencyId))).toEqual([[101], [201, 202]]);
  expect(result.map(row => row.hiddenCount)).toEqual([2, 0]);
});
it.each([
  ['OS ID 11', [11]], ['OS 11', [11]], ['13/2025', [11, 12, 13]], ['ARVORE', [11, 13]],
  ['Contrato ID 205', [12]], ['317', [14]],
] as const)('searches order fields: %s', (search, ids) => {
  const result = filter({ search });
  expect(result.map(row => row.item.serviceOrderId)).toEqual(ids);
  expect(result.every(row => row.hiddenCount === 0)).toBe(true);
});
it('combines contract and status with metadata search while preserving only the chosen status', () => {
  const result = filter({ contract: '184', status: 'em_tratamento', search: 'arvore' });
  expect(result.map(row => row.item.serviceOrderId)).toEqual([11, 13]);
  expect(result.map(row => row.pendencies.map(p => p.pendencyId))).toEqual([[102], [301]]);
});
it('does not search fabricated fallback descriptions, unavailable supplier names or legacy title', () => {
  for (const search of ['Decisão fiscal pendente no Processo 1', 'Fornecedor não identificado', 'Título legado']) {
    expect(filter({ search })).toEqual([]);
  }
});
it('filters null contract IDs defensively using only the provided data', () => {
  const row = { ...queue[3], contractId: null };
  expect(filterFiscalQueue([row], { ...empty, contract: 'unidentified' })).toHaveLength(1);
  expect(filterFiscalQueue([row], { ...empty, contract: '317' })).toEqual([]);
});
