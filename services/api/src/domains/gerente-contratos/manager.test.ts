import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { GET_MANAGER_ACTIVE_CONTRACTS, GET_MANAGER_IDENTITY, GET_MANAGER_SCOPE } from './queries';
import { PostgresManagerRepository } from './repository';
import { composeManagerSummary } from './service';
import { parseManagerQuery } from './schemas';
import { createManagerHandler } from './handler';

const now = () => new Date('2026-09-25T15:00:00Z');
const filters = { dataReferencia: '2026-09-25', timezone: 'America/Fortaleza', contratoId: [] as number[] };
const contract = (id: string, value: string | null, status = 'vigente') =>
  ({ id, numero: `CT-${id}`, valor_total: value, status, vigencia_fim: '2026-12-31', fornecedor_id: '1' });
function fixture(designations: { userId: number; contractId: string; role: string; active: boolean }[],
  contracts: ReturnType<typeof contract>[]) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql === GET_MANAGER_IDENTITY) return [{ id: String(values![0]), nome: `Gestor ${values![0]}`, ativo: true }];
    if (sql === GET_MANAGER_SCOPE) return designations.filter((d) => d.userId === values![0] && d.role === 'gestor' && d.active)
      .map((d) => ({ contrato_id: d.contractId }));
    if (sql === GET_MANAGER_ACTIVE_CONTRACTS) return contracts.filter((c) => (values![0] as number[]).includes(Number(c.id)) && c.status === 'vigente')
      .map((c) => ({ contract_id: c.id, contract_number: c.numero, supplier_name: 'Fornecedor', value: c.valor_total, expiry_date: c.vigencia_fim }));
    throw new Error('Unexpected SQL');
  });
  return { repo: new PostgresManagerRepository({ query } as DbReader), query };
}
const assignment = (userId: number, contractId: string, role = 'gestor', active = true) => ({ userId, contractId, role, active });

describe('manager current portfolio', () => {
  it('returns available zero for a manager with no portfolio', async () => {
    const { repo, query } = fixture([], []);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards).toEqual({ activeContracts: 0, activePortfolioValue: 0, expiringContracts: null });
    expect(result.data.contracts).toEqual([]);
    expect(result.meta.dataCoverage).toEqual({ portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE', expiringContracts: 'UNAVAILABLE' });
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_ACTIVE_CONTRACTS, expect.anything());
  });
  it('counts one and multiple distinct active contracts, excluding all inactive statuses and fiscal-only/inactive designations', async () => {
    const contracts = [contract('1', '10.50'), contract('2', '20.25'), contract('3', '30', 'encerrado'),
      contract('4', '40', 'rescindido'), contract('5', '50', 'suspenso'), contract('6', '60', 'rascunho'), contract('7', '70'), contract('8', '80')];
    const designations = [assignment(1, '1'), assignment(1, '1'), assignment(1, '2'),
      ...['3','4','5','6'].map((id) => assignment(1, id)), assignment(1, '7', 'fiscal'), assignment(1, '8', 'gestor', false)];
    const { repo } = fixture(designations, contracts);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards).toEqual({ activeContracts: 2, activePortfolioValue: 30.75, expiringContracts: null });
    expect(result.data.contracts?.map((c) => c.contractId)).toEqual([1, 2]);
    const one = await composeManagerSummary(1, { ...filters, contratoId: [1] }, repo, now);
    expect(one.data.cards.activeContracts).toBe(1);
    expect(one.data.cards.activePortfolioValue).toBe(10.5);
  });
  it('isolates managers and rejects a contract outside the current authorized scope', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(2, '2')], [contract('1', '10'), contract('2', '20')]);
    expect((await composeManagerSummary(1, filters, repo, now)).data.contracts?.map((c) => c.contractId)).toEqual([1]);
    expect((await composeManagerSummary(2, filters, repo, now)).data.contracts?.map((c) => c.contractId)).toEqual([2]);
    await expect(composeManagerSummary(1, { ...filters, contratoId: [2] }, repo, now)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });
  it('adds decimal values without accumulated floating point error', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(1, '2')], [contract('1', '0.1'), contract('2', '0.2')]);
    expect((await composeManagerSummary(1, filters, repo, now)).data.cards.activePortfolioValue).toBe(0.3);
  });
  it('does not turn a missing contract value into zero or a partial total', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(1, '2')], [contract('1', '10'), contract('2', null)]);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards.activeContracts).toBe(2);
    expect(result.data.cards.activePortfolioValue).toBeNull();
    expect(result.meta.dataCoverage.activePortfolioValue).toBe('UNAVAILABLE');
  });
  it('never applies current designation retroactively', async () => {
    const { repo, query } = fixture([assignment(1, '1')], [contract('1', '10')]);
    const result = await composeManagerSummary(1, { ...filters, dataReferencia: '2026-09-24' }, repo, now);
    expect(result.data.cards.activeContracts).toBeNull();
    expect(result.data.cards.activePortfolioValue).toBeNull();
    expect(result.data.contracts).toBeNull();
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_SCOPE, expect.anything());
  });
  it('validates dates, unknown filters and duplicate contract ids', () => {
    expect(parseManagerQuery({ rawQueryString: 'contratoId=1&contratoId=1' }, now()).contratoId).toEqual([1]);
    for (const rawQueryString of ['unidadeId=1', 'dataReferencia=2026-02-30', 'dataReferencia=2026-09-26', 'contratoId=0']) {
      expect(() => parseManagerQuery({ rawQueryString }, now())).toThrow();
    }
  });
  it('returns standardized forbidden response through the handler', async () => {
    const { repo } = fixture([assignment(1, '1')], [contract('1', '10')]);
    const handler = createManagerHandler({ authProvider: { authenticate: async () =>
      ({ status: 'AUTHENTICATED', principal: { userId: 1 }, canAccessManagerView: true }) }, repository: repo, now });
    const response = await handler({ rawQueryString: 'contratoId=2', requestContext: { requestId: 'test' } } as any, {} as any, () => {});
    expect(response).toMatchObject({ statusCode: 403 });
    expect(JSON.parse((response as { body: string }).body).error.code).toBe('FORBIDDEN_SCOPE');
  });
});
