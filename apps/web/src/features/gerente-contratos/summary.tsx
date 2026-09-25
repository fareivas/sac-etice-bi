import { useEffect, useState } from 'react';
import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { loadManagerSummary } from '../../lib/api';

type State = { status: 'loading' } | { status: 'error'; message: string } |
  { status: 'success'; summary: ManagerDashboardSummaryResponse };
const money = (value: number | null) => value === null ? 'Indisponível' :
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const count = (value: number | null) => value === null ? 'Indisponível' : String(value);
export function ManagerDashboardView({ state }: { state: State }) {
  const summary = state.status === 'success' ? state.summary : null;
  return <main className="fiscal-dashboard manager-dashboard">
    <header className="fiscal-header"><div className="fiscal-header-inner">
      <div><span className="fiscal-brand">ETICE <span>•</span> SAC BI</span><h1>Dashboard do Gerente de Contratos</h1><p>Carteira contratual sob sua gestão</p></div>
      <div className="header-meta"><span className="header-chip">{summary?.data.manager.name ?? (summary ? `Gestor ${summary.data.manager.userId}` : 'Gerente')}</span><span>Data de referência: {summary?.meta.dataReference ?? 'Indisponível'}</span></div>
    </div></header>
    <div className="fiscal-page">
      {state.status === 'loading' && <div className="fiscal-message" role="status">Carregando resumo…</div>}
      {state.status === 'error' && <div className="fiscal-message error" role="alert">Erro ao carregar o resumo: {state.message}</div>}
      {summary && <>
        <section className="fiscal-filters" aria-label="Escopo da carteira"><div><strong>Carteira autorizada</strong><span>Designações atuais do gestor</span></div><div className="filter-values"><span>Contrato: {summary.meta.filtersApplied.contratoId.length ? summary.meta.filtersApplied.contratoId.join(', ') : 'Todos'}</span></div></section>
        <section className="fiscal-kpis manager-kpis" aria-label="Indicadores">
          <article className="fiscal-kpi"><span>Contratos ativos</span><strong>{count(summary.data.cards.activeContracts)}</strong><small>Contratos vigentes na carteira atual</small></article>
          <article className="fiscal-kpi"><span>Valor atual da carteira ativa</span><strong>{money(summary.data.cards.activePortfolioValue)}</strong><small>Somente contratos vigentes</small></article>
          <article className="fiscal-kpi"><span>Próximos do vencimento</span><strong>Indisponível</strong><small>Janela de vencimento pendente de definição</small></article>
        </section>
        {summary.data.cards.activeContracts === 0 && <p className="empty-contracts" role="status">Nenhum contrato vigente na carteira.</p>}
        {summary.meta.dataCoverage.activePortfolioValue === 'UNAVAILABLE' && <p className="coverage-note" role="status">Valor total indisponível: há valor contratual ausente ou a fotografia histórica não pode ser reconstruída.</p>}
        <section className="fiscal-panel"><div className="panel-heading"><h2>Contratos vigentes da carteira</h2><p>Dados atuais dos contratos autorizados.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Valor atual</th><th>Fim da vigência</th></tr></thead><tbody>
          {summary.data.contracts?.length ? summary.data.contracts.map((contract) => <tr key={contract.contractId}><td>{contract.contractNumber ?? `#${contract.contractId}`}</td><td>{contract.supplierName ?? 'Indisponível'}</td><td>{money(contract.value)}</td><td>{contract.expiryDate ?? 'Indisponível'}</td></tr>) : <tr><td colSpan={4} className="table-empty">{summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente'}</td></tr>}
        </tbody></table></div></section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Contratos próximos do vencimento</h2><p>Aguardando definição da janela oficial.</p></div><div className="panel-unavailable" role="status">Indisponível</div></section>
      </>}
    </div>
  </main>;
}
export function ManagerDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => { let active = true; loadManagerSummary().then((summary) => { if (active) setState({ status: 'success', summary }); })
    .catch((error: unknown) => { if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha na consulta' }); });
    return () => { active = false; }; }, []);
  return <ManagerDashboardView state={state} />;
}
