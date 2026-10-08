import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from './db/index';
import { readCurrentItemBalances } from './item-balance-reader';
import { GET_CURRENT_ITEM_BALANCES } from './item-balance-query';

const row = () => ({
  contract_id: '2', contract_number: 'CT-2', supplier_name: 'Fornecedor', item_id: '10',
  sequence: 1, specification: 'Serviço', unit: 'un', quantity_contracted: '2',
  quantity_consumed: '0', quantity_measured: null, quantity_balance: '2',
  value_contracted: '0.105', value_consumed: '0', value_measured: null,
  value_balance: '0.105', verification_status: null,
});
const reader = (rows: unknown[]) => {
  const query = vi.fn().mockResolvedValue(rows);
  return { db: { query } as DbReader, query };
};

describe('shared item balance reader', () => {
  it('returns null only for SQL NULL and preserves decimal text for composition', async () => {
    const { db, query } = reader([row()]);
    const [item] = await readCurrentItemBalances(db, [2]);
    expect(item).toMatchObject({ valueContracted: 0.105, valueMeasured: null, quantityMeasured: null,
      raw: { valueContracted: '0.105', valueMeasured: null, quantityMeasured: null } });
    expect(query).toHaveBeenCalledWith(GET_CURRENT_ITEM_BALANCES, [[2]]);
  });
  it.each(['NaN', 'Infinity', '', '1e3', '12x'])('rejects malformed non-null numeric %s', async value => {
    const { db } = reader([{ ...row(), value_measured: value }]);
    await expect(readCurrentItemBalances(db, [2])).rejects.toThrow(TypeError);
  });
  it.each(['9007199254740992', '1'.padEnd(400, '0')])('rejects unsafe non-null numeric', async value => {
    const { db } = reader([{ ...row(), value_contracted: value }]);
    await expect(readCurrentItemBalances(db, [2])).rejects.toThrow(RangeError);
  });
  it('skips the view when the authorized portfolio is empty', async () => {
    const { db, query } = reader([]);
    await expect(readCurrentItemBalances(db, [])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
