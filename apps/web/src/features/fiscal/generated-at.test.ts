import { expect, it } from 'vitest';
import { displayGeneratedAt } from './generated-at';
it('formats the response timestamp in its timezone independently of the reference date and browser timezone', () => {
  expect(displayGeneratedAt('2026-10-09T01:35:42Z', 'America/Fortaleza')).toBe('08/10/2026, 22:35:42');
  expect(displayGeneratedAt('2026-10-09T01:35:42Z', 'UTC')).toBe('09/10/2026, 01:35:42');
  expect(displayGeneratedAt('invalid', 'UTC')).toBe('Indisponível');
});
