import { expect, it } from 'vitest';
import { sameReference } from './reference-compatible';

const summary = { meta: { dataReference: '2026-09-25', timezone: 'America/Fortaleza', generatedAt: '2026-09-25T12:00:00Z' } };
it('accepts equal reference and timezone regardless of generation time', () => {
  const auxiliary = { meta: { ...summary.meta, generatedAt: '2026-09-25T12:01:00Z' } };
  expect(sameReference(summary, auxiliary)).toBe(true);
});
it('rejects different reference date or timezone separately', () => {
  expect(sameReference(summary, { meta: { ...summary.meta, dataReference: '2026-09-26' } })).toBe(false);
  expect(sameReference(summary, { meta: { ...summary.meta, timezone: 'UTC' } })).toBe(false);
});
