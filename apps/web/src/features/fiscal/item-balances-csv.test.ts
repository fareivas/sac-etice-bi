import { expect, it } from 'vitest';
import { fiscalItemsCsv } from './item-balances-csv';
import { fixtures } from '../../../../../scripts/test/fixtures/fiscal-items-csv';
function available(name: keyof typeof fixtures = 'committedValue') {
  const balances = fixtures[name].data.itemBalances;
  if (balances?.coverage !== 'AVAILABLE') throw new Error('Invalid fixture');
  return balances;
}
it('serializes each response item once in source order with the reference and effective criteria', () => {
  const balances = available();
  const original = structuredClone(balances);
  const csv = fiscalItemsCsv(balances.itens, '2026-10-08', balances.criterio);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('"2026-10-08";"2";"13/2025";"101";"1";"Fornecedor de teste";');
  expect(csv).toContain('"comprometido";"valor";"0.6";"0.1"\r\n');
  expect(csv.match(/"2026-10-08";"2"/g)).toHaveLength(5);
  expect(csv.indexOf(';"101";')).toBeLessThan(csv.indexOf(';"105";'));
  expect(balances).toEqual(original);
});
it('preserves missing numeric/text fields as blank, zero as zero and legitimate negatives without formula protection', () => {
  const balances = available();
  const csv = fiscalItemsCsv(balances.itens, '2026-10-08', balances.criterio);
  expect(csv).toContain('"103";"3";"Fornecedor de teste";"Item de teste 103";"h";"1000";"1000";"1000";"0";"0";"10";"10";"10";"0";"0";"0";"0";"critico";"verificado"');
  expect(csv).toContain('"104";"4";"Fornecedor de teste";"Item de teste 104";"";"";"";"";"";"";"";"";"";"";"";"";"";"nao_verificavel";""');
  expect(csv).toContain('"105";"5";"Zeta";"Saldo negativo legítimo";"h";"1000";"1100";"1200";"-100";"-200";"10";"11";"12";"-1";"-2";"-0.1";"-0.2"');
  expect(csv).not.toContain("'-100");
  expect(csv).not.toContain('300000'); // Global contract balance is never a substitute.
});
it('escapes special characters and neutralizes text formulas while preserving original whitespace', () => {
  const balances = available();
  const csv = fiscalItemsCsv([balances.itens[0]], '2026-10-08', balances.criterio);
  expect(csv).toContain('"\'=Serviço; ""café""\nNova linha"');
  expect(csv).toContain('"\'@verificação"');
});
it.each(['=1', '+1', '-1', '@1', ' \t=1', '\r\n-1'])('protects all textual item fields against formulas: %s', text => {
  const balances = available();
  const item = { ...balances.itens[0], contractNumber: text, supplierName: text, specification: text,
    unit: text, statusVerificacao: text, blockReason: text };
  const csv = fiscalItemsCsv([item], '2026-10-08', balances.criterio);
  expect(csv.split(`"'${text}"`)).toHaveLength(7);
});
it('exports the alternative measured/quantity criteria, returned bands and absent measured values without recalculation', () => {
  const balances = available('measuredQuantity');
  const csv = fiscalItemsCsv([balances.itens[0]], '2026-10-08', balances.criterio);
  expect(csv).toContain('"h";"1000";"200";"";"800";"1000";"10";"2";"";"8";"10";"0.8";"1";"adequado"');
  expect(csv).toContain('"medido";"quantidade";"0.75";"0.2"');
  const item = { ...balances.itens[0], faixa: 'nao_verificavel' as const };
  expect(fiscalItemsCsv([item], '2026-10-08', balances.criterio)).toContain('"nao_verificavel"');
});
it('exports only supplied visible items, not other rows in the response', () => {
  const balances = available();
  const csv = fiscalItemsCsv([balances.itens[2]], '2026-10-08', balances.criterio);
  expect(csv).toContain(';"103";');
  for (const id of [101, 102, 104, 105]) expect(csv).not.toContain(`;"${id}";`);
});
