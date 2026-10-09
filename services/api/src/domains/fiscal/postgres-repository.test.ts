import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { ApiError } from '../../shared/errors/index';
import { GET_FISCAL_IDENTITY, GET_FISCAL_CONTRACT_SCOPE, COUNT_ACTIVE_FISCAL_CONTRACTS, COUNT_PENDING_FISCAL_SERVICE_ORDERS, GET_PENDING_FISCAL_SERVICE_ORDERS, GET_CURRENT_FISCAL_CONTRACTS, GET_CURRENT_FISCAL_CONTRACT_BALANCES, GET_CURRENT_FISCAL_ITEM_BALANCES } from './queries';
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

  it('queries item balances only with the already authorized contract IDs', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    await expect(repo.getItemBalances({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', items: [] });
    expect(query).toHaveBeenCalledWith(GET_CURRENT_FISCAL_ITEM_BALANCES, [[184]]);
    expect(GET_CURRENT_FISCAL_ITEM_BALANCES).toContain('c.id = ANY($1::bigint[])');
    expect(GET_CURRENT_FISCAL_ITEM_BALANCES).toContain("c.status = 'vigente'");
    expect(GET_CURRENT_FISCAL_ITEM_BALANCES).toContain('FROM bi.saldos_por_item');
    query.mockClear();
    await expect(repo.getItemBalances({ context: context([], '2026-09-20'), scope })).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    expect(query).not.toHaveBeenCalled();
  });
  it('preserves nullable measurements and rejects malformed non-null item values in Fiscal', async () => {
    const item = { contract_id: '184', contract_number: 'CT-184', supplier_name: 'Fornecedor',
      item_id: '10', sequence: 1, specification: 'Serviço', unit: 'un', quantity_contracted: '1',
      quantity_consumed: '0', quantity_measured: null, quantity_balance: '1',
      value_contracted: '100', value_consumed: '0', value_measured: null,
      value_balance: '100', verification_status: null };
    const query = vi.fn().mockResolvedValue([item]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    const request = { context: context(), scope };
    const result = await repo.getItemBalances(request);
    expect(result).toMatchObject({ coverage: 'AVAILABLE', items: [{ valueMeasured: null,
      quantityMeasured: null, raw: { valueMeasured: null, quantityMeasured: null } }] });
    query.mockResolvedValue([{ ...item, value_measured: 'invalid' }]);
    await expect(repo.getItemBalances(request)).rejects.toThrow('Invalid database numeric value');
  });

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
      { ordem_servico_id: '11', contrato_id: '184', contrato_numero: 'C-184', pendencia_id: '101', pendencia_descricao: 'Verificar documento', pendencia_status: 'aberta' },
      { ordem_servico_id: '11', contrato_id: '184', contrato_numero: 'C-184', pendencia_id: '101', pendencia_descricao: 'Verificar documento', pendencia_status: 'aberta' },
      { ordem_servico_id: '12', contrato_id: '184', contrato_numero: 'C-184', pendencia_id: '103', pendencia_descricao: null, pendencia_status: 'em_tratamento' },
    ]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    const scoped = { context: context([184]), scope };
    await expect(repo.getPendingServiceOrders(scoped)).resolves.toEqual({ coverage: 'AVAILABLE', value: 2 });
    await expect(repo.getPriorityQueue(scoped)).resolves.toEqual({ coverage: 'AVAILABLE', items: [
      { type: 'SERVICE_ORDER', serviceOrderId: 11, pendencies: [{ pendencyId: 101, description: 'Verificar documento', status: 'aberta' }], severity: null, contractId: 184, contractNumber: 'C-184', supplierName: null, title: null, dueAt: null },
      { type: 'SERVICE_ORDER', serviceOrderId: 12, pendencies: [{ pendencyId: 103, description: null, status: 'em_tratamento' }], severity: null, contractId: 184, contractNumber: 'C-184', supplierName: null, title: null, dueAt: null },
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
    // DEC-026 selects the authorized portfolio, not tasks assigned to the user.
    expect(GET_PENDING_FISCAL_SERVICE_ORDERS).not.toContain('responsavel_id');
    expect(GET_PENDING_FISCAL_SERVICE_ORDERS).not.toContain('usuario_id');
    expect(GET_PENDING_FISCAL_SERVICE_ORDERS).toContain('ORDER BY ordem_servico_id');

  });

  it('groups every eligible pendency by OS and deduplicates IDs, not descriptions', async () => {
    const row = { ordem_servico_id: '11', contrato_id: '184', contrato_numero: 'C-184',
      pendencia_id: '101', pendencia_descricao: 'Documento divergente', pendencia_status: 'aberta' };
    const query = vi.fn().mockResolvedValue([
      row, row,
      { ...row, pendencia_id: '102', pendencia_status: 'em_tratamento' },
      { ...row, pendencia_id: '103', pendencia_descricao: '   ' },
      { ...row, ordem_servico_id: '12', pendencia_id: '104', pendencia_descricao: null },
    ]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    const result = await repo.getPriorityQueue({ context: context([184]), scope });
    expect(result.coverage).toBe('AVAILABLE');
    if (result.coverage !== 'AVAILABLE') throw new Error('Expected available queue');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].serviceOrderId).toBe(11);
    expect(result.items[0].pendencies).toEqual([
      { pendencyId: 101, description: 'Documento divergente', status: 'aberta' },
      { pendencyId: 102, description: 'Documento divergente', status: 'em_tratamento' },
      { pendencyId: 103, description: null, status: 'aberta' },
    ]);
    expect(result.items[1].pendencies).toEqual([{ pendencyId: 104, description: null, status: 'aberta' }]);
    expect(query).toHaveBeenCalledWith(GET_PENDING_FISCAL_SERVICE_ORDERS, [[184]]);
  });

  it('fails closed if a queue row falls outside the restricted authorized scope', async () => {
    const query = vi.fn().mockResolvedValue([{ ordem_servico_id: '11', contrato_id: '205',
      contrato_numero: 'C-205', pendencia_id: '101', pendencia_descricao: 'Fora do recorte', pendencia_status: 'aberta' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, current);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: null }] };
    await expect(repo.getPriorityQueue({ context: context([184]), scope })).rejects.toThrow('outside authorized scope');
    expect(query).toHaveBeenCalledWith(GET_PENDING_FISCAL_SERVICE_ORDERS, [[184]]);
  });

  it('restricts descriptions to P1 fiscal decisions using the same criteria as the OS count', () => {
    for (const sql of [COUNT_PENDING_FISCAL_SERVICE_ORDERS, GET_PENDING_FISCAL_SERVICE_ORDERS]) {
      expect(sql).toContain("p.entidade_tipo = 'ordem_servico'");
      expect(sql).toContain('p.entidade_id = os.id');
      expect(sql).toContain("p.tipo = 'decisao_fiscal_p1'");
      expect(sql).toContain("p.status IN ('aberta', 'em_tratamento')");
      expect(sql).not.toContain('saldo_insuficiente');
      expect(sql).not.toContain('subordem');
    }
    expect(GET_PENDING_FISCAL_SERVICE_ORDERS).toContain('p.descricao AS pendencia_descricao');
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

describe('Fiscal current contracts and balances', () => {
  const now = () => new Date('2026-10-08T12:00:00Z');
  const context = { authenticatedUserId: 17, filters: { dataReferencia: '2026-10-08', timezone: 'America/Fortaleza', unidadeId: null, contratoId: [23], includeExternal: false } };
  const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 23, integrationUuid: null }] };
  const request = { context, scope };

  it('maps current contract and nullable supplier from the already restricted scope', async () => {
    const query = vi.fn().mockResolvedValue([{ contract_id: '23', contract_number: 'CT-EXEMPLO', supplier_name: null, value: '75000.00', expiry_date: '2027-01-20' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, now);
    await expect(repo.getContracts(request)).resolves.toEqual({ coverage: 'AVAILABLE', items: [{ contractId: 23, contractNumber: 'CT-EXEMPLO', supplierName: null, value: 75000, expiryDate: '2027-01-20' }] });
    expect(query).toHaveBeenCalledWith(GET_CURRENT_FISCAL_CONTRACTS, [[23]]);
    expect(GET_CURRENT_FISCAL_CONTRACTS).toContain("c.status = 'vigente'");
    expect(GET_CURRENT_FISCAL_CONTRACTS).toContain('LEFT JOIN fornecedores.fornecedor');
  });

  it.each([
    ['75000', '0', '75000', 100],
    ['75000', '15000', '60000', 80],
    ['0', '0', '0', null],
    ['-1', '0', '-1', null],
  ])('maps view amounts %s/%s/%s and safely computes percentage', async (contracted, consumed, balance, percent) => {
    const query = vi.fn().mockResolvedValue([{ contract_id: '23', contract_number: 'CT-EXEMPLO', contracted_value: contracted, consumed_value: consumed, balance_value: balance }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, now);
    await expect(repo.getContractBalances(request)).resolves.toEqual({ coverage: 'AVAILABLE', items: [{ contractId: 23, contractNumber: 'CT-EXEMPLO', contractedValue: Number(contracted), consumedValue: Number(consumed), balanceValue: Number(balance), balancePct: percent }] });
    expect(query).toHaveBeenCalledWith(GET_CURRENT_FISCAL_CONTRACT_BALANCES, [[23]]);
    expect(GET_CURRENT_FISCAL_CONTRACT_BALANCES).toContain('LEFT JOIN contratos.vw_saldo_contrato');
    expect(GET_CURRENT_FISCAL_CONTRACT_BALANCES).not.toContain('COALESCE');
    expect(GET_CURRENT_FISCAL_CONTRACT_BALANCES).not.toContain('valor_total');
  });

  it.each([null, 'NaN', 'Infinity', '', '9007199254740992'])('does not turn missing/invalid balance %s into zero', async value => {
    const query = vi.fn().mockResolvedValue([{ contract_id: '23', contract_number: 'CT-EXEMPLO', contracted_value: value, consumed_value: '0', balance_value: '0' }]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, now);
    await expect(repo.getContractBalances(request)).resolves.toEqual({ coverage: 'UNAVAILABLE' });
  });

  it('returns valid empty arrays and does not query for empty scope or past reference', async () => {
    const query = vi.fn();
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, now);
    for (const method of [repo.getContracts.bind(repo), repo.getContractBalances.bind(repo)]) {
      await expect(method({ context, scope: { coverage: 'AVAILABLE', contracts: [] } })).resolves.toEqual({ coverage: 'AVAILABLE', items: [] });
      await expect(method({ ...request, context: { ...context, filters: { ...context.filters, dataReferencia: '2026-10-07' } } })).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    }
    expect(query).not.toHaveBeenCalled();
  });
});
