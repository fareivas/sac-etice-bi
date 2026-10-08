import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db';
import { PostgresFiscalSummaryRepository } from './postgres-repository';
import { GET_FISCAL_CONTRACT_SCOPE, GET_CURRENT_FISCAL_CONTRACT_ALERTS } from './queries';

const now = () => new Date('2026-10-08T12:00:00Z');
const context = (ids: number[] = [], date = '2026-10-08') => ({ authenticatedUserId: 17,
  filters: { dataReferencia: date, timezone: 'America/Fortaleza', unidadeId: null, contratoId: ids, includeExternal: false } });
const alert = (id: number) => ({ alert_id: String(id), contract_id: '2', contract_number: 'CT-2',
  description: 'Vigência próxima do fim', expiry_date: '2026-10-20', created_at: new Date('2026-10-01T12:00:00Z') });

describe('Fiscal contract alerts', () => {
  it('returns alert 126 once after duplicate designations and preserves database ordering', async () => {
    const query = vi.fn(async (sql: string) => sql === GET_FISCAL_CONTRACT_SCOPE
      ? [{ contrato_id: '2' }, { contrato_id: '2' }, { contrato_id: '3' }]
      : [alert(126), alert(126), alert(125)]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, now);
    const scope = await repo.getAuthorizedContractScope(context([2]));
    if (scope.coverage !== 'AVAILABLE') throw new Error('Expected current scope');
    const scoped = { context: context([2]), scope };
    const result = await repo.getContractAlerts(scoped);
    expect(result).toEqual({ coverage: 'AVAILABLE', items: [126, 125].map(alertId => ({ alertId,
      contractId: 2, contractNumber: 'CT-2', description: 'Vigência próxima do fim',
      expiryDate: '2026-10-20', createdAt: '2026-10-01T12:00:00.000Z' })) });
    expect(query).toHaveBeenLastCalledWith(GET_CURRENT_FISCAL_CONTRACT_ALERTS, [[2]]);
    await expect(repo.getAuthorizedContractScope(context([999]))).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('restricts SQL to open expiry alerts and authorized vigente contracts without decision joins', () => {
    for (const predicate of ["p.entidade_tipo = 'contrato'", 'c.id = p.entidade_id',
      'c.id = ANY($1::bigint[])', "c.status = 'vigente'", "p.tipo = 'vigencia_vencendo'",
      "p.status = 'aberta'", 'c.vigencia_fim::date::text', 'ORDER BY p.criado_em DESC, p.id DESC']) {
      expect(GET_CURRENT_FISCAL_CONTRACT_ALERTS).toContain(predicate);
    }
    expect(GET_CURRENT_FISCAL_CONTRACT_ALERTS).not.toMatch(/decisao|designacao|prazo_em/);
    expect(GET_FISCAL_CONTRACT_SCOPE).toContain("papel = 'fiscal'");
    expect(GET_FISCAL_CONTRACT_SCOPE).toContain('ativo = true');
  });

  it('distinguishes no alerts, empty scope and unavailable history', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repo = new PostgresFiscalSummaryRepository({ query } as DbReader, now);
    const scope = { coverage: 'AVAILABLE' as const, contracts: [{ contractId: 2, integrationUuid: null }] };
    await expect(repo.getContractAlerts({ context: context(), scope })).resolves.toEqual({ coverage: 'AVAILABLE', items: [] });
    await expect(repo.getContractAlerts({ context: context(), scope: { coverage: 'AVAILABLE', contracts: [] } })).resolves.toEqual({ coverage: 'AVAILABLE', items: [] });
    await expect(repo.getContractAlerts({ context: context([], '2026-10-07'), scope })).resolves.toEqual({ coverage: 'UNAVAILABLE' });
    expect(query).toHaveBeenCalledOnce();
  });

  it('propagates real SQL failures', async () => {
    const error = new Error('SQL failed');
    const repo = new PostgresFiscalSummaryRepository({ query: vi.fn().mockRejectedValue(error) } as DbReader, now);
    await expect(repo.getContractAlerts({ context: context(), scope: { coverage: 'AVAILABLE', contracts: [{ contractId: 2, integrationUuid: null }] } })).rejects.toBe(error);
  });
});
