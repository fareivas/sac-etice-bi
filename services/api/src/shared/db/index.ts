import { Pool, type PoolConfig, type QueryResultRow } from 'pg';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export function readDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const required = (key: string): string => {
    const value = env[key];
    if (!value?.trim()) throw new Error(`Missing required database setting: ${key}`);
    return value;
  };
  const port = Number(required('SAC_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid database setting: SAC_DB_PORT');
  }
  const sslText = env.SAC_DB_SSL ?? 'false';
  if (sslText !== 'true' && sslText !== 'false') {
    throw new Error('Invalid database setting: SAC_DB_SSL');
  }
  return {
    host: required('SAC_DB_HOST'),
    port,
    database: required('SAC_DB_NAME'),
    user: required('SAC_DB_USER'),
    password: required('SAC_DB_PASSWORD'),
    ssl: sslText === 'true',
  };
}

export function toPoolConfig(config: DbConfig): PoolConfig {
  return {
    ...config,
    options: '-c default_transaction_read_only=on',
  };
}

export interface DbReader {
  query<T extends QueryResultRow>(sql: string, values?: readonly unknown[]): Promise<T[]>;
}

export class PostgresDb implements DbReader {
  private readonly pool: Pool;

  constructor(config: DbConfig) {
    this.pool = new Pool(toPoolConfig(config));
  }

  async query<T extends QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, [...values]);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let sharedDb: PostgresDb | undefined;

export function getDb(): PostgresDb {
  sharedDb ??= new PostgresDb(readDbConfig());
  return sharedDb;
}

export async function closeDb(): Promise<void> {
  const db = sharedDb;
  sharedDb = undefined;
  await db?.close();
}

export function safeBigintId(value: unknown): number {
  if (typeof value !== 'bigint' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    throw new TypeError('Invalid database bigint ID');
  }
  const id = BigInt(value);
  if (id < 0n || id > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Database bigint ID exceeds the safe HTTP integer range');
  }
  return Number(id);
}
