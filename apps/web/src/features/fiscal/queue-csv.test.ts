import { expect, it } from 'vitest';
import { fiscalQueueCsv } from './queue-csv';
import { filterFiscalQueue } from './use-fiscal-queue-filters';
import { fixture } from '../../../../../scripts/test/fixtures/fiscal-queue-filters';
const empty = { contract: '', status: '' as const, search: '' };
const queue = fixture.data.priorityQueue!;
it('exports a BOM, semicolon headers, reference and one row for each visible pendency in source order', () => {
  const csv = fiscalQueueCsv(filterFiscalQueue(queue, empty), '2026-10-08');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.split('\r\n')).toHaveLength(9); // header + seven pendencies + trailing newline
  expect(csv).toContain('"Data de referência";"ID da OS";"ID do contrato";"Contrato";"Fornecedor";"ID da pendência";"Descrição";"Status"');
  expect(csv).toContain('"2026-10-08";"11";"184";"13/2025";"Árvore";"101";"Documento divergente";"aberta"');
  expect(csv).toContain('"2026-10-08";"11";"184";"13/2025";"Árvore";"103";"Decisão fiscal pendente no Processo 1";"aberta"');
  expect(csv).toContain('"2026-10-08";"14";"317";"";"";"401";');
});
it('exports exactly the combined contract/status/description selection without hidden pendencies', () => {
  const csv = fiscalQueueCsv(filterFiscalQueue(queue, { contract: '205', status: 'em_tratamento', search: 'DÓCUMENTO' }), '2026-10-08');
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv).toContain('"202";"Documento em revisão";"em_tratamento"');
  expect(csv).not.toContain('Documento ausente');
  expect(csv).not.toContain('"11"');
});
it('escapes quotes, separators, line breaks and preserves accents and absent fields', () => {
  const item = { ...queue[0], contractId: null, contractNumber: null, supplierName: 'João; "Árvore"',
    pendencies: [{ ...queue[0].pendencies[0], description: 'Ação; "conferir"\r\nsegunda linha\nterceira' }] };
  expect(fiscalQueueCsv(filterFiscalQueue([item], empty), '2026-10-08')).toContain(
    '"11";"";"";"João; ""Árvore""";"101";"Ação; ""conferir""\r\nsegunda linha\nterceira";"aberta"');
});
it.each(['=SUM(1;2)', '+1', '-1', '@comando', ' \t=1', '\r\n+1', '\u0000@1'])('neutralizes spreadsheet formula text: %s', text => {
  const item = { ...queue[0], contractNumber: text, supplierName: text,
    pendencies: [{ ...queue[0].pendencies[0], description: text }] };
  const csv = fiscalQueueCsv(filterFiscalQueue([item], empty), '2026-10-08');
  expect(csv.split(`"'${text}"`)).toHaveLength(4);
});
it('preserves a defensive row for an OS without details and leaves absent pendency fields blank', () => {
  const item = { ...queue[0], contractId: null, contractNumber: null, supplierName: null, pendencies: [] };
  expect(fiscalQueueCsv([{ item, pendencies: [], hiddenCount: 0 }], '2026-10-08')).toContain(
    '"2026-10-08";"11";"";"";"";"";"Decisão fiscal pendente no Processo 1";""');
});
