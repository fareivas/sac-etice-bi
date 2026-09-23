import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { ApiError } from '../../shared/errors/index';
import { GET_FISCAL_IDENTITY } from './queries';
import { PostgresFiscalSummaryRepository, RepositoryOperationNotImplemented } from './postgres-repository';

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

  it('fails explicitly for every unimplemented port', async () => {
    const { repository: repo } = repository([]);
    const query = {} as Parameters<typeof repo.getActiveContracts>[0];
    const context = {} as Parameters<typeof repo.getAuthorizedContractScope>[0];
    for (const operation of [
      repo.getAuthorizedContractScope(context), repo.getActiveContracts(query),
      repo.getPendingServiceOrders(query), repo.getCriticalItems(query),
      repo.getOverdueActions(query), repo.getPriorityQueue(query),
    ]) {
      await expect(operation).rejects.toBeInstanceOf(RepositoryOperationNotImplemented);
    }
  });
});
