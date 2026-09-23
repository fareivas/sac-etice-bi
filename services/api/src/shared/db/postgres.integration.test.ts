import { describe, expect, it } from 'vitest';
import { PostgresDb, readDbConfig } from './index';

const enabled = process.env.SAC_DB_INTEGRATION_TEST === 'true';

describe.skipIf(!enabled)('PostgreSQL read-only integration', () => {
  it('connects, sees the identity schema, and rejects writes', async () => {
    const db = new PostgresDb(readDbConfig());
    try {
      const rows = await db.query<{ id: number; read_only: string }>(
        'SELECT 1 AS id, current_setting($1) AS read_only',
        ['default_transaction_read_only'],
      );
      expect(rows).toEqual([{ id: 1, read_only: 'on' }]);
      const columns = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
           AND column_name IN ('id', 'nome', 'ativo')`,
        ['comum', 'usuario'],
      );
      expect(columns.map((row) => row.column_name).sort()).toEqual(['ativo', 'id', 'nome']);
    } finally {
      await db.close();
    }
  });
});
