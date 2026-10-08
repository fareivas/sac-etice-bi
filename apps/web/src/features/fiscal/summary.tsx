import { useEffect, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { loadFiscalSummary } from '../../lib/api';

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; summary: FiscalDashboardSummaryResponse };
type CardKey = keyof FiscalDashboardSummaryResponse['data']['cards'];

const cards: readonly { key: CardKey; label: string; detail: string }[] = [
  { key: 'activeContracts', label: 'Contratos sob fiscalização', detail: 'Carteira atribuída' },
  { key: 'pendingServiceOrders', label: 'OS pendentes', detail: 'Fluxo operacional' },
  { key: 'criticalItems', label: 'Itens críticos', detail: 'Saldo contratual' },
  { key: 'overdueActions', label: 'Ações vencidas', detail: 'Planos de ação' },
  { key: 'externalViolations', label: 'Violações de SLA', detail: 'Projeto de KPIs' },
];

export function countLabel(value: number | null): string {
  return value === null ? 'Indisponível' : String(value);
}

export function queueLabel(queue: FiscalDashboardSummaryResponse['data']['priorityQueue']): string {
  if (queue === null) return 'Fila indisponível';
  if (queue.length === 0) return 'Fila apurada sem ocorrências';
  return `${queue.length} ocorrência${queue.length === 1 ? '' : 's'}`;
}

const money = (value: number | null) => value === null ? 'Indisponível' :
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const percentage = (value: number | null) => value === null ? 'Indisponível' :
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <section className={`fiscal-panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</section>;
}

function Unavailable({ label = 'Indisponível' }: { label?: string }) {
  return <div className="panel-unavailable" role="status">{label}</div>;
}

export function FiscalDashboardView({ state, includeExternal, onIncludeExternalChange }: {
  state: ViewState;
  includeExternal: boolean;
  onIncludeExternalChange: (value: boolean) => void;
}) {
  const summary = state.status === 'success' ? state.summary : null;
  const partial = summary && Object.values(summary.meta.dataCoverage).includes('UNAVAILABLE');
  const kpiSource = summary && 'sources' in summary.meta
    ? summary.meta.sources.find((source) => source.system === 'KPIs') : null;
  const queue = summary?.data.priorityQueue;

  return <main className="fiscal-dashboard">
    <header className="fiscal-header"><div className="fiscal-header-inner">
      <div><span className="fiscal-brand">ETICE <span>•</span> SAC BI</span><h1>Dashboard do Fiscal do Contrato</h1><p>Visão da carteira sob fiscalização</p></div>
      <div className="header-meta"><span className="header-chip">{summary?.data.fiscal.name ?? (summary ? `Fiscal ${summary.data.fiscal.userId}` : 'Fiscal')}</span><span>Data de referência: {summary?.meta.dataReference ?? 'Indisponível'}</span></div>
    </div></header>
    <div className="fiscal-page">
      <section className="fiscal-filters" aria-label="Filtros do dashboard"><div><strong>Filtros da carteira</strong><span>Recorte autorizado do fiscal</span></div><div className="filter-values"><span>Unidade: {summary?.meta.filtersApplied.unidadeId ?? 'Todas'}</span><span>Contrato: {summary?.meta.filtersApplied.contratoId.length ? summary.meta.filtersApplied.contratoId.join(', ') : 'Todos'}</span><label className="external-switch"><input type="checkbox" checked={includeExternal} onChange={(event) => onIncludeExternalChange(event.target.checked)} /> Consultar fonte externa</label></div></section>
      {state.status === 'loading' && <div className="fiscal-message" role="status">Carregando resumo…</div>}
      {state.status === 'error' && <div className="fiscal-message error" role="alert">Erro ao carregar o resumo: {state.message}</div>}
      {summary && <>
        {partial && <p className="coverage-note" role="status">Cobertura parcial: indicadores marcados como indisponíveis não foram calculados.</p>}
        <section className="fiscal-kpis" aria-label="Indicadores">
          {cards.map(({ key, label, detail }) => {
            const value = summary.data.cards[key];
            const display = key === 'externalViolations' && !includeExternal ? 'Consulta desabilitada' : countLabel(value);
            return <article className="fiscal-kpi" key={key}><span>{label}</span><strong className={value === null ? 'unavailable-value' : ''}>{display}</strong><small>{detail}</small></article>;
          })}
        </section>
        {summary.data.cards.activeContracts === 0 && <p className="empty-contracts" role="status">Nenhum contrato ativo na data de referência.</p>}
        <Panel title="Alertas contratuais" subtitle="Pendências abertas de vigência dos contratos da carteira.">
          <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Descrição</th><th>Vencimento do contrato</th></tr></thead><tbody>
            {summary.meta.dataCoverage.contractAlerts === 'AVAILABLE' && summary.data.contractAlerts?.length ? summary.data.contractAlerts.map(alert => <tr key={alert.alertId}>
              <td>{alert.contractNumber ?? 'Indisponível'}</td><td>{alert.description ?? 'Indisponível'}</td>
              <td>{alert.expiryDate ?? 'Indisponível'}</td>
            </tr>) : <tr><td colSpan={3} className="table-empty">{summary.meta.dataCoverage.contractAlerts === 'UNAVAILABLE' || summary.data.contractAlerts === null ? 'Indisponível' : 'Nenhum alerta contratual no recorte'}</td></tr>}
          </tbody></table></div>
        </Panel>
        <Panel title="Contratos fiscalizados" subtitle="Contratos vigentes da carteira autorizada atual.">
          <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Valor atual</th><th>Fim da vigência</th></tr></thead><tbody>
            {summary.data.contracts?.length ? summary.data.contracts.map(contract => <tr key={contract.contractId}>
              <td>{contract.contractNumber ?? 'Indisponível'}</td><td>{contract.supplierName ?? 'Indisponível'}</td>
              <td>{money(contract.value)}</td><td>{contract.expiryDate ?? 'Indisponível'}</td>
            </tr>) : <tr><td colSpan={4} className="table-empty">{summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente na carteira'}</td></tr>}
          </tbody></table></div>
        </Panel>
        <div className="fiscal-grid-two">
          <Panel title="Minha fila de ação" subtitle="Ordens de serviço da carteira autorizada."><div className="fiscal-table-wrap"><table><thead><tr><th>Prior.</th><th>Contrato / empresa</th><th>Problema</th><th>Impacto</th><th>Prazo</th><th>Ação recomendada</th></tr></thead><tbody>{queue?.length ? queue.map((item, index) => <tr key={`${item.contractId ?? 'sem-contrato'}-${index}`}><td>{item.severity ?? 'Indisponível'}</td><td><b>{item.contractNumber ?? 'Indisponível'}</b><br />{item.supplierName ?? 'Indisponível'}</td><td>{item.title ?? 'Indisponível'}</td><td>Indisponível</td><td>{item.dueAt ?? 'Indisponível'}</td><td>Indisponível</td></tr>) : <tr><td colSpan={6} className="table-empty">{queueLabel(queue ?? null)}</td></tr>}</tbody></table></div></Panel>
          <Panel title="Saúde da carteira" subtitle="Indicadores operacionais da carteira."><Unavailable /></Panel>
        </div>
        <div className="fiscal-grid-two">
          <Panel title="Saldo consolidado por contrato" subtitle="Percentual financeiro ainda disponível.">
            <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Valor contratado</th><th>Valor consumido</th><th>Saldo</th><th>% saldo</th></tr></thead><tbody>
              {summary.data.contractBalances?.length ? summary.data.contractBalances.map(balance => <tr key={balance.contractId}>
                <td>{balance.contractNumber ?? 'Indisponível'}</td><td>{money(balance.contractedValue)}</td>
                <td>{money(balance.consumedValue)}</td><td>{money(balance.balanceValue)}</td><td>{percentage(balance.balancePct)}</td>
              </tr>) : <tr><td colSpan={5} className="table-empty">{summary.data.contractBalances === null ? 'Indisponível' : 'Nenhum contrato vigente na carteira'}</td></tr>}
            </tbody></table></div>
          </Panel>
          <Panel title="Distribuição dos itens por faixa" subtitle="Classificação dos saldos contratuais."><Unavailable /></Panel>
        </div>
        <Panel title="Gestão dos Saldos dos Itens Contratuais" subtitle="Total contratado, execução acumulada, saldo e ação do fiscal." className="fiscal-saldos">
          <div className="saldo-summary">{['Total contratado', 'Saldo disponível', 'Saldo consolidado', 'Itens críticos'].map((label) => <div key={label}><span>{label}</span><strong>{label === 'Itens críticos' ? countLabel(summary.data.cards.criticalItems) : 'Indisponível'}</strong></div>)}</div>
          <div className="fiscal-table-wrap"><table><thead><tr><th>Status</th><th>Contrato / fornecedor</th><th>Item contratual</th><th>Total</th><th>Executado</th><th>Saldo</th><th>% saldo</th><th>Ação do fiscal</th></tr></thead><tbody><tr><td colSpan={8} className="table-empty">Indisponível</td></tr></tbody></table></div>
        </Panel>
        <Panel title="Ciclo financeiro do contrato" subtitle="Cliente → ETICE → fornecedor."><Unavailable /></Panel>
        <Panel title="Relevância econômica das partes"><div className="fiscal-grid-two relevance"><div>Fornecedores <strong>Indisponível</strong></div><div>Clientes <strong>Indisponível</strong></div></div></Panel>
        <p className="source-note">Fonte KPI: {includeExternal ? kpiSource?.status === 'UNAVAILABLE' ? 'Indisponível' : kpiSource?.status ?? 'Indisponível' : 'Consulta desabilitada'}</p>
      </>}
    </div>
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
