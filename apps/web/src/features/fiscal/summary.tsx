import { useEffect, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { loadFiscalSummary } from '../../lib/api';

const labels = {
  activeContracts: 'Contratos ativos',
  pendingServiceOrders: 'OS pendentes',
  criticalItems: 'Itens críticos',
  overdueActions: 'Ações vencidas',
  externalViolations: 'Violações externas',
} as const;

export function countLabel(value: number | null): string {
  return value === null ? 'Indisponível' : String(value);
}

export function queueLabel(queue: FiscalDashboardSummaryResponse['data']['priorityQueue']): string {
  if (queue === null) return 'Fila indisponível';
  if (queue.length === 0) return 'Nenhuma ocorrência após consulta válida';
  return `${queue.length} ocorrência${queue.length === 1 ? '' : 's'}`;
}

export function FiscalDashboard() {
  const [includeExternal, setIncludeExternal] = useState(false);
  const [summary, setSummary] = useState<FiscalDashboardSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadFiscalSummary(includeExternal).then((value) => {
      if (active) { setSummary(value); setError(null); }
    }).catch((reason: unknown) => {
      if (active) { setSummary(null); setError(reason instanceof Error ? reason.message : 'Falha na consulta'); }
    });
    return () => { active = false; };
  }, [includeExternal]);

  return <main>
    <h1>Dashboard Fiscal</h1>
    <label><input type="checkbox" checked={includeExternal} onChange={(event) => setIncludeExternal(event.target.checked)} /> Consultar fonte externa</label>
    {error && <p role="alert">{error}</p>}
    {!error && !summary && <p>Carregando resumo…</p>}
    {summary && <>
      <p>Fiscal: {summary.data.fiscal.name ?? 'Nome indisponível'} (ID {summary.data.fiscal.userId})</p>
      <p>Referência: {summary.meta.dataReference}</p>
      <section aria-label="Indicadores">
        {Object.entries(labels).map(([key, label]) => <article key={key}>
          <h2>{label}</h2>
          <p>{countLabel(summary.data.cards[key as keyof typeof labels])}</p>
        </article>)}
      </section>
      <section><h2>Fila de atenção</h2><p>{queueLabel(summary.data.priorityQueue)}</p>
        {summary.data.priorityQueue?.map((item, index) => <p key={index}>{item.contractNumber ?? 'Contrato sem número'} — {item.title ?? 'Título indisponível'}</p>)}
      </section>
      <p>Fonte KPI: {includeExternal ? ('sources' in summary.meta ? summary.meta.sources.find((source) => source.system === 'KPIs')?.status ?? 'Indisponível' : 'Indisponível') : 'Consulta desabilitada'}</p>
    </>}
  </main>;
}
