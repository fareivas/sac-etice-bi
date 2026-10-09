// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { contractExpiryLabel, FiscalContractExpiry } from './contract-expiry';

it.each([
  ['2026-10-07', '2026-10-08', 'Vencido há 1 dia'],
  ['2026-10-08', '2026-10-08', 'Vence hoje'],
  ['2026-10-09', '2026-10-08', 'Vence em 1 dia'],
  ['2026-10-10', '2026-10-08', 'Vence em 2 dias'],
  ['2026-10-06', '2026-10-08', 'Vencido há 2 dias'],
  ['2026-11-01', '2026-10-31', 'Vence em 1 dia'],
  ['2026-10-31', '2026-11-01', 'Vencido há 1 dia'],
  ['2027-01-01', '2026-12-31', 'Vence em 1 dia'],
  ['2026-12-31', '2027-01-01', 'Vencido há 1 dia'],
  ['2024-02-29', '2024-02-28', 'Vence em 1 dia'],
  ['2024-03-01', '2024-02-28', 'Vence em 2 dias'],
  ['2024-02-28', '2024-03-01', 'Vencido há 2 dias'],
  ['2023-03-01', '2023-02-28', 'Vence em 1 dia'],
  ['2000-03-01', '2000-02-28', 'Vence em 2 dias'],
  ['1900-03-01', '1900-02-28', 'Vence em 1 dia'],
  ['2025-01-01', '2024-01-01', 'Vence em 366 dias'],
  ['2026-03-09', '2026-03-07', 'Vence em 2 dias'],
  ['0099-01-01', '0098-12-31', 'Vence em 1 dia'],
])('compares calendar dates %s vs %s', (expiry, reference, expected) => {
  expect(contractExpiryLabel(expiry, reference)).toBe(expected);
});

it.each([null, undefined, '', 'inválida', '2026-02-29', '2024-02-30', '2026-04-31',
  '2026-13-01', '2026-00-01', '2026-01-00', '2026-01-32', '1900-02-29',
  '2026-1-01', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00-03:00', ' 2026-10-08'])('keeps invalid or absent expiry %s unavailable', expiry => {
  expect(contractExpiryLabel(expiry, '2026-10-08')).toBe('Data de vigência indisponível');
});

it.each([null, undefined, '', 'invalid', '2026-02-29'])('does not substitute the browser date for invalid reference %s', reference => {
  expect(contractExpiryLabel('2026-10-08', reference)).toBe('Data de vigência indisponível');
});

it.each(['Pacific/Kiritimati', 'America/Los_Angeles', 'America/Fortaleza'])('preserves the date and relative label in %s regardless of browser time', timezone => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2040-01-01T23:59:00Z'));
    const html = renderToStaticMarkup(<FiscalContractExpiry expiryDate="2024-03-01" reference="2024-02-28" timezone={timezone} />);
    expect(html).toContain('01/03/2024');
    expect(html).toContain('Vence em 2 dias');
  } finally { vi.useRealTimers(); }
});

it('does not display an invalid expiry as a real calendar date', () => {
  const html = renderToStaticMarkup(<FiscalContractExpiry expiryDate="2026-02-31" reference="2026-02-28" timezone="America/Fortaleza" />);
  expect(html).toContain('Data de vigência indisponível');
  expect(html).toContain('Indisponível');
  expect(html).not.toContain('31/02');
});
