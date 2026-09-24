import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixtureConfig } from './fiscal-fixture-lib.mjs';
const valid = { NODE_ENV: 'test', ALLOW_LOCAL_DB_FIXTURES: 'true', SAC_DB_HOST: '127.0.0.1', SAC_DB_PORT: '5434', SAC_DB_NAME: 'sac', SAC_DB_USER: 'test', SAC_DB_PASSWORD: 'secret' };
test('fixture exige opt-in e recusa produção', () => {
  assert.throws(() => fixtureConfig({ ...valid, NODE_ENV: 'production' }), /production/);
  assert.throws(() => fixtureConfig({ ...valid, ALLOW_LOCAL_DB_FIXTURES: 'false' }), /ALLOW_LOCAL/);
});
test('fixture exige configuração válida', () => {
  assert.throws(() => fixtureConfig({ ...valid, SAC_DB_PASSWORD: '' }), /SAC_DB_PASSWORD/);
  assert.throws(() => fixtureConfig({ ...valid, SAC_DB_PORT: 'abc' }), /SAC_DB_PORT/);
  assert.equal(fixtureConfig(valid).port, 5434);
});
