import { safeBigintId, type DbReader } from './db/index';
import type { RawBalanceItem } from './item-balances';
import { GET_CURRENT_ITEM_BALANCES } from './item-balance-query';

interface ItemBalanceRow {
  contract_id: string | bigint; contract_number: string | null; supplier_name: string | null;
  item_id: string | bigint; sequence: number | null; specification: string | null; unit: string | null;
  quantity_contracted: string | null; quantity_consumed: string | null; quantity_measured: string | null;
  quantity_balance: string | null; value_contracted: string | null; value_consumed: string | null;
  value_measured: string | null; value_balance: string | null; verification_status: string | null;
  blocked_at: Date | string | null; block_reason: string | null;
}

function isoTimestamp(raw: Date | string | null): string | null {
  if (raw === null) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid database block timestamp');
  return date.toISOString();
}

function numericValue(raw: string | null): number | null {
  if (raw === null) return null;
  if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw)) throw new TypeError('Invalid database numeric value');
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) {
    throw new RangeError('Database numeric value exceeds safe representation');
  }
  return value;
}

export async function readCurrentItemBalances(db: DbReader, ids: readonly number[]): Promise<RawBalanceItem[]> {
  if (!ids.length) return [];
  const rows = await db.query<ItemBalanceRow>(GET_CURRENT_ITEM_BALANCES, [ids]);
  return rows.map(row => ({
    contractId: safeBigintId(row.contract_id), contractNumber: row.contract_number,
    supplierName: row.supplier_name, itemId: safeBigintId(row.item_id),
    sequence: row.sequence, specification: row.specification, unit: row.unit,
    quantityContracted: numericValue(row.quantity_contracted), quantityConsumed: numericValue(row.quantity_consumed),
    quantityMeasured: numericValue(row.quantity_measured), quantityBalance: numericValue(row.quantity_balance),
    valueContracted: numericValue(row.value_contracted), valueConsumed: numericValue(row.value_consumed),
    valueMeasured: numericValue(row.value_measured), valueBalance: numericValue(row.value_balance),
    statusVerificacao: row.verification_status, blockedAt: isoTimestamp(row.blocked_at), blockReason: row.block_reason,
    raw: { valueContracted: row.value_contracted, valueBalance: row.value_balance, valueMeasured: row.value_measured,
      quantityContracted: row.quantity_contracted, quantityBalance: row.quantity_balance, quantityMeasured: row.quantity_measured },
  }));
}
