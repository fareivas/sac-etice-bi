// Browser/test-only fixture, never imported by the application; no database writes.
import { fiscalDashboardSummaryResponseSchema } from '../../../packages/contracts/src';
import { fixtures as itemFixtures } from './fiscal-item-details';
const summary = structuredClone(itemFixtures.committedValue);
summary.data.fiscal.name = 'Fixture local da fila fiscal — sem banco';
summary.meta.filtersApplied.contratoId = [];
summary.data.cards.activeContracts = 4;
summary.data.cards.pendingServiceOrders = 4;
summary.data.contracts = [2, 184, 205, 317].map(contractId => ({ contractId, contractNumber: contractId === 317 ? null : '13/2025',
  supplierName: 'Fornecedor de teste', value: 300000, expiryDate: '2027-10-08' }));
summary.data.contractAlerts = [{ alertId: 901, contractId: 184, contractNumber: '13/2025',
  description: 'Alerta independente dos filtros da fila', expiryDate: '2027-10-08', createdAt: null }];
const base = { type: 'SERVICE_ORDER' as const, severity: null, dueAt: null, title: null };
summary.data.priorityQueue = [
  { ...base, serviceOrderId: 11, contractId: 184, contractNumber: '13/2025', supplierName: 'Árvore', pendencies: [
    { pendencyId: 101, status: 'aberta', description: 'Documento divergente' },
    { pendencyId: 102, status: 'em_tratamento', description: 'Conferir valor' },
    { pendencyId: 103, status: 'aberta', description: null },
  ] },
  { ...base, serviceOrderId: 12, contractId: 205, contractNumber: '13/2025', supplierName: 'Zeta', pendencies: [
    { pendencyId: 201, status: 'aberta', description: 'Documento ausente' },
    { pendencyId: 202, status: 'em_tratamento', description: 'Documento em revisão' },
  ] },
  { ...base, serviceOrderId: 13, contractId: 184, contractNumber: '13/2025', supplierName: 'Árvore', pendencies: [
    { pendencyId: 301, status: 'em_tratamento', description: 'Conferir quantidade' },
  ] },
  { ...base, serviceOrderId: 14, contractId: 317, contractNumber: null, supplierName: null,
    title: 'Título legado não pesquisável', pendencies: [{ pendencyId: 401, status: 'aberta', description: null }] },
];
export const fixture = fiscalDashboardSummaryResponseSchema.parse(summary);

export function responseForRequest(current: typeof fixture, includeExternal: boolean) {
  const response = structuredClone(current);
  const { source: _source, sources: _sources, ...baseMeta } = response.meta as typeof response.meta & { source?: string; sources?: unknown[] };
  return fiscalDashboardSummaryResponseSchema.parse({ ...response, meta: includeExternal
    ? { ...baseMeta, filtersApplied: { ...baseMeta.filtersApplied, includeExternal: true }, merCoverage: 'MIXED',
      sources: [{ system: 'SAC' }, { system: 'KPIs', status: 'UNAVAILABLE', updatedAt: null }] }
    : { ...baseMeta, filtersApplied: { ...baseMeta.filtersApplied, includeExternal: false }, merCoverage: 'PROPOSTA', source: 'SAC' } });
}
