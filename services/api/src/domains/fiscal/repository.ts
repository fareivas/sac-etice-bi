import type { FiscalDashboardFilters } from './schemas';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';

export interface FiscalIdentity {
  /** public.usuario.id from the already authenticated request context. */
  userId: number;
  /** Null when the repository cannot provide a usable name; no fallback. */
  name: string | null;
}

export interface FiscalAuthorizedContract {
  contractId: number;
  /** Proposed SAC/KPI correlation key; may not yet exist in the deployed MER. */
  integrationUuid: string | null;
}

export type FiscalAuthorizedScope =
  | { coverage: 'AVAILABLE'; contracts: readonly FiscalAuthorizedContract[] }
  | { coverage: 'UNAVAILABLE' };

/** An unavailable historical result has no numeric value; zero remains a real result. */
export type FiscalIndicatorResult =
  | { coverage: 'AVAILABLE'; value: number }
  | { coverage: 'UNAVAILABLE' };

export interface FiscalRepositoryContext {
  /** Derived by the caller from the authenticated principal, never from a query parameter. */
  authenticatedUserId: number;
  filters: FiscalDashboardFilters;
}

export interface FiscalScopedRepositoryQuery {
  context: FiscalRepositoryContext;
  scope: Extract<FiscalAuthorizedScope, { coverage: 'AVAILABLE' }>;
}

export type FiscalPriorityQueueItem =
  FiscalDashboardSummaryResponse['data']['priorityQueue'][number];

/**
 * Port for future SAC reads. Implementations must not substitute current state
 * for an unreconstructable dataReference. Query/data failures should reject;
 * insufficient historical coverage is represented by UNAVAILABLE.
 */
export interface FiscalSummaryRepository {
  getFiscalIdentity(authenticatedUserId: number): Promise<FiscalIdentity>;

  /**
   * Resolves only contracts visible to this user. A rejected explicit unit or
   * contract filter is a scope error, not an expanded scope or an empty match.
   * View authorization itself remains the caller/authentication boundary.
   */
  getAuthorizedContractScope(
    context: FiscalRepositoryContext,
  ): Promise<FiscalAuthorizedScope>;

  /** For each card: on valid empty scope return 0/AVAILABLE when apurable, else UNAVAILABLE. */
  getActiveContracts(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult>;
  getPendingServiceOrders(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult>;
  getCriticalItems(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult>;
  getOverdueActions(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult>;

  /** Returns only a successfully evaluated queue; inability to evaluate must not masquerade as []. */
  getPriorityQueue(query: FiscalScopedRepositoryQuery): Promise<readonly FiscalPriorityQueueItem[]>;
}
