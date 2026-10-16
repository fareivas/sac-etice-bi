type Reference = { meta: { dataReference: string; timezone: string } };

export const fiscalLoadReferenceError = 'A carga de fiscais retornou data de referência ou fuso diferente do resumo. Recarregue o dashboard.';
export const suppliersReferenceError = 'A consulta de fornecedores retornou data de referência ou fuso diferente do resumo. Recarregue o dashboard.';

export function sameReference(summary: Reference, auxiliary: Reference): boolean {
  return summary.meta.dataReference === auxiliary.meta.dataReference &&
    summary.meta.timezone === auxiliary.meta.timezone;
}
