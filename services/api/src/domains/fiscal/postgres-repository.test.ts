import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { ApiError } from '../../shared/errors/index';
import { GET_FISCAL_IDENTITY, GET_FISCAL_CONTRACT_SCOPE, COUNT_ACTIVE_FISCAL_CONTRACTS, COUNT_PENDING_FISCAL_SERVICE_ORDERS, GET_PENDING_FISCAL_SERVICE_ORDERS } from './queries';
import { PostgresFiscalSummaryRepository } from './postgres-repository';

function repository(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue(rows);
  return { repository: new PostgresFiscalSummaryRepository({ query } as DbReader), query };
}

describe('PostgresFiscalSummaryRepository', () => {
  it('reads active identity with a bound ID and a usable name', async () => {
    const { repository: repo, query } = repository([{ id: '17', nome: 'Ana Silva', ativo: true }]);
    await expect(repo.getFiscalIdentity(17)).resolves.toEqual({ userId: 17, name: 'Ana Silva' });
    expect(query).toHaveBeenCalledWith(GET_FISCAL_IDENTITY, [17]);
    expect(GET_FISCAL_IDENTITY).toContain('WHERE id = $1');
  });

  it('keeps an unusable blank name null without fallback', async () => {
    const { repository: repo } = repository([{ id: '17', nome: '   ', ativo: true }]);
    await expect(repo.getFiscalIdentity(17)).resolves.toEqual({ userId: 17, name: null });
  });

  it.each([
    { caseName: 'absent', rows: [] },
    { caseName: 'inactive', rows: [{ id: '17', nome: 'Ana', ativo: false }] },
  ])(
    'rejects $caseName identity', async ({ rows }) => {
      const { repository: repo } = repository(rows);
      await expect(repo.getFiscalIdentity(17)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' } satisfies Partial<ApiError>);
    },
  );

  it('rejects unsafe or mismatched physical IDs and structural name errors', async () => {
    for (const row of [
      { id: '9007199254740992', nome: 'Ana', ativo: true },
      { id: '18', nome: 'Ana', ativo: true },
      { id: '17', nome: null, ativo: true },
    ]) {
      const { repository: repo } = repository([row]);
      await expect(repo.getFiscalIdentity(17)).rejects.toThrow();
    }
  });

  const today = '2026-09-21';
  const context = (ids: number[] = [], date = today, unidadeId: number | null = null) => ({
    authenticatedUserId: 17,
    filters: { dataReferencia: date, timezone: 'America/Fortaleza', unidadeId, contratoId: ids, includeExternal: false },
  });
  const current = () => new Date('2026-09-22T01:00:00Z');

  it('resolves distinct current contracts with safe IDs and null integration UUID', async () => {
    const query = vi.fn().mockResolvedValue([{ contrato_id: '184' }, { contrato_id: 205n }, { contrato_id: '184' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    await expect(repo.getAuthorizedContractScope(context())).resolves.toEqual({ coverage: 'AVAILABLE', contracts: [
      { contractId: 184, integrationUuid: null }, { contractId: 205, integrationUuid: null },
    ] });
    expect(query).toHaveBeenCalledWith(GET_FISCAL_CONTRACT_SCOPE, [17]);
    expect(GET_FISCAL_CONTRACT_SCOPE).toContain('SELECT DISTINCT contrato_id');
  });

  it('validates every requested contract before passing the restricted scope onward', async () => {
    const query = vi.fn().mockResolvedValue([{ contrato_id: '184' }, { contrato_id: '205' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    await expect(repo.getAuthorizedContractScope(context([205, 184]))).resolves.toMatchObject({ contracts: [
      { contractId: 205 }, { contractId: 184 },
    ] });
    for (const ids of [[184, 999], [999]]) {
      await expect(repo.getAuthorizedContractScope(context(ids))).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    }
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('distinguishes empty current scope from unavailable historical scope without querying', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    await expect(repo.getAuthorizedContractScope(context())).resolves.toEqual({ coverage: 'AVAILABLE', contracts: [] });
    await expect(repo.getAuthorizedContractScope(context([], '2026-09-20'))).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly for unit filter and unsafe database ID', async () => {
    const query = vi.fn().mockResolvedValue([{ contrato_id: '9007199254740992' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    await expect(repo.getAuthorizedContractScope(context([], today, 4))).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(repo.getAuthorizedContractScope(context())).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('counts only scoped current contracts in one bound query', async () => {
    const query = vi.fn().mockResolvedValue([{ total: '2' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [
      { contractId: 184, integrationUuid: null }, { contractId: 205, integrationUuid: null },
    ] };
    await expect(repo.getActiveContracts({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', value: 2 });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(COUNT_ACTIVE_FISCAL_CONTRACTS, [[184, 205]]);
    expect(COUNT_ACTIVE_FISCAL_CONTRACTS).toContain('status = \'vigente\'');
    expect(COUNT_ACTIVE_FISCAL_CONTRACTS).toContain('ANY($1::bigint[])');
  });

  it('returns available zero for empty current scope and unavailable for historical date', async () => {
    const query = vi.fn();
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [] };
    await expect(repo.getActiveContracts({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', value: 0 });
    await expect(repo.getActiveContracts({ context: context([], '2026-09-20'), scope })).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    expect(query).not.toHaveBeenCalled();
  });

  it('uses the requested timezone at the UTC date boundary', async () => {
    const query = vi.fn().mockResolvedValue([{ contrato_id: '184' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const utc = { ...context(), filters: { ...context().filters, timezone: 'UTC', dataReferencia: '2026-09-22' } };
    await expect(repo.getAuthorizedContractScope(utc)).resolves.toMatchObject({ coverage: 'AVAILABLE' });
    await expect(repo.getAuthorizedContractScope({ ...utc, filters: { ...utc.filters, dataReferencia: '2026-09-21' } }))
      .resolves.toEqual({ coverage: 'UNAVAILABLE' });
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([0, 1, 2])('returns database count %i as available', async (total) => {
    const query = vi.fn().mockResolvedValue([{ total: String(total) }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    await expect(repo.getActiveContracts({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', value: total });
  });

  it('uses one scoped eligibility predicate for distinct count and queue', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ total: '2' }]).mockResolvedValueOnce([
      { ordem_servico_id: '11', contrato_id: '184', contrato_numero: 'C-184' },
      { ordem_servico_id: '11', contrato_id: '184', contrato_numero: 'C-184' },
      { ordem_servico_id: '12', contrato_id: '184', contrato_numero: 'C-184' },
    ]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    const scoped = { context: context([184]), scope };
    await expect(repo.getPendingServiceOrders(scoped)).resolves.toEqual({ coverage: 'AVAILABLE', value: 2 });
    await expect(repo.getPriorityQueue(scoped)).resolves.toEqual({ coverage: 'AVAILABLE', items: [
      { type: 'SERVICE_ORDER', severity: null, contractId: 184, contractNumber: 'C-184', supplierName: null, title: null, dueAt: null },
      { type: 'SERVICE_ORDER', severity: null, contractId: 184, contractNumber: 'C-184', supplierName: null, title: null, dueAt: null },
    ] });
    expect(query).toHaveBeenNthCalledWith(1, COUNT_PENDING_FISCAL_SERVICE_ORDERS, [[184]]);
    expect(query).toHaveBeenNthCalledWith(2, GET_PENDING_FISCAL_SERVICE_ORDERS, [[184]]);
    for (const sql of [COUNT_PENDING_FISCAL_SERVICE_ORDERS, GET_PENDING_FISCAL_SERVICE_ORDERS]) {
      expect(sql).toContain("os.lado = 'cliente'");
      expect(sql).toContain("p.tipo = 'decisao_fiscal_p1'");
      expect(sql).toContain("p.status IN ('aberta', 'em_tratamento')");
      expect(sql).toContain('os.contrato_id = ANY($1::bigint[])');
      expect(sql).toContain('p.entidade_id = os.id');
    }
    expect(COUNT_PENDING_FISCAL_SERVICE_ORDERS).toContain('COUNT(DISTINCT os.id)');
  });

  it('returns zero and empty queue for current empty scope, unavailable for history', async () => {
    const query = vi.fn();
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [] };
    await expect(repo.getPendingServiceOrders({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', value: 0 });
    await expect(repo.getPriorityQueue({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', items: [] });
    await expect(repo.getPendingServiceOrders({ context: context([], '2026-09-20'), scope })).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    await expect(repo.getPriorityQueue({ context: context([], '2026-09-20'), scope })).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports remaining blocked operations as unavailable without querying', async () => {
    const { repository: repo } = repository([]);
    const query = {} as Parameters<typeof repo.getCriticalItems>[0];
    for (const operation of [repo.getCriticalItems(query), repo.getOverdueActions(query)]) {
      await expect(operation).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    }
  });
});
