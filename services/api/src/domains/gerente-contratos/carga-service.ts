import { managerFiscalLoadResponseSchema, type ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
import { dateInTimezone } from '../fiscal/schemas';
import type { ManagerFilters } from './schemas';
import type { PostgresManagerRepository } from './repository';

export async function composeManagerFiscalLoad(userId: number, filters: ManagerFilters,
  repository: Pick<PostgresManagerRepository, 'identity' | 'scope' | 'fiscalLoad'>,
  now: () => Date = () => new Date()): Promise<ManagerFiscalLoadResponse> {
  const manager = await repository.identity(userId);
  if (manager.userId !== userId) throw new Error('Identity mismatch');
  const current = filters.dataReferencia === dateInTimezone(now(), filters.timezone);
  const inspectors = current ? await repository.fiscalLoad(await repository.scope(userId, filters.contratoId)) : null;
  const coverage = current ? 'AVAILABLE' : 'UNAVAILABLE';
  return managerFiscalLoadResponseSchema.parse({
    meta: { generatedAt: now().toISOString(), dataReference: filters.dataReferencia, timezone: filters.timezone,
      source: 'SAC', merCoverage: 'PROPOSTA', dataCoverage: { inspectors: coverage,
        activeContracts: coverage, pendingOrders: coverage, capacity: 'UNAVAILABLE',
        weightedLoad: 'UNAVAILABLE', criticality: 'UNAVAILABLE', ranking: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' } },
    data: { inspectors },
  });
}
