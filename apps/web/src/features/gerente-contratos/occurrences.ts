import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';

type Summary = ManagerDashboardSummaryResponse;
export type ContractOccurrence = {
  key: string;
  contractId: number;
  contractNumber: string | null;
  supplierName: string | null;
  source: 'alerta' | 'matriz';
  signal: string;
  detail: string;
};
export type Occurrences = {
  rows: ContractOccurrence[];
  alertsAvailable: boolean;
  matrixAvailable: boolean;
  state: 'scope-unavailable' | 'empty-scope' | 'sources-unavailable' | 'empty' | 'partial' | 'available';
};

export const genericEvaluation = 'Avaliar o contrato e o encaminhamento cabível';
export const genericEvaluationNote = 'Orientação genérica; ação não formalmente atribuída.';

export function contractOccurrences(summary: Summary | null, scopeUnavailable: boolean, emptyScope = false): Occurrences {
  if (!summary || scopeUnavailable) return { rows: [], alertsAvailable: false, matrixAvailable: false, state: 'scope-unavailable' };
  const alertsAvailable = summary.meta.dataCoverage.contractAlerts === 'AVAILABLE' && summary.data.contractAlerts !== null;
  const matrixAvailable = summary.meta.dataCoverage.contractRiskMatrix === 'AVAILABLE' && summary.data.contractRiskMatrix !== null;
  const matrix = matrixAvailable ? summary.data.contractRiskMatrix! : [];
  const matrixByContract = new Map(matrix.map(row => [row.contractId, row]));
  const rows: ContractOccurrence[] = [];
  if (alertsAvailable) for (const alert of summary.data.contractAlerts!) {
    const related = matrixByContract.get(alert.contractId);
    rows.push({ key: `alerta:${alert.alertId}`, contractId: alert.contractId,
      contractNumber: alert.contractNumber ?? related?.contractNumber ?? null,
      supplierName: related?.supplierName ?? null, source: 'alerta',
      signal: `Alerta ${alert.alertId}${alert.type ? ` · ${alert.type}` : ''} · ${alert.status}`,
      detail: alert.description ?? 'Descrição indisponível' });
  }
  for (const row of matrix) for (const [dimension, status] of [
    ['Saldo', row.saldo.status], ['Vigência', row.vigencia],
  ] as const) if (status === 'CRITICAL') rows.push({ key: `matriz:${row.contractId}:${dimension}`,
    contractId: row.contractId, contractNumber: row.contractNumber, supplierName: row.supplierName,
    source: 'matriz', signal: `${dimension} crítico`, detail: `Dimensão ${dimension}: Crítico` });
  rows.sort((a, b) => (a.contractNumber ?? String(a.contractId)).localeCompare(
    b.contractNumber ?? String(b.contractId), 'pt-BR', { numeric: true }) ||
    a.contractId - b.contractId || a.source.localeCompare(b.source) || a.key.localeCompare(b.key, 'pt-BR', { numeric: true }));
  const state = emptyScope ? 'empty-scope' :
    !alertsAvailable && !matrixAvailable ? 'sources-unavailable' :
      !alertsAvailable || !matrixAvailable ? 'partial' : rows.length ? 'available' : 'empty';
  return { rows, alertsAvailable, matrixAvailable, state };
}

export function occurrenceCoverage(value: Occurrences): string {
  if (value.state === 'scope-unavailable') return 'Recorte global indisponível; ocorrências não exibidas.';
  if (value.state === 'empty-scope') return 'Recorte sem contratos; nenhuma ocorrência.';
  const sources = `Alertas: ${value.alertsAvailable ? 'disponíveis' : 'indisponíveis'}. Matriz: ${value.matrixAvailable ? 'disponível' : 'indisponível'}.`;
  if (value.state === 'sources-unavailable') return `Fontes de ocorrências indisponíveis. ${sources}`;
  if (value.state === 'partial') return `Cobertura parcial das ocorrências. ${sources}`;
  return sources;
}

export function occurrenceEmptyMessage(value: Occurrences): string {
  if (value.state === 'empty-scope') return 'Recorte sem contratos; nenhuma ocorrência.';
  if (value.state === 'empty') return 'Fontes disponíveis sem ocorrências no recorte.';
  if (value.state === 'partial') return 'Nenhuma ocorrência nas fontes disponíveis; cobertura parcial.';
  return 'Ocorrências indisponíveis para este recorte.';
}
