import { useEffect, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { loadFiscalSummary } from '../../lib/api';

type CardKey = keyof FiscalDashboardSummaryResponse['data']['cards'];
type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; summary: FiscalDashboardSummaryResponse };

const cards: readonly { key: CardKey; label: string }[] = [
  { key: 'activeContracts', label: 'Contratos ativos' },
  { key: 'pendingServiceOrders', label: 'OS pendentes' },
  { key: 'criticalItems', label: 'Itens críticos' },
  { key: 'overdueActions', label: 'Ações vencidas' },
  { key: 'externalViolations', label: 'Violações externas' },
];

export function countLabel(value: number | null): string {
  return value === null ? 'Indisponível' : String(value);
}

export function queueLabel(queue: FiscalDashboardSummaryResponse['data']['priorityQueue']): string {
  if (queue === null) return 'Fila indisponível';
  if (queue.length === 0) return 'Fila apurada sem ocorrências';
  return `${queue.length} ocorrência${queue.length === 1 ? '' : 's'}`;
}

export function FiscalDashboardView({ state, includeExternal, onIncludeExternalChange }: {
  state: ViewState;
  includeExternal: boolean;
  onIncludeExternalChange: (value: boolean) => void;
}) {
  const summary = state.status === 'success' ? state.summary : null;
  const kpiSource = summary && 'sources' in summary.meta
    ? summary.meta.sources.find((source) => source.system === 'KPIs') : null;
  const partial = summary && Object.values(summary.meta.dataCoverage).includes('UNAVAILABLE');

  return <main className="fiscal-dashboard">
    <header className="fiscal-header">
      <p className="eyebrow">SAC ETICE BI · Protótipo local</p>
      <h1>Dashboard Fiscal</h1>
      <p>Resumo da carteira autorizada e cobertura dos indicadores.</p>
    </header>
    <label className="external-switch">
      <input type="checkbox" checked={includeExternal} onChange={(event) => onIncludeExternalChange(event.target.checked)} />
      Consultar fonte externa
    </label>
    {state.status === 'loading' && <p role="status">Carregando resumo…</p>}
    {state.status === 'error' && <p role="alert">Erro ao carregar o resumo: {state.message}</p>}
    {summary && <>
      <section className="summary-context" aria-label="Contexto do resumo">
        <p><strong>Fiscal autenticado</strong><br />{summary.data.fiscal.name ?? 'Nome indisponível'} · ID {summary.data.fiscal.userId}</p>
        <p><strong>Data de referência</strong><br />{summary.meta.dataReference}</p>
      </section>
      {partial && <p className="coverage-note" role="status">Cobertura parcial: indicadores marcados como indisponíveis não foram calculados.</p>}
      <section aria-label="Indicadores" className="indicator-grid">
        {cards.map(({ key, label }) => {
          const value = summary.data.cards[key];
          return <article key={key} className="indicator-card">
            <h2>{label}</h2>
            <p className={value === null ? 'unavailable-value' : 'indicator-value'}>{key === 'externalViolations' && !includeExternal ? 'Desabilitada' : countLabel(value)}</p>
          </article>;
        })}
      </section>
      {summary.data.cards.activeContracts === 0 && <p role="status">Nenhum contrato ativo na data de referência.</p>}
      <section className="queue-panel" aria-label="Fila de atenção">
        <h2>Fila de atenção</h2>
        <p>{queueLabel(summary.data.priorityQueue)}</p>
        {summary.data.priorityQueue?.map((item, index) => <p key={index}>{item.contractNumber ?? 'Contrato sem número'} · {item.title ?? 'Título indisponível'}</p>)}
      </section>
      <p className="source-note">Fonte KPI: {includeExternal ? (kpiSource?.status === 'UNAVAILABLE' ? 'Indisponível' : kpiSource?.status ?? 'Indisponível') : 'Consulta desabilitada'}</p>
    </>}
  </main>;
}

export function FiscalDashboard() {
  const [includeExternal, setIncludeExternal] = useState(false);
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    loadFiscalSummary(includeExternal).then((summary) => {
      if (active) setState({ status: 'success', summary });
    }).catch((reason: unknown) => {
      if (active) setState({ status: 'error', message: reason instanceof Error ? reason.message : 'Falha na consulta' });
    });
    return () => { active = false; };
  }, [includeExternal]);

  return <FiscalDashboardView state={state} includeExternal={includeExternal} onIncludeExternalChange={setIncludeExternal} />;
}
