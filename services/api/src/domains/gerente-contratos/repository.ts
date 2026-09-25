import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { createApiError } from '../../shared/errors/index';
import { safeBigintId, type DbReader } from '../../shared/db/index';
import { GET_MANAGER_ACTIVE_CONTRACTS, GET_MANAGER_IDENTITY, GET_MANAGER_SCOPE } from './queries';
import { GET_MANAGER_FISCAL_LOAD } from './carga-queries';

export type ManagerContract = NonNullable<ManagerDashboardSummaryResponse['data']['contracts']>[number];
export type ManagerActiveContract = ManagerContract & { expiresWithin120Days: boolean | null };
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
  async fiscalLoad(ids: readonly number[]) {
    if (!ids.length) return [];
    interface Row { user_id: string | bigint; name: string | null; active_contracts: string | bigint; pending_orders: string | bigint }
    const rows = await this.db.query<Row>(GET_MANAGER_FISCAL_LOAD, [ids]);
    return rows.map((row) => ({ userId: safeBigintId(row.user_id), name: row.name,
      activeContracts: safeBigintId(row.active_contracts), pendingOrders: safeBigintId(row.pending_orders),
      capacity: null, weightedLoad: null, criticality: null, ranking: null, overdueActions: null }));
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
