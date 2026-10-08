import { describe, expect, it } from 'vitest';
import { PostgresDb, readDbConfig } from '../../shared/db';
import { GET_MANAGER_SUPPLIER_CONTRACTS } from './fornecedores-queries';

describe.skipIf(process.env.SAC_DB_INTEGRATION_TEST !== 'true')('Supplier SQL read-only PostgreSQL regression', () => {
  it('executes DISTINCT with selected ordering aliases without writing data', async () => {
    const db = new PostgresDb(readDbConfig());
    try {
      expect(await db.query("SELECT current_setting('transaction_read_only') AS read_only")).toEqual([{ read_only: 'on' }]);
      await expect(db.query(GET_MANAGER_SUPPLIER_CONTRACTS, [[]])).resolves.toEqual([]);
    } finally { await db.close(); }
  });
});
