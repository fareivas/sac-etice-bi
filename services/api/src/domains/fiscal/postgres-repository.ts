import { createApiError, createInternalError } from '../../shared/errors/index';
import { safeBigintId, type DbReader } from '../../shared/db/index';
import { GET_FISCAL_IDENTITY, GET_FISCAL_CONTRACT_SCOPE, COUNT_ACTIVE_FISCAL_CONTRACTS } from './queries';
import { dateInTimezone } from './schemas';
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

interface ScopeRow { contrato_id: string | bigint }
interface CountRow { total: string | bigint }

interface IdentityRow {
  id: string | bigint;
  nome: string;
  ativo: boolean;
}

export class PostgresFiscalSummaryRepository implements FiscalSummaryRepository {
  constructor(private readonly db: DbReader, private readonly now: () => Date = () => new Date()) {}

  private isCurrent(context: FiscalRepositoryContext): boolean {
    return context.filters.dataReferencia === dateInTimezone(this.now(), context.filters.timezone);
  }

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

  async getAuthorizedContractScope(context: FiscalRepositoryContext): Promise<FiscalAuthorizedScope> {
    if (context.filters.unidadeId !== null) {
      throw createInternalError(new Error('Fiscal unit scope relation is undefined'));
    }
    if (!this.isCurrent(context)) return { coverage: 'UNAVAILABLE' };
    const rows = await this.db.query<ScopeRow>(GET_FISCAL_CONTRACT_SCOPE, [context.authenticatedUserId]);
    const authorized = [...new Set(rows.map((row) => safeBigintId(row.contrato_id)))];
    const allowed = new Set(authorized);
    const requested = context.filters.contratoId;
    if (requested.some((id) => !allowed.has(id))) throw createApiError('FORBIDDEN_SCOPE');
    const selected = requested.length ? [...new Set(requested)] : authorized;
    return { coverage: 'AVAILABLE', contracts: selected.map((contractId) => ({ contractId, integrationUuid: null })) };
  }

  async getActiveContracts(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map((contract) => contract.contractId);
    if (ids.length === 0) return { coverage: 'AVAILABLE', value: 0 };
    const rows = await this.db.query<CountRow>(COUNT_ACTIVE_FISCAL_CONTRACTS, [ids]);
    const total = safeBigintId(rows[0]?.total);
    return { coverage: 'AVAILABLE', value: total };
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
