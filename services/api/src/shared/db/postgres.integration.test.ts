import { describe, expect, it } from 'vitest';
import { PostgresDb, readDbConfig } from './index';

const enabled = process.env.SAC_DB_INTEGRATION_TEST === 'true';

describe.skipIf(!enabled)('PostgreSQL read-only integration', () => {
  it('connects, checks required structure, and rejects a temporary write', async () => {
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
      const required = [
        { table: 'designacao', columns: ['ativo', 'contrato_id', 'papel', 'usuario_id'] },
        { table: 'contrato', columns: ['id', 'status'] },
        { table: 'vw_saldo_item', columns: [
          'contrato_id', 'contrato_item_id', 'valor_contratado', 'valor_consumido', 'valor_saldo',
        ] },
      ];
      for (const { table, columns: expected } of required) {
        const actual = await db.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
             AND column_name = ANY($3::text[])`,
          ['contratos', table, expected],
        );
        expect(actual.map((row) => row.column_name).sort()).toEqual([...expected].sort());
      }
      await expect(db.query('CREATE TEMP TABLE fiscal_read_only_probe (id integer)'))
        .rejects.toMatchObject({ code: '25006' });
    } finally {
      await db.close();
    }
  });
});
