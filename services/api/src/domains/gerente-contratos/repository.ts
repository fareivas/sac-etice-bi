import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { createApiError } from '../../shared/errors/index';
import { safeBigintId, type DbReader } from '../../shared/db/index';
import { GET_MANAGER_ACTIVE_CONTRACTS, GET_MANAGER_IDENTITY, GET_MANAGER_SCOPE, GET_MANAGER_CONTRACT_ALERTS, GET_MANAGER_CONTRACT_BALANCES } from './queries';
import { GET_MANAGER_FISCAL_LOAD } from './carga-queries';
import { GET_MANAGER_SUPPLIER_CONTRACTS } from './fornecedores-queries';

export type ManagerContract = NonNullable<ManagerDashboardSummaryResponse['data']['contracts']>[number];
export type ManagerActiveContract = ManagerContract & { expiresWithin120Days: boolean | null };
// Keep the same conservative numeric policy as the Fiscal balance reader.
function moneyValue(raw: string | null): number | null {
  if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100 ? value : null;
}
interface IdentityRow { id: string | bigint; nome: string; ativo: boolean }
interface ScopeRow { contrato_id: string | bigint }
interface ContractRow { contract_id: string | bigint; contract_number: string | null; supplier_name: string | null; value: string | null; expiry_date: string | null; expires_within_120_days: boolean | null }
export class PostgresManagerRepository {
  constructor(private readonly db: DbReader) {}
  async identity(userId: number) {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new TypeError('Invalid user ID');
    const row = (await this.db.query<IdentityRow>(GET_MANAGER_IDENTITY, [userId]))[0];
    if (!row || row.ativo !== true) throw createApiError('UNAUTHENTICATED');
    if (safeBigintId(row.id) !== userId || typeof row.nome !== 'string') throw new TypeError('Invalid identity');
    return { userId, name: row.nome.trim() || null };
  }
  async scope(userId: number, requested: readonly number[]) {
    const rows = await this.db.query<ScopeRow>(GET_MANAGER_SCOPE, [userId]);
    const authorized = [...new Set(rows.map((row) => safeBigintId(row.contrato_id)))];
    if (requested.some((id) => !authorized.includes(id))) throw createApiError('FORBIDDEN_SCOPE');
    return requested.length ? [...requested] : authorized;
  }
  async supplierContracts(ids: readonly number[]) {
    if (!ids.length) return [];
    interface Row { contract_id: string | bigint; supplier_id: string | bigint; name: string; status: string; value: string | null }
    const rows = await this.db.query<Row>(GET_MANAGER_SUPPLIER_CONTRACTS, [ids]);
    const seen = new Set<number>();
    return rows.map((row) => {
      const contractId = safeBigintId(row.contract_id);
      if (seen.has(contractId)) return null;
      seen.add(contractId);
      if (typeof row.name !== 'string' || typeof row.status !== 'string' ||
          (row.value !== null && !/^-?\d+(\.\d+)?$/.test(row.value))) throw new TypeError('Invalid supplier contract row');
      return { contractId, supplierId: safeBigintId(row.supplier_id), name: row.name,
        status: row.status, value: row.value };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
  }
  async fiscalLoad(ids: readonly number[]) {
    if (!ids.length) return [];
    interface Row { user_id: string | bigint; name: string | null; active_contracts: string | bigint; pending_orders: string | bigint }
    const rows = await this.db.query<Row>(GET_MANAGER_FISCAL_LOAD, [ids]);
    return rows.map((row) => ({ userId: safeBigintId(row.user_id), name: row.name,
      activeContracts: safeBigintId(row.active_contracts), pendingOrders: safeBigintId(row.pending_orders),
      capacity: null, weightedLoad: null, criticality: null, ranking: null, overdueActions: null }));
  }
  async contractAlerts(ids: readonly number[]): Promise<NonNullable<ManagerDashboardSummaryResponse['data']['contractAlerts']>> {
    if (!ids.length) return [];
    interface Row { alert_id: string | bigint; contract_id: string | bigint; contract_number: string | null;
      type: string | null; status: 'aberta' | 'em_tratamento'; description: string | null;
      expiry_date: string | null; created_at: Date | null }
    const rows = await this.db.query<Row>(GET_MANAGER_CONTRACT_ALERTS, [ids]);
    const seen = new Set<number>();
    return rows.flatMap(row => {
      const alertId = safeBigintId(row.alert_id);
      if (seen.has(alertId)) return [];
      seen.add(alertId);
      return [{ alertId, contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
        type: row.type, status: row.status, description: row.description, expiryDate: row.expiry_date,
        createdAt: row.created_at === null ? null : row.created_at.toISOString() }];
    });
  }
  async contractBalances(ids: readonly number[]): Promise<ManagerDashboardSummaryResponse['data']['contractBalances']> {
    if (!ids.length) return [];
    interface Row { contract_id: string | bigint; contract_number: string | null;
      contracted_value: string | null; consumed_value: string | null; balance_value: string | null }
    const rows = await this.db.query<Row>(GET_MANAGER_CONTRACT_BALANCES, [ids]);
    const items = [];
    for (const row of rows) {
      const contractedValue = moneyValue(row.contracted_value);
      const consumedValue = moneyValue(row.consumed_value);
      const balanceValue = moneyValue(row.balance_value);
      if (contractedValue === null || consumedValue === null || balanceValue === null) return null;
      const pct = contractedValue > 0 ? balanceValue / contractedValue * 100 : null;
      items.push({ contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
        contractedValue, consumedValue, balanceValue,
        balancePct: pct !== null && Number.isFinite(pct) ? pct : null });
    }
    return items;
  }
  async activeContracts(ids: readonly number[], dataReference: string): Promise<ManagerActiveContract[]> {
    if (!ids.length) return [];
    const rows = await this.db.query<ContractRow>(GET_MANAGER_ACTIVE_CONTRACTS, [ids, dataReference]);
    return rows.map((row) => {
      let value: number | null = null;
      if (row.value !== null) {
        if (!/^-?\d+(\.\d+)?$/.test(row.value)) throw new TypeError('Invalid money value');
        value = Number(row.value);
        if (!Number.isFinite(value)) throw new RangeError('Unsafe money value');
      }
      if (row.expiry_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiry_date)) throw new TypeError('Invalid expiry date');
      if (row.expiry_date !== null && typeof row.expires_within_120_days !== 'boolean') throw new TypeError('Invalid expiry classification');
      return { contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
        supplierName: row.supplier_name, value, expiryDate: row.expiry_date,
        expiresWithin120Days: row.expires_within_120_days };
    });
  }
}
