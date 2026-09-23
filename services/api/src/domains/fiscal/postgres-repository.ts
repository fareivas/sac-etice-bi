import { createApiError } from '../../shared/errors/index';
import { safeBigintId, type DbReader } from '../../shared/db/index';
import { GET_FISCAL_IDENTITY } from './queries';
import type {
  FiscalAuthorizedScope,
  FiscalIdentity,
  FiscalIndicatorResult,
  FiscalPriorityQueueItem,
  FiscalRepositoryContext,
  FiscalScopedRepositoryQuery,
  FiscalSummaryRepository,
} from './repository';

export class RepositoryOperationNotImplemented extends Error {
  constructor(operation: string) {
    super(`Fiscal repository operation is not implemented: ${operation}`);
    this.name = 'RepositoryOperationNotImplemented';
  }
}

interface IdentityRow {
  id: string | bigint;
  nome: string;
  ativo: boolean;
}

export class PostgresFiscalSummaryRepository implements FiscalSummaryRepository {
  constructor(private readonly db: DbReader) {}

  async getFiscalIdentity(authenticatedUserId: number): Promise<FiscalIdentity> {
    if (!Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0) {
      throw new TypeError('Invalid authenticated user ID');
    }
    const rows = await this.db.query<IdentityRow>(GET_FISCAL_IDENTITY, [authenticatedUserId]);
    const user = rows[0];
    if (!user || user.ativo !== true) throw createApiError('UNAUTHENTICATED');
    const userId = safeBigintId(user.id);
    if (userId !== authenticatedUserId) throw new Error('Database identity mismatch');
    if (typeof user.nome !== 'string') throw new TypeError('Invalid database user name');
    return { userId, name: user.nome.trim() || null };
  }

  async getAuthorizedContractScope(_context: FiscalRepositoryContext): Promise<FiscalAuthorizedScope> {
    throw new RepositoryOperationNotImplemented('getAuthorizedContractScope');
  }

  async getActiveContracts(_query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    throw new RepositoryOperationNotImplemented('getActiveContracts');
  }

  async getPendingServiceOrders(_query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    throw new RepositoryOperationNotImplemented('getPendingServiceOrders');
  }

  async getCriticalItems(_query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    throw new RepositoryOperationNotImplemented('getCriticalItems');
  }

  async getOverdueActions(_query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    throw new RepositoryOperationNotImplemented('getOverdueActions');
  }

  async getPriorityQueue(_query: FiscalScopedRepositoryQuery): Promise<readonly FiscalPriorityQueueItem[]> {
    throw new RepositoryOperationNotImplemented('getPriorityQueue');
  }
}
