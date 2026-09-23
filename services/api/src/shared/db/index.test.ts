import { describe, expect, it } from 'vitest';
import { readDbConfig, safeBigintId, toPoolConfig } from './index';

const env = {
  SAC_DB_HOST: 'localhost', SAC_DB_PORT: '5434', SAC_DB_NAME: 'sac',
  SAC_DB_USER: 'reader', SAC_DB_PASSWORD: 'test-only', SAC_DB_SSL: 'true',
};

describe('database configuration', () => {
  it('reads required settings and enables read-only sessions', () => {
    const config = readDbConfig(env);
    expect(config).toEqual({
      host: 'localhost', port: 5434, database: 'sac', user: 'reader',
      password: 'test-only', ssl: true,
    });
    expect(toPoolConfig(config).options).toBe('-c default_transaction_read_only=on');
  });

  it('rejects absent and invalid settings', () => {
    expect(() => readDbConfig({ ...env, SAC_DB_HOST: '' })).toThrow('SAC_DB_HOST');
    expect(() => readDbConfig({ ...env, SAC_DB_PASSWORD: undefined })).toThrow('SAC_DB_PASSWORD');
    expect(() => readDbConfig({ ...env, SAC_DB_PORT: '5434.5' })).toThrow('SAC_DB_PORT');
    expect(() => readDbConfig({ ...env, SAC_DB_SSL: 'maybe' })).toThrow('SAC_DB_SSL');
  });
});

describe('safe bigint conversion', () => {
  it('accepts IDs through the maximum safe integer', () => {
    expect(safeBigintId('42')).toBe(42);
    expect(safeBigintId(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects unsafe or malformed IDs', () => {
    expect(() => safeBigintId('9007199254740992')).toThrow(RangeError);
    expect(() => safeBigintId(9007199254740992)).toThrow(TypeError);
    expect(() => safeBigintId('12x')).toThrow(TypeError);
  });
});
