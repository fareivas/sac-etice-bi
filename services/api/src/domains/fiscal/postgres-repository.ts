import { createApiError, createInternalError } from '../../shared/errors/index';
import { safeBigintId, type DbReader } from '../../shared/db/index';
import { GET_FISCAL_IDENTITY, GET_FISCAL_CONTRACT_SCOPE, COUNT_ACTIVE_FISCAL_CONTRACTS, COUNT_PENDING_FISCAL_SERVICE_ORDERS, GET_PENDING_FISCAL_SERVICE_ORDERS, GET_CURRENT_FISCAL_CONTRACTS, GET_CURRENT_FISCAL_CONTRACT_BALANCES, GET_CURRENT_FISCAL_CONTRACT_ALERTS, GET_CURRENT_FISCAL_ITEM_BALANCES } from './queries';
import type { RawBalanceItem } from './item-balances';
import { dateInTimezone } from './schemas';
import type {
  FiscalAuthorizedScope,
  FiscalContractsResult,
  FiscalContractBalancesResult,
  FiscalContractAlertsResult,
  FiscalIdentity,
  FiscalIndicatorResult,
  FiscalPriorityQueueResult,
  FiscalPriorityQueueItem,
  FiscalRepositoryContext,
  FiscalScopedRepositoryQuery,
  FiscalSummaryRepository,
} from './repository';

interface ScopeRow { contrato_id: string | bigint }
interface CountRow { total: string | bigint }
interface PendingOrderRow { ordem_servico_id: string | bigint; contrato_id: string | bigint; contrato_numero: string | null }

interface ContractRow {
  contract_id: string | bigint; contract_number: string | null;
  supplier_name: string | null; value: string | null; expiry_date: string | null;
}
interface BalanceRow {
  contract_id: string | bigint; contract_number: string | null;
  contracted_value: string | null; consumed_value: string | null; balance_value: string | null;
}

interface ContractAlertRow {
  alert_id: string | bigint; contract_id: string | bigint;
  contract_number: string | null; description: string | null;
  expiry_date: string | null; created_at: Date | null;
}

interface ItemBalanceRow {
  contract_id: string | bigint; contract_number: string | null; supplier_name: string | null;
  item_id: string | bigint; sequence: number | null; specification: string | null; unit: string | null;
  quantity_contracted: string | null; quantity_consumed: string | null; quantity_measured: string | null;
  quantity_balance: string | null; value_contracted: string | null; value_consumed: string | null;
  value_measured: string | null; value_balance: string | null; verification_status: string | null;
}

// PostgreSQL numeric arrives as text. Reject non-finite or unsafe cent values.
function moneyValue(raw: string | null): number | null {
  if (raw === null || typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100 ? value : null;
}

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

  async getContracts(query: FiscalScopedRepositoryQuery): Promise<FiscalContractsResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map(contract => contract.contractId);
    if (!ids.length) return { coverage: 'AVAILABLE', items: [] };
    const rows = await this.db.query<ContractRow>(GET_CURRENT_FISCAL_CONTRACTS, [ids]);
    return { coverage: 'AVAILABLE', items: rows.map(row => ({
      contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
      supplierName: row.supplier_name, value: moneyValue(row.value), expiryDate: row.expiry_date,
    })) };
  }

  async getContractBalances(query: FiscalScopedRepositoryQuery): Promise<FiscalContractBalancesResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map(contract => contract.contractId);
    if (!ids.length) return { coverage: 'AVAILABLE', items: [] };
    const rows = await this.db.query<BalanceRow>(GET_CURRENT_FISCAL_CONTRACT_BALANCES, [ids]);
    const items = [];
    for (const row of rows) {
      const contractedValue = moneyValue(row.contracted_value);
      const consumedValue = moneyValue(row.consumed_value);
      const balanceValue = moneyValue(row.balance_value);
      // A missing view row (LEFT JOIN) must never become a fabricated zero.
      if (contractedValue === null || consumedValue === null || balanceValue === null) {
        return { coverage: 'UNAVAILABLE' };
      }
      const percentage = contractedValue > 0 ? balanceValue / contractedValue * 100 : null;
      items.push({ contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
        contractedValue, consumedValue, balanceValue,
        balancePct: percentage !== null && Number.isFinite(percentage) ? percentage : null });
    }
    return { coverage: 'AVAILABLE', items };
  }

  async getItemBalances(query: FiscalScopedRepositoryQuery): Promise<{ coverage: 'AVAILABLE'; items: RawBalanceItem[] } | { coverage: 'UNAVAILABLE' }> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map(contract => contract.contractId);
    if (!ids.length) return { coverage: 'AVAILABLE', items: [] };
    const rows = await this.db.query<ItemBalanceRow>(GET_CURRENT_FISCAL_ITEM_BALANCES, [ids]);
    return { coverage: 'AVAILABLE', items: rows.map(row => ({
      contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
      supplierName: row.supplier_name, itemId: safeBigintId(row.item_id),
      sequence: row.sequence, specification: row.specification, unit: row.unit,
      quantityContracted: moneyValue(row.quantity_contracted), quantityConsumed: moneyValue(row.quantity_consumed),
      quantityMeasured: moneyValue(row.quantity_measured), quantityBalance: moneyValue(row.quantity_balance),
      valueContracted: moneyValue(row.value_contracted), valueConsumed: moneyValue(row.value_consumed),
      valueMeasured: moneyValue(row.value_measured), valueBalance: moneyValue(row.value_balance),
      statusVerificacao: row.verification_status, blockedAt: null, blockReason: null,
      raw: { valueContracted: row.value_contracted, valueBalance: row.value_balance, valueMeasured: row.value_measured,
        quantityContracted: row.quantity_contracted, quantityBalance: row.quantity_balance, quantityMeasured: row.quantity_measured },
    })) };
  }

  async getContractAlerts(query: FiscalScopedRepositoryQuery): Promise<FiscalContractAlertsResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map(contract => contract.contractId);
    if (!ids.length) return { coverage: 'AVAILABLE', items: [] };
    const rows = await this.db.query<ContractAlertRow>(GET_CURRENT_FISCAL_CONTRACT_ALERTS, [ids]);
    const seen = new Set<number>();
    const items: Extract<FiscalContractAlertsResult, { coverage: 'AVAILABLE' }>['items'][number][] = [];
    for (const row of rows) {
      const alertId = safeBigintId(row.alert_id);
      if (seen.has(alertId)) continue;
      seen.add(alertId);
      items.push({ alertId, contractId: safeBigintId(row.contract_id),
        contractNumber: row.contract_number, description: row.description,
        expiryDate: row.expiry_date, createdAt: row.created_at === null ? null : row.created_at.toISOString() });
    }
    return { coverage: 'AVAILABLE', items };
  }

  async getActiveContracts(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map((contract) => contract.contractId);
    if (ids.length === 0) return { coverage: 'AVAILABLE', value: 0 };
    const rows = await this.db.query<CountRow>(COUNT_ACTIVE_FISCAL_CONTRACTS, [ids]);
    const total = safeBigintId(rows[0]?.total);
    return { coverage: 'AVAILABLE', value: total };
  }

  async getPendingServiceOrders(query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map((contract) => contract.contractId);
    if (ids.length === 0) return { coverage: 'AVAILABLE', value: 0 };
    const rows = await this.db.query<CountRow>(COUNT_PENDING_FISCAL_SERVICE_ORDERS, [ids]);
    return { coverage: 'AVAILABLE', value: safeBigintId(rows[0]?.total) };
  }

  async getCriticalItems(_query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    return { coverage: 'UNAVAILABLE' };
  }

  async getOverdueActions(_query: FiscalScopedRepositoryQuery): Promise<FiscalIndicatorResult> {
    return { coverage: 'UNAVAILABLE' };
  }

  async getPriorityQueue(query: FiscalScopedRepositoryQuery): Promise<FiscalPriorityQueueResult> {
    if (!this.isCurrent(query.context)) return { coverage: 'UNAVAILABLE' };
    const ids = query.scope.contracts.map((contract) => contract.contractId);
    if (ids.length === 0) return { coverage: 'AVAILABLE', items: [] };
    const rows = await this.db.query<PendingOrderRow>(GET_PENDING_FISCAL_SERVICE_ORDERS, [ids]);
    const seen = new Set<number>();
    const items: FiscalPriorityQueueItem[] = [];
    for (const row of rows) {
      const orderId = safeBigintId(row.ordem_servico_id);
      if (seen.has(orderId)) continue;
      seen.add(orderId);
      items.push({ type: 'SERVICE_ORDER', severity: null, contractId: safeBigintId(row.contrato_id),
        contractNumber: row.contrato_numero, supplierName: null, title: null, dueAt: null });
    }
    return { coverage: 'AVAILABLE', items };
  }
}
