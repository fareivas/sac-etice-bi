import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { GET_MANAGER_IDENTITY, GET_MANAGER_SCOPE } from './queries';
import { GET_MANAGER_SUPPLIER_CONTRACTS } from './fornecedores-queries';
import { PostgresManagerRepository } from './repository';
import { parseSupplierQuery } from './fornecedores-schemas';
import { composeManagerSuppliers } from './fornecedores-service';
import { createManagerSuppliersHandler } from './handler';
import { managerSuppliersResponseSchema } from '@sac-etice-bi/contracts';

const now = () => new Date('2026-09-25T15:00:00Z');
const filters = () => parseSupplierQuery({ rawQueryString: '' }, now());
type Contract = { id: number; supplierId: number; name: string; status: string; value: string | null };
const c = (id: number, supplierId: number, status = 'vigente', value: string | null = '10'): Contract =>
  ({ id, supplierId, name: `Fornecedor ${supplierId}`, status, value });
function fixture(assignments: { manager: number; contract: number; role?: string; active?: boolean }[], contracts: Contract[]) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql === GET_MANAGER_IDENTITY) return [{ id: String(values![0]), nome: `Gestor ${values![0]}`, ativo: true }];
    if (sql === GET_MANAGER_SCOPE) return assignments.filter((d) => d.manager === values![0] &&
      (d.role ?? 'gestor') === 'gestor' && d.active !== false).map((d) => ({ contrato_id: String(d.contract) }));
    if (sql === GET_MANAGER_SUPPLIER_CONTRACTS) return contracts.filter((row) => (values![0] as number[]).includes(row.id))
      .map((row) => ({ contract_id: String(row.id), supplier_id: String(row.supplierId), name: row.name,
        status: row.status, value: row.value }));
    throw new Error('Unexpected SQL');
  });
  return { repo: new PostgresManagerRepository({ query } as DbReader), query };
}
const a = (manager: number, contract: number, active = true) => ({ manager, contract, active });
describe('manager suppliers 7.3', () => {
  it('uses only current active gestor assignments and isolates managers', async () => {
    const { repo, query } = fixture([a(1, 1), a(1, 1), a(2, 2), a(1, 3, false),
      { manager: 1, contract: 4, role: 'fiscal' }], [c(1, 10), c(2, 20), c(3, 30), c(4, 40)]);
    expect((await composeManagerSuppliers(1, filters(), repo, now)).data.suppliers?.map((s) => s.supplierId)).toEqual([10]);
    expect((await composeManagerSuppliers(2, filters(), repo, now)).data.suppliers?.map((s) => s.supplierId)).toEqual([20]);
    expect(query).toHaveBeenCalledWith(GET_MANAGER_SUPPLIER_CONTRACTS, [[1]]);
    expect(GET_MANAGER_SUPPLIER_CONTRACTS).toContain('c.id = ANY($1::bigint[])');
    expect(GET_MANAGER_SUPPLIER_CONTRACTS).toContain('SELECT DISTINCT c.id');
  });
  it('adds distinct vigente values, excludes non-vigente values and keeps NULL unavailable', async () => {
    const { repo } = fixture([a(1, 1), a(1, 1), a(1, 2), a(1, 3), a(1, 4), a(1, 5)],
      [c(1, 10, 'vigente', '0.1'), c(1, 10, 'vigente', '0.1'), c(2, 10, 'vigente', '0.2'),
        c(3, 10, 'encerrado', '999'), c(4, 20, 'vigente', null), c(5, 20, 'suspenso', '500')]);
    const result = await composeManagerSuppliers(1, filters(), repo, now);
    expect(result.data.suppliers).toMatchObject([
      { supplierId: 10, vigentValue: 0.3, abcClass: null, openFinancialAmount: null, openCriticalRisks: null },
      { supplierId: 20, vigentValue: null, abcClass: null, openFinancialAmount: null, openCriticalRisks: null },
    ]);
    expect(result.meta.dataCoverage).toEqual({ suppliers: 'AVAILABLE', vigentValue: 'UNAVAILABLE',
      abcClass: 'UNAVAILABLE', openFinancialAmount: 'UNAVAILABLE', openCriticalRisks: 'UNAVAILABLE' });
    expect(managerSuppliersResponseSchema.safeParse(result).success).toBe(true);
  });
  it('returns a real empty result and never queries global suppliers', async () => {
    const { repo, query } = fixture([], [c(1, 10)]);
    const result = await composeManagerSuppliers(1, filters(), repo, now);
    expect(result.data.suppliers).toEqual([]);
    expect(result.meta.pagination.totalItems).toBe(0);
    expect(result.meta.dataCoverage.vigentValue).toBe('AVAILABLE');
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_SUPPLIER_CONTRACTS, expect.anything());
  });
  it('does not reconstruct past assignments or totals', async () => {
    const { repo, query } = fixture([a(1, 1)], [c(1, 10)]);
    const result = await composeManagerSuppliers(1, { ...filters(), dataReferencia: '2026-09-24' }, repo, now);
    expect(result.data.suppliers).toBeNull();
    expect(result.meta.pagination.totalItems).toBeNull();
    expect(result.meta.dataCoverage.vigentValue).toBe('UNAVAILABLE');
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_SCOPE, expect.anything());
  });
  it('paginates after grouping and sorts by implemented fields', async () => {
    const { repo } = fixture([a(1, 1), a(1, 2), a(1, 3)], [c(1, 1, 'vigente', '30'),
      c(2, 2, 'vigente', '10'), c(3, 3, 'vigente', '20')]);
    const result = await composeManagerSuppliers(1, { ...filters(), sort: 'vigentValue:desc', page: 2, pageSize: 1 }, repo, now);
    expect(result.meta.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 3 });
    expect(result.data.suppliers?.map((s) => s.supplierId)).toEqual([3]);
    expect((await composeManagerSuppliers(1, { ...filters(), sort: 'name:desc' }, repo, now)).data.suppliers?.map((s) => s.supplierId)).toEqual([3, 2, 1]);
  });
  it('validates defaults, supported sort and rejects unsupported filters', () => {
    expect(filters()).toMatchObject({ page: 1, pageSize: 25, sort: 'name:asc' });
    for (const sort of ['name:asc', 'name:desc', 'vigentValue:asc', 'vigentValue:desc'])
      expect(parseSupplierQuery({ rawQueryString: `sort=${sort}` }, now()).sort).toBe(sort);
    for (const rawQueryString of ['pageSize=101', 'page=0', 'sort=abcClass:asc',
      'unidadeId=1', 'abcClass=A', 'riskSeverity=critical', 'supplierId=2', 'dataReferencia=2026-09-26'])
      expect(() => parseSupplierQuery({ rawQueryString }, now())).toThrow();
  });
  it('returns INVALID_FILTER from the handler', async () => {
    const { repo } = fixture([], []);
    const handler = createManagerSuppliersHandler({ authProvider: { authenticate: async () =>
      ({ status: 'AUTHENTICATED', principal: { userId: 1 }, canAccessManagerView: true }) }, repository: repo, now });
    const response = await handler({ rawQueryString: 'abcClass=A', requestContext: { requestId: 'test' } } as any, {} as any, () => {});
    expect(response).toMatchObject({ statusCode: 400 });
    expect(JSON.parse((response as { body: string }).body).error.code).toBe('INVALID_FILTER');
  });
});
