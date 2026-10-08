import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db';
import { PostgresManagerRepository } from './repository';
import { composeManagerSummary } from './service';
import { createManagerHandler } from './handler';
import { GET_MANAGER_CONTRACT_ALERTS, GET_MANAGER_CONTRACT_BALANCES, GET_MANAGER_SCOPE, GET_MANAGER_IDENTITY, GET_MANAGER_ACTIVE_CONTRACTS } from './queries';

const now = () => new Date('2026-10-08T12:00:00Z');
const filters = { dataReferencia: '2026-10-08', timezone: 'America/Fortaleza', contratoId: [] as number[] };
const balance = (contracted = '200', consumed = '50', remaining = '150') => ({ contract_id: '41', contract_number: 'CT-41', contracted_value: contracted, consumed_value: consumed, balance_value: remaining });
const alert = (id: number, type = 'outro_tipo', status = 'aberta', contractId = 41) => ({ alert_id: String(id), contract_id: String(contractId), contract_number: `CT-${contractId}`, type, status, description: 'Pendência de teste', expiry_date: '2026-10-20', created_at: new Date('2026-10-01T12:00:00Z') });
function fixture() {
  const alerts = [alert(206, 'designacao_ausente'), alert(205, 'vigencia_vencida', 'em_tratamento'), alert(204, 'outro_tipo'), alert(203, 'outro_tipo', 'resolvida'), alert(202, 'outro_tipo', 'cancelada'), alert(207, 'outro_tipo', 'aberta', 99)];
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql === GET_MANAGER_IDENTITY) return [{ id: String(values![0]), nome: 'Gestor teste', ativo: true }];
    if (sql === GET_MANAGER_SCOPE) return values![0] === 17 ? [{ contrato_id: '41' }, { contrato_id: '41' }] : [];
    if (sql === GET_MANAGER_ACTIVE_CONTRACTS) return [{ contract_id: '41', contract_number: 'CT-41', supplier_name: null, value: '999', expiry_date: '2026-10-20', expires_within_120_days: true }];
    if (sql === GET_MANAGER_CONTRACT_ALERTS) return alerts.filter(a => (values![0] as number[]).includes(Number(a.contract_id)) && ['aberta', 'em_tratamento'].includes(a.status));
    if (sql === GET_MANAGER_CONTRACT_BALANCES) return [balance()];
    throw new Error('Unexpected SQL');
  });
  return { query, repo: new PostgresManagerRepository({ query } as DbReader) };
}

describe('manager enrichment', () => {
  it('uses gestor scope only, includes every unresolved type and excludes resolved/cancelled/outside alerts', async () => {
    const { repo, query } = fixture();
    const response = await composeManagerSummary(17, { ...filters, contratoId: [41] }, repo, now);
    expect(response.data.contractAlerts?.map(a => [a.alertId, a.type, a.status])).toEqual([
      [206, 'designacao_ausente', 'aberta'], [205, 'vigencia_vencida', 'em_tratamento'], [204, 'outro_tipo', 'aberta']]);
    expect(response.data.contractBalances).toEqual([{ contractId: 41, contractNumber: 'CT-41', contractedValue: 200, consumedValue: 50, balanceValue: 150, balancePct: 75 }]);
    expect(response.data.cards).toEqual({ activeContracts: 1, activePortfolioValue: 999, expiringContracts: 1, renewalsWithin120Days: 1 });
    expect(query).toHaveBeenCalledWith(GET_MANAGER_CONTRACT_ALERTS, [[41]]);
    expect(query).toHaveBeenCalledWith(GET_MANAGER_CONTRACT_BALANCES, [[41]]);
    await expect(composeManagerSummary(17, { ...filters, contratoId: [99] }, repo, now)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(GET_MANAGER_SCOPE).toContain("papel = 'gestor'");
  });
  it('protects SQL eligibility, exclusive financial source and deterministic ordering', () => {
    for (const sql of [GET_MANAGER_CONTRACT_ALERTS, GET_MANAGER_CONTRACT_BALANCES]) {
      expect(sql).toContain('c.id = ANY($1::bigint[])');
      expect(sql).toContain("c.status = 'vigente'");
      expect(sql).not.toMatch(/designacao|decisao/);
    }
    expect(GET_MANAGER_CONTRACT_ALERTS).toContain("p.status IN ('aberta', 'em_tratamento')");
    expect(GET_MANAGER_CONTRACT_ALERTS).toContain("p.entidade_tipo = 'contrato'");
    expect(GET_MANAGER_CONTRACT_ALERTS).toContain('c.id = p.entidade_id');
    expect(GET_MANAGER_CONTRACT_ALERTS).toContain('c.vigencia_fim::date::text AS expiry_date');
    expect(GET_MANAGER_CONTRACT_ALERTS).toContain('ORDER BY p.criado_em DESC, p.id DESC');
    expect(GET_MANAGER_CONTRACT_ALERTS).not.toMatch(/p.tipo\s*=|prazo_em/);
    expect(GET_MANAGER_CONTRACT_BALANCES).toContain('LEFT JOIN contratos.vw_saldo_contrato');
    expect(GET_MANAGER_CONTRACT_BALANCES).not.toMatch(/valor_total|COALESCE/);
  });
  it('deduplicates alert IDs without losing database ordering', async () => {
    const repo = new PostgresManagerRepository({ query: vi.fn().mockResolvedValue([alert(206), alert(206), alert(205)]) } as DbReader);
    expect((await repo.contractAlerts([41])).map(a => a.alertId)).toEqual([206, 205]);
  });
  it('returns available empty lists for empty current portfolio and unavailable history without current reads', async () => {
    const { repo, query } = fixture();
    const empty = await composeManagerSummary(18, filters, repo, now);
    expect(empty.data.contractAlerts).toEqual([]);
    expect(empty.data.contractBalances).toEqual([]);
    expect(empty.meta.dataCoverage).toMatchObject({ contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE' });
    query.mockClear();
    const past = await composeManagerSummary(17, { ...filters, dataReferencia: '2026-10-07' }, repo, now);
    expect(past.data.contractAlerts).toBeNull();
    expect(past.data.contractBalances).toBeNull();
    expect(past.meta.dataCoverage).toMatchObject({ contractAlerts: 'UNAVAILABLE', contractBalances: 'UNAVAILABLE' });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(GET_MANAGER_IDENTITY, [17]);
  });
  it('returns a valid empty alert list', async () => {
    const repo = new PostgresManagerRepository({ query: vi.fn().mockResolvedValue([]) } as DbReader);
    expect(await repo.contractAlerts([41])).toEqual([]);
  });
  it.each([null, 'NaN', '', 'Infinity', '9007199254740992'])('makes the entire balance list unavailable for missing/invalid amounts %s', async value => {
    const repo = new PostgresManagerRepository({ query: vi.fn().mockResolvedValue([balance(), { ...balance(), contracted_value: value }]) } as DbReader);
    expect(await repo.contractBalances([41])).toBeNull();
  });
  it.each(['0', '-1'])('keeps undefined percentages null for contracted value %s', async value => {
    const repo = new PostgresManagerRepository({ query: vi.fn().mockResolvedValue([balance(value)]) } as DbReader);
    expect((await repo.contractBalances([41]))?.[0].balancePct).toBeNull();
  });
  it.each([GET_MANAGER_CONTRACT_ALERTS, GET_MANAGER_CONTRACT_BALANCES])('sanitizes SQL failures in HTTP 500', async failedSql => {
    const { repo, query } = fixture();
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql, values) => {
      if (sql === failedSql) throw new Error('private database details');
      return original(sql, values);
    });
    const handler = createManagerHandler({ repository: repo, now, authProvider: { authenticate: async () => ({ status: 'AUTHENTICATED', principal: { userId: 17 }, canAccessManagerView: true }) } });
    const response = await handler({ rawQueryString: '', requestContext: { requestId: 'test' } } as any, {} as any, () => {});
    expect(response).toMatchObject({ statusCode: 500 });
    const body = (response as { body: string }).body;
    expect(JSON.parse(body).error.code).toBe('INTERNAL_ERROR');
    expect(body).not.toContain('private database details');
  });
});
