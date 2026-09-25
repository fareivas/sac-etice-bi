import { useEffect, useState } from 'react';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse, ManagerSuppliersResponse } from '@sac-etice-bi/contracts';
import { loadManagerSummary, loadManagerFiscalLoad, loadManagerSuppliers } from '../../lib/api';

type State = { status: 'loading' } | { status: 'error'; message: string } |
  { status: 'success'; summary: ManagerDashboardSummaryResponse; load?: ManagerFiscalLoadResponse | null; suppliers?: ManagerSuppliersResponse | null; suppliersError?: string | null };
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
          <article className="fiscal-kpi"><span>Vencimento nos próximos 120 dias</span><strong>{count(summary.data.cards.renewalsWithin120Days)}</strong><small>Contratos vigentes da carteira</small></article>
        </section>
        {summary.data.cards.activeContracts === 0 && <p className="empty-contracts" role="status">Nenhum contrato vigente na carteira.</p>}
        {summary.meta.dataCoverage.activePortfolioValue === 'UNAVAILABLE' && <p className="coverage-note" role="status">Valor total indisponível: há valor contratual ausente ou a fotografia histórica não pode ser reconstruída.</p>}
        <section className="fiscal-panel"><div className="panel-heading"><h2>Fiscais e distribuição da carteira</h2><p>Contratos vigentes designados e OS com decisão fiscal pendente.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Fiscal</th><th>Contratos vigentes</th><th>OS pendentes</th><th>Capacidade</th></tr></thead><tbody>
          {state.status === 'success' && state.load?.data.inspectors?.length ? state.load.data.inspectors.map((fiscal) => <tr key={fiscal.userId}><td>{fiscal.name ?? `Fiscal ${fiscal.userId}`}</td><td>{fiscal.activeContracts}</td><td>{fiscal.pendingOrders}</td><td>Indisponível</td></tr>) : <tr><td colSpan={4} className="table-empty">{state.status === 'success' && state.load?.data.inspectors?.length === 0 ? 'Nenhum fiscal designado' : 'Indisponível'}</td></tr>}
        </tbody></table></div></section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Fornecedores da carteira</h2><p>Valor vigente dos contratos autorizados; demais indicadores sem fonte aprovada.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Valor vigente</th><th>ABC</th><th>Financeiro em aberto</th><th>Riscos críticos</th></tr></thead><tbody>
          {state.status === 'success' && state.suppliers?.data.suppliers?.length ? state.suppliers.data.suppliers.map((supplier) => <tr key={supplier.supplierId}><td>{supplier.name}</td><td>{money(supplier.vigentValue)}</td><td>Indisponível</td><td>Indisponível</td><td>Indisponível</td></tr>) : <tr><td colSpan={5} className="table-empty">{state.status === 'success' && state.suppliersError ? `Erro ao carregar fornecedores: ${state.suppliersError}` : state.status === 'success' && state.suppliers?.data.suppliers?.length === 0 ? 'Nenhum fornecedor na carteira' : 'Indisponível'}</td></tr>}
        </tbody></table></div></section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Contratos vigentes da carteira</h2><p>Dados atuais dos contratos autorizados.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Valor atual</th><th>Fim da vigência</th></tr></thead><tbody>
          {summary.data.contracts?.length ? summary.data.contracts.map((contract) => <tr key={contract.contractId}><td>{contract.contractNumber ?? `#${contract.contractId}`}</td><td>{contract.supplierName ?? 'Indisponível'}</td><td>{money(contract.value)}</td><td>{contract.expiryDate ?? 'Indisponível'}</td></tr>) : <tr><td colSpan={4} className="table-empty">{summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente'}</td></tr>}
        </tbody></table></div></section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Contratos vigentes com vencimento nos próximos 120 dias</h2><p>Inclui a data de referência e o limite de 120 dias.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Fim da vigência</th></tr></thead><tbody>
          {summary.data.expiringContractList?.length ? summary.data.expiringContractList.map((contract) => <tr key={contract.contractId}><td>{contract.contractNumber ?? `#${contract.contractId}`}</td><td>{contract.supplierName ?? 'Indisponível'}</td><td>{contract.expiryDate ?? 'Indisponível'}</td></tr>) : <tr><td colSpan={3} className="table-empty">{summary.data.expiringContractList === null ? 'Indisponível' : 'Nenhum contrato na janela'}</td></tr>}
        </tbody></table></div></section>
      </>}
    </div>
  </main>;
}
export function ManagerDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => { let active = true; Promise.all([loadManagerSummary(), loadManagerFiscalLoad().catch(() => null), loadManagerSuppliers().then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error: error instanceof Error ? error.message : 'Falha na consulta' }))]).then(([summary, load, suppliers]) => { if (active) setState({ status: 'success', summary, load, suppliers: suppliers.value, suppliersError: suppliers.error }); })
    .catch((error: unknown) => { if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha na consulta' }); });
    return () => { active = false; }; }, []);
  return <ManagerDashboardView state={state} />;
}
