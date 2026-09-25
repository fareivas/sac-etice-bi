import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { GET_MANAGER_IDENTITY, GET_MANAGER_SCOPE } from './queries';
import { GET_MANAGER_FISCAL_LOAD } from './carga-queries';
import { FISCAL_PENDING_ORDER_PREDICATE } from '../../shared/db/fiscal-pending-order';
import { ELIGIBLE_FISCAL_SERVICE_ORDERS } from '../fiscal/queries';
import { managerFiscalLoadResponseSchema } from '@sac-etice-bi/contracts';
import { PostgresManagerRepository } from './repository';
import { composeManagerFiscalLoad } from './carga-service';

const now = () => new Date('2026-09-25T15:00:00Z');
const filters = { dataReferencia: '2026-09-25', timezone: 'America/Fortaleza', contratoId: [] as number[] };
function fixture(designations: { user: number; contract: number; role: string; active: boolean }[],
  orders: { id: number; contract: number; side: string; pendencies: { type: string; status: string; responsible: number }[] }[],
  statuses: Record<number, string> = {}) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql === GET_MANAGER_IDENTITY) return [{ id: String(values![0]), nome: 'Gestor', ativo: true }];
    if (sql === GET_MANAGER_SCOPE) return designations.filter((d) => d.user === values![0] && d.role === 'gestor' && d.active)
      .map((d) => ({ contrato_id: String(d.contract) }));
    if (sql === GET_MANAGER_FISCAL_LOAD) {
      const ids = values![0] as number[];
      const fiscals = [...new Set(designations.filter((d) => ids.includes(d.contract) && d.role === 'fiscal' && d.active).map((d) => d.user))];
      return fiscals.map((user) => {
        const contracts = [...new Set(designations.filter((d) => d.user === user && ids.includes(d.contract) && d.role === 'fiscal' && d.active).map((d) => d.contract))];
        const active = contracts.filter((id) => (statuses[id] ?? 'vigente') === 'vigente');
        const pending = [...new Set(orders.filter((os) => contracts.includes(os.contract) && os.side === 'cliente' &&
          os.pendencies.some((p) => p.type === 'decisao_fiscal_p1' && ['aberta', 'em_tratamento'].includes(p.status))).map((os) => os.id))];
        return { user_id: String(user), name: `Fiscal ${user}`, active_contracts: String(active.length), pending_orders: String(pending.length) };
      });
    }
    throw new Error('Unexpected SQL');
  });
  return { repo: new PostgresManagerRepository({ query } as DbReader), query };
}
const d = (user: number, contract: number, role: string, active = true) => ({ user, contract, role, active });
const p = (responsible: number) => ({ type: 'decisao_fiscal_p1', status: 'aberta', responsible });
describe('manager fiscal load', () => {
  it('uses active manager and fiscal designations, distinct contracts and DEC-026 pending orders', async () => {
    const { repo } = fixture([d(1, 10, 'gestor'), d(1, 11, 'gestor'), d(2, 12, 'gestor'), d(1, 13, 'gestor', false),
      d(7, 10, 'fiscal'), d(7, 10, 'fiscal'), d(7, 11, 'fiscal'), d(7, 12, 'fiscal'),
      d(8, 10, 'fiscal', false), d(9, 13, 'fiscal')],
    [{ id: 1, contract: 10, side: 'cliente', pendencies: [p(99), p(98)] },
      { id: 2, contract: 11, side: 'fornecedor', pendencies: [p(7)] },
      { id: 3, contract: 11, side: 'cliente', pendencies: [{ ...p(7), type: 'other' }] }]);
    const result = await composeManagerFiscalLoad(1, filters, repo, now);
    expect(result.data.inspectors).toEqual([{ userId: 7, name: 'Fiscal 7', activeContracts: 2,
      pendingOrders: 1, capacity: null, weightedLoad: null, criticality: null, ranking: null, overdueActions: null }]);
    expect(GET_MANAGER_FISCAL_LOAD).toContain(FISCAL_PENDING_ORDER_PREDICATE);
    expect(GET_MANAGER_FISCAL_LOAD).toContain("COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'vigente')");
    expect(GET_MANAGER_FISCAL_LOAD).toContain('COUNT(DISTINCT os.id)');
    expect(ELIGIBLE_FISCAL_SERVICE_ORDERS).toContain(FISCAL_PENDING_ORDER_PREDICATE);
    expect(GET_MANAGER_FISCAL_LOAD).not.toContain('responsavel_id');
  });
  it('counts only distinct vigente contracts, while pending orders keep DEC-026 scope', async () => {
    const designations = [d(1, 10, 'gestor'), d(1, 10, 'gestor'), d(1, 11, 'gestor'),
      d(1, 12, 'gestor'), d(1, 13, 'gestor'), d(1, 14, 'gestor'), d(1, 15, 'gestor'),
      ...[10, 11, 12, 13, 14, 15].map((id) => d(7, id, 'fiscal'))];
    const { repo } = fixture(designations, [{ id: 3, contract: 11, side: 'cliente', pendencies: [p(999)] }],
      { 10: 'vigente', 11: 'rascunho', 12: 'suspenso', 13: 'encerrado', 14: 'rescindido', 15: 'vigente' });
    const result = await composeManagerFiscalLoad(1, filters, repo, now);
    expect(result.data.inspectors?.[0]).toMatchObject({ activeContracts: 2, pendingOrders: 1 });
    expect(result.meta.dataCoverage).toMatchObject({ activeContracts: 'AVAILABLE', pendingOrders: 'AVAILABLE' });
  });
  it('publishes only the official 7.2 names in the strict Zod contract', async () => {
    const { repo } = fixture([d(1, 10, 'gestor'), d(7, 10, 'fiscal')], []);
    const result = await composeManagerFiscalLoad(1, filters, repo, now);
    expect(managerFiscalLoadResponseSchema.safeParse(result).success).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/contractsCount|pendingServiceOrders/);
    expect(managerFiscalLoadResponseSchema.safeParse({ ...result,
      data: { inspectors: [{ ...result.data.inspectors![0], contractsCount: 1 }] } }).success).toBe(false);
    expect(managerFiscalLoadResponseSchema.safeParse({ ...result,
      data: { inspectors: [{ ...result.data.inspectors![0], pendingServiceOrders: 1 }] } }).success).toBe(false);
    expect(managerFiscalLoadResponseSchema.safeParse({ ...result,
      meta: { ...result.meta, dataCoverage: { ...result.meta.dataCoverage, contractsCount: 'AVAILABLE' } } }).success).toBe(false);
    expect(managerFiscalLoadResponseSchema.safeParse({ ...result,
      meta: { ...result.meta, dataCoverage: { ...result.meta.dataCoverage, pendingServiceOrders: 'AVAILABLE' } } }).success).toBe(false);
  });
  it('returns valid empty portfolio without querying load', async () => {
    const { repo, query } = fixture([], []);
    expect((await composeManagerFiscalLoad(1, filters, repo, now)).data.inspectors).toEqual([]);
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_FISCAL_LOAD, expect.anything());
  });
  it('leaves historical load and unsupported measures unavailable', async () => {
    const { repo, query } = fixture([d(1, 10, 'gestor'), d(7, 10, 'fiscal')], []);
    const result = await composeManagerFiscalLoad(1, { ...filters, dataReferencia: '2026-09-24' }, repo, now);
    expect(result.data.inspectors).toBeNull();
    expect(result.meta.dataCoverage.pendingOrders).toBe('UNAVAILABLE');
    expect(result.meta.dataCoverage.capacity).toBe('UNAVAILABLE');
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_SCOPE, expect.anything());
  });
});
