import { fiscalOperationalOverview, initialOperationalFilters } from './operational-overview';
import { FiscalContractExpiry } from './contract-expiry';
import { FiscalContractBalanceChart } from './contract-balance-chart';
import { useEffect, useId, useRef, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { downloadFiscalQueueCsv } from './queue-csv';
import { queueContractKey, useFiscalQueueFilters } from './use-fiscal-queue-filters';
import { loadFiscalSummary } from '../../lib/api';
import { displayGeneratedAt } from './generated-at';
import { displayDate } from '../../lib/display-date';

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: FiscalDashboardSummaryResponse;
      refreshing?: boolean;
      refreshError?: string;
    };
export function countLabel(value: number | null): string {
  return value === null ? 'Indisponível' : String(value);
}

export function queueLabel(queue: FiscalDashboardSummaryResponse['data']['priorityQueue']): string {
  if (queue === null) return 'Fila indisponível';
  if (queue.length === 0) return 'Fila apurada sem ocorrências';
  return `${queue.length} ocorrência${queue.length === 1 ? '' : 's'}`;
}

const money = (value: number | null) =>
  value === null
    ? 'Indisponível'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`fiscal-panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Unavailable({ label = 'Indisponível' }: { label?: string }) {
  return (
    <div className="panel-unavailable" role="status">
      {label}
    </div>
  );
}

export function FiscalDashboardView({
  state,
  includeExternal,
  onIncludeExternalChange,
  onRefresh,
}: {
  state: ViewState;
  includeExternal: boolean;
  onIncludeExternalChange: (value: boolean) => void;
  onRefresh?: () => void;
}) {
  const queueFilterId = useId();
  const [operationalFilters, setOperationalFilters] = useState(initialOperationalFilters);
  const summary = state.status === 'success' ? state.summary : null;
  const overview = summary ? fiscalOperationalOverview(summary, operationalFilters) : null;
  const partial = summary && Object.values(summary.meta.dataCoverage).includes('UNAVAILABLE');
  const kpiSource = summary && 'sources' in summary.meta ? summary.meta.sources.find(source => source.system === 'KPIs') : null;
  const queue = summary?.data.priorityQueue;
  const queueContext = summary
    ? JSON.stringify([
        summary.data.fiscal.userId,
        summary.meta.filtersApplied.unidadeId,
        [...summary.meta.filtersApplied.contratoId].sort((a, b) => a - b),
        summary.meta.dataReference,
      ])
    : null;
  const operationalContext = useRef<string | null>(null);
  useEffect(() => {
    if (queueContext === null) return;
    if (operationalContext.current !== queueContext) setOperationalFilters(initialOperationalFilters);
    operationalContext.current = queueContext;
  }, [queueContext]);
  const queueFilters = useFiscalQueueFilters(queue, queueContext);
  return (
    <main className="fiscal-dashboard">
      <header className="fiscal-header">
        <div className="fiscal-header-inner">
          <div>
            <h1>ETICE • Dashboard do Fiscal do Contrato</h1>
            <p>Visão operacional da carteira individual de contratos</p>
          </div>
          <div className="header-meta">
            <span className="header-chip">
              {summary?.data.fiscal.name ?? (summary ? `Fiscal ${summary.data.fiscal.userId}` : 'Fiscal')}
            </span>
            <span>
              Data de referência: {displayDate(summary?.meta.dataReference, summary?.meta.timezone)}
            </span>
          </div>
        </div>
      </header>
      <div className="fiscal-page">
        <section className="fiscal-filters fiscal-overview-filters" aria-label="Filtros do dashboard">
          <div className="fiscal-overview-controls">
            <label>Contrato<select value={operationalFilters.contract} disabled={!overview?.contracts} onChange={event => setOperationalFilters(current => ({ ...current, contract: event.target.value }))}>
              <option value="">Todos os contratos</option>
              {operationalFilters.contract && !overview?.contracts?.some(row => String(row.contractId) === operationalFilters.contract) && <option value={operationalFilters.contract}>Contrato ID {operationalFilters.contract} (não disponível na resposta)</option>}
              {overview?.contracts?.map(row => <option key={row.contractId} value={row.contractId}>{row.contractNumber ? `${row.contractNumber} (ID ${row.contractId})` : `Contrato ID ${row.contractId}`}</option>)}
            </select></label>
            <label>Fornecedor<select value={operationalFilters.supplier} disabled={!overview?.contracts} onChange={event => setOperationalFilters(current => ({ ...current, supplier: event.target.value }))}>
              <option value="">Todos os fornecedores</option>
              {operationalFilters.supplier && !overview?.suppliers.includes(operationalFilters.supplier) && <option value={operationalFilters.supplier}>{operationalFilters.supplier} (não disponível na resposta)</option>}
              {overview?.suppliers.map(name => <option key={name}>{name}</option>)}
            </select></label>
            <label>Risco<select disabled aria-describedby={`${queueFilterId}-risk-note`}><option>Indisponível</option></select></label>
            <label>Janela de vencimento<select value={operationalFilters.days} disabled={!overview?.contracts} onChange={event => setOperationalFilters(current => ({ ...current, days: event.target.value }))}>
              <option value="">Todas as vigências</option>{[30, 90, 120, 180, 365].map(days => <option key={days} value={days}>Próximos {days} dias</option>)}
            </select></label>
            <label>Busca nos painéis operacionais<input type="search" placeholder="Contrato ou fornecedor" value={operationalFilters.search} disabled={!overview?.contracts} onChange={event => setOperationalFilters(current => ({ ...current, search: event.target.value }))} /></label>
          </div>
          <div className="fiscal-filter-extras">
            <details className="fiscal-filter-guidance"><summary>Recorte local dos painéis operacionais · escopo e fontes</summary>
              <p className="source-note">Recorte local dos painéis operacionais; a fila usa filtros próprios.</p>
              <p className="source-note">Recorte autorizado do fiscal · Unidade: {summary?.meta.filtersApplied.unidadeId ?? 'Todas'} · Contratos: {summary?.meta.filtersApplied.contratoId.join(', ') || 'Todos'}</p>
              <p className="source-note">Filtros acima: somente Saldos por contrato e Vigências e renovações. KPIs e saúde representam a carteira completa; a fila tem filtros próprios. Datas ausentes não entram em janelas de vencimento.</p>
              <p className="source-note" id={`${queueFilterId}-risk-note`}>Risco indisponível: sem classificação contratual aprovada na resposta fiscal.{!overview?.contracts && ' Fonte de contratos indisponível para os filtros operacionais.'}</p>
            </details>
            <label className="external-switch"><input type="checkbox" checked={includeExternal} onChange={event => onIncludeExternalChange(event.target.checked)} /> Consultar fonte externa</label>
          </div>
        </section>
        <section className="fiscal-status-strip" aria-label="Atualização, referência e cobertura">
          <div className="fiscal-refresh">
            <button
              type="button"
              onClick={onRefresh}
              disabled={state.status === 'loading' || (state.status === 'success' && state.refreshing === true)}
            >
              Atualizar dados
            </button>
            {summary && (
              <span>
                Última atualização do dashboard:{' '}
                {displayGeneratedAt(summary.meta.generatedAt, summary.meta.timezone)} ({summary.meta.timezone})
              </span>
            )}
          </div>
          {summary && <div className="fiscal-status-reference">Referência: {displayDate(summary.meta.dataReference, summary.meta.timezone)}</div>}
          {partial && <p className="coverage-note" role="status">Cobertura parcial <span className="visually-hidden">: indicadores marcados como indisponíveis não foram calculados.</span></p>}
          {summary && (
            <details className="fiscal-metadata-details"><summary>Sobre atualização e cobertura</summary>
              <p className="source-note">Horário de geração da resposta, não de atualização do banco. A data de referência é apresentada separadamente.</p>
              <p className="source-note">Fonte KPI: {includeExternal ? kpiSource?.status ?? 'Indisponível' : 'Consulta desabilitada'}</p>
              {partial && <p className="source-note">Indicadores marcados como indisponíveis não foram calculados.</p>}
            </details>
          )}
        </section>
        {state.status === 'success' && state.refreshing && (
          <p role="status">Atualizando dados… Os dados anteriores permanecem visíveis.</p>
        )}
        {state.status === 'success' && state.refreshError && (
          <p role="alert" className="fiscal-message error">
            Os dados não foram atualizados. Exibindo a última resposta recebida. {state.refreshError} Tente
            novamente em “Atualizar dados”.
          </p>
        )}
        {state.status === 'loading' && (
          <div className="fiscal-message" role="status">
            Carregando resumo…
          </div>
        )}
        {state.status === 'error' && (
          <div className="fiscal-message error" role="alert">
            Erro ao carregar o resumo: {state.message}
          </div>
        )}
        {summary && (
          <>
            <section className="fiscal-kpis" aria-label="Indicadores">
              {[
                ['Contratos sob fiscalização', summary.meta.dataCoverage.activeContracts === 'AVAILABLE' ? countLabel(summary.data.cards.activeContracts) : 'Indisponível', 'Carteira autorizada completa'],
                ['Saldo disponível', money(overview?.balanceTotal ?? null), 'Saldos contratuais completos · carteira inteira'],
                ['Vencimentos', countLabel(overview?.expiring ?? null), 'D0–120 · referência da resposta · carteira inteira'],
                ['SLA', 'Indisponível', 'Sem percentual aprovado do Projeto de KPIs'],
                ['Medições', 'Indisponível', 'Sem indicador financeiro aprovado'],
                ['Pagamentos', 'Indisponível', 'Sem indicador financeiro aprovado'],
              ].map(([label, value, detail]) => <article className="fiscal-kpi" key={label}><span>{label}</span>
                <strong className={value === 'Indisponível' ? 'unavailable-value' : ''}>{value}</strong><small>{detail}</small></article>)}
            </section>
            {summary.data.cards.activeContracts === 0 && (
              <p className="empty-contracts" role="status">
                Nenhum contrato ativo na data de referência.
              </p>
            )}
            <div className="fiscal-grid-two fiscal-executive-grid">
              <Panel
                className="fiscal-action-queue"
                title="Minha fila de ação"
                subtitle="OS com decisão fiscal pendente na carteira."
              >
                <details className="fiscal-queue-tools"><summary>Filtros, CSV e escopo da fila</summary>
                <details className="fiscal-queue-guidance"><summary>Escopo da fila e limites de interpretação</summary>
                <p className="source-note">OS cliente dos contratos autorizados, com pendência de decisão fiscal no Processo 1 aberta ou em tratamento.</p>
                <p className="source-note">
                  A inclusão nesta lista decorre da carteira contratual; não comprova tarefa atribuída
                  diretamente a você. A ordem das linhas não representa prioridade.
                </p>
                </details>
                {queue !== null && queue !== undefined && (
                  <>
                    <div
                      className="fiscal-queue-filters"
                      role="group"
                      aria-label="Filtros locais da fila fiscal"
                    >
                      <div>
                        <label htmlFor={`${queueFilterId}-contract`}>Contrato da fila</label>
                        <select
                          id={`${queueFilterId}-contract`}
                          value={queueFilters.contract}
                          onChange={(event) => queueFilters.setFilter({ contract: event.target.value })}
                        >
                          <option value="">Todos os contratos</option>
                          {queueFilters.missingContract && (
                            <option value={queueFilters.contract}>
                              Contrato ID {queueFilters.contract} (não disponível na resposta)
                            </option>
                          )}
                          {queueFilters.contracts.map(([id, number]) => (
                            <option key={queueContractKey(id)} value={queueContractKey(id)}>
                              {id === null
                                ? 'Contrato não identificado'
                                : `${number ?? 'Contrato sem número'} (ID ${id})`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${queueFilterId}-status`}>Status da pendência</label>
                        <select
                          id={`${queueFilterId}-status`}
                          value={queueFilters.status}
                          onChange={(event) =>
                            queueFilters.setFilter({
                              status: event.target.value as '' | 'aberta' | 'em_tratamento',
                            })
                          }
                        >
                          <option value="">Todos</option>
                          <option value="aberta">Aberta</option>
                          <option value="em_tratamento">Em tratamento</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${queueFilterId}-search`}>Busca na fila</label>
                        <input
                          id={`${queueFilterId}-search`}
                          type="search"
                          value={queueFilters.search}
                          placeholder="OS ID, contrato, fornecedor ou descrição"
                          onChange={(event) => queueFilters.setFilter({ search: event.target.value })}
                        />
                      </div>
                    </div>
                    {queueFilters.missingContract && (
                      <p role="status">
                        O contrato selecionado não está disponível nesta fila. O filtro foi mantido; selecione
                        outro contrato ou limpe os filtros para alterar o recorte.
                      </p>
                    )}
                  </>
                )}
                <div className="fiscal-queue-actions">
                  {queue !== null && queue !== undefined && (
                    <div className="fiscal-queue-filter-meta">
                      <span role="status">
                        {queueFilters.visible.length} de {queueFilters.totalOrders} OS
                      </span>
                      <button
                        type="button"
                        onClick={queueFilters.clearFilters}
                        disabled={!queueFilters.activeFilters}
                      >
                        Limpar filtros da fila
                      </button>
                    </div>
                  )}
                  <div className="fiscal-queue-export">
                    <button
                      type="button"
                      disabled={queue == null || !queueFilters.visible.length}
                      aria-describedby={`${queueFilterId}-export-note`}
                      onClick={() => downloadFiscalQueueCsv(queueFilters.visible, summary.meta.dataReference)}
                    >
                      Exportar CSV
                    </button>
                  </div>
                </div>
                <p id={`${queueFilterId}-export-note`} className="source-note">
                  Exporta somente o recorte visível. Cada linha representa uma pendência; uma OS pode ocupar
                  várias linhas.
                </p>
                </details>
                <div className="fiscal-table-wrap">
                  <table>
                    <caption className="visually-hidden">OS da carteira com decisão fiscal pendente</caption>
                    <thead>
                      <tr>
                        <th scope="col">OS</th>
                        <th scope="col">Severidade</th>
                        <th scope="col">Contrato / fornecedor</th>
                        <th scope="col">Motivo / descrição</th>
                        <th scope="col">Impacto</th>
                        <th scope="col">Prazo de decisão</th>
                        <th scope="col">Ação recomendada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueFilters.visible.length ? (
                        queueFilters.visible.map(({ item, pendencies, hiddenCount }) => (
                          <tr key={item.serviceOrderId} data-queue-order-id={item.serviceOrderId}>
                            <th scope="row">OS ID {item.serviceOrderId}</th>
                            <td>{item.severity ?? 'Severidade não definida'}</td>
                            <td>
                              <b>
                                {item.contractNumber ??
                                  (item.contractId === null
                                    ? 'Contrato não identificado'
                                    : `Contrato ID ${item.contractId}`)}
                              </b>
                              <br />
                              {item.supplierName ?? 'Fornecedor não identificado na fila'}
                            </td>
                            <td>
                              <details className="fiscal-order-details"><summary>{pendencies.length} {pendencies.length === 1 ? 'pendência de decisão fiscal' : 'pendências de decisão fiscal'}</summary>
                              {item.title !== null && <p className="fiscal-order-title">{item.title}</p>}
                              <ul>
                                {pendencies.map((pendency) => (
                                  <li key={pendency.pendencyId}>
                                    {pendency.description?.trim() ? pendency.description : 'Decisão fiscal pendente no Processo 1'}
                                    {pendency.description !== null && !pendency.description.trim() && <span className="fiscal-original-empty" aria-label="Descrição original sem conteúdo textual">{pendency.description}</span>}
                                    <small className="fiscal-queue-pendency-status">
                                      Status: {pendency.status === 'aberta' ? 'Aberta' : 'Em tratamento'}
                                    </small>
                                  </li>
                                ))}
                              </ul>
                              </details>
                              {hiddenCount > 0 && (
                                <small className="fiscal-queue-hidden">
                                  {hiddenCount}{' '}
                                  {hiddenCount === 1 ? 'pendência oculta' : 'pendências ocultas'} pelos
                                  filtros
                                </small>
                              )}
                            </td>
                            <td>Impacto não apurado</td>
                            <td>
                              {item.dueAt === null
                                ? 'Prazo de decisão não disponível'
                                : displayDate(item.dueAt, summary.meta.timezone)}
                            </td>
                            <td>Recomendação não definida para esta OS</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="table-empty">
                            {queue === null || queue === undefined
                              ? queueLabel(null)
                              : queue.length === 0
                                ? queueLabel([])
                                : 'Nenhuma OS encontrada com os filtros atuais.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <details className="fiscal-queue-guidance"><summary>Severidade, impacto, prazo e ações</summary>
                <p className="source-note">
                  Não há fonte aprovada de severidade, impacto ou prazo de decisão para estas OS. Valor e
                  saldo do contrato não medem impacto; competência e vigência não são prazo para decidir.
                </p>
                <p className="source-note">
                  A resposta da fila não fornece ação recomendada. As decisões são registradas no SAC; este
                  dashboard apenas apresenta a lista e não executa ações no sistema oficial.
                </p></details>
              </Panel>
              <Panel className="fiscal-health" title="Saúde da carteira" subtitle="Dimensões da carteira autorizada completa; sem índice consolidado.">
                {['Saldo', 'Vigência', 'SLA', 'Medições', 'Pagamento'].map(label => <div className="fiscal-health-row" key={label}>
                  <span>{label}</span><div className="fiscal-health-track" aria-hidden="true" /><strong>Indisponível</strong></div>)}
                <div className="fiscal-model-alert fiscal-model-warn fiscal-health-index"><b>Índice de Saúde da Carteira: Indisponível</b><br /><span className="source-note">Sem índice consolidado aprovado.</span></div>
                <details className="fiscal-executive-note"><summary>Como interpretar saúde e cobertura</summary><p className="source-note">Não há percentuais de saúde aprovados para estas dimensões. Saldo por contrato e vencimentos factuais estão nos painéis abaixo; não equivalem a um índice de saúde.</p></details>
              </Panel>
            </div>
            <div className="fiscal-operational-grid">
              <Panel title="Saldos por contrato" subtitle="Recorte dos filtros superiores; percentuais recebidos, sem classificação de risco." className="fiscal-operational-balances">
                {overview?.balances === null || !overview ? <Unavailable /> : overview.balances.length ? <FiscalContractBalanceChart balances={overview.balances} /> : <p className="source-note">Nenhum saldo contratual no recorte operacional.</p>}

              </Panel>
              <Panel title="Vigências e renovações" subtitle="Vencimentos e alertas factuais no recorte operacional." className="fiscal-operational-expiry">
                {overview?.selected === null || !overview ? <Unavailable /> : !overview.selected.length ? <p className="source-note">Nenhum contrato no recorte operacional.</p> :
                  <div className="fiscal-operational-list">{overview.selected.map(row => <div key={row.contractId}><b>{row.contractNumber ?? `Contrato ID ${row.contractId}`}</b>
                    <FiscalContractExpiry expiryDate={row.expiryDate} reference={summary.meta.dataReference} timezone={summary.meta.timezone} />
                  </div>)}</div>}
                <h3>Alertas contratuais</h3>
                {overview?.alerts === null || !overview ? <Unavailable label="Alertas indisponíveis" /> : !overview.alerts.length ? <p className="source-note">Nenhum alerta contratual no recorte operacional.</p> :
                  <ul className="fiscal-operational-alerts">{overview.alerts.map(row => <li key={row.alertId} data-contract-alert-id={row.alertId}>
                    <strong>Alerta contratual</strong>
                    <dl className="fiscal-alert-fields">
                      <div><dt>Contrato</dt><dd>{row.contractNumber ?? `Contrato ID ${row.contractId}`}</dd></div>
                      <div><dt>Vencimento informado no alerta</dt><dd>{displayDate(row.expiryDate, summary.meta.timezone)}</dd></div>
                    </dl>
                    <details className="fiscal-alert-description"><summary>Descrição original do SAC · alerta {row.alertId}</summary>
                      <p>{row.description ?? 'Descrição indisponível'}</p>
                    </details>
                  </li>)}</ul>}
                <p className="source-note">Renovações efetivamente identificadas: Indisponível.</p>
                <details className="fiscal-executive-note"><summary>Como interpretar vigências e alertas</summary><p className="source-note">Alertas e vencimentos não comprovam processo ou decisão de renovação. Dias em relação à data de referência.</p></details>
              </Panel>
              <Panel title="Pagamento e medição" subtitle="Etapas financeiras da carteira." className="fiscal-operational-payment">
                {['Pagamento', 'Medições'].map((label, index) => <div className={`fiscal-model-alert ${index === 1 ? 'fiscal-model-warn' : ''}`} key={label}><b>{label}: Indisponível</b><br /><span className="source-note">Sem valores ou pendências financeiras aprovados.</span></div>)}
                <details className="fiscal-executive-note"><summary>Fonte financeira e cobertura</summary><p className="source-note">Sem fonte aprovada de documentos, etapas, valores ou prazos financeiros na resposta atual.</p></details>
              </Panel>
            </div>
            <Panel className="fiscal-financial-cycle" title="Ciclo financeiro do contrato" subtitle="Cliente → ETICE → fornecedor. Valores, status e tempos dependem de fonte aprovada.">
              <div className="fiscal-model-payflow" tabIndex={0} role="region" aria-label="Sete etapas do ciclo financeiro">
                {['Medição cliente', 'Faturamento', 'Recebimento cliente', 'Medição fornecedor', 'Processo de pagamento', 'Programação', 'Pago fornecedor'].map((label, index) => <div className="fiscal-model-phase" key={label}>
                  <b>{index + 1}. {label}</b><span>Status: Indisponível</span><strong>Indisponível</strong><span>Tempo: Indisponível</span>
                </div>)}
              </div>
              <div className="fiscal-model-metrics">{['Recebido de clientes', 'Pago a fornecedores', 'Recebido ainda não pago', 'Tempo médio do ciclo', 'Maior gargalo atual'].map(label => <div key={label}><small>{label}</small><b>Indisponível</b></div>)}</div>
              <div className="fiscal-model-alert fiscal-model-warn"><b>Ação: Indisponível</b><br /><span className="source-note">A resposta atual não fornece etapas, valores ou tempos do ciclo financeiro nem recomendação aprovada.</span></div>
            </Panel>
            <Panel
              title="Relevância Econômica das Partes do Contrato"
              subtitle="Indisponível: não há classificação corporativa verificável de fornecedores e clientes na resposta atual."
            >
              <div className="fiscal-grid-two relevance">
                <div className="fiscal-model-alert fiscal-model-info"><b>Fornecedores · Indisponível</b><br /><span>Sem classificação corporativa verificável de pagamentos.</span></div>
                <div className="fiscal-model-alert fiscal-model-info"><b>Clientes · Indisponível</b><br /><span>Sem classificação corporativa verificável de recebimentos.</span></div>
              </div>
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}

export function FiscalDashboard() {
  const [includeExternal, setIncludeExternal] = useState(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const inFlight = useRef(true);
  const requestId = useRef(0);
  const beginLoading = () =>
    setState((previous) =>
      previous.status === 'success'
        ? { status: 'success', summary: previous.summary, refreshing: true }
        : { status: 'loading' }
    );
  useEffect(() => {
    let active = true;
    const id = ++requestId.current;
    inFlight.current = true;
    beginLoading();
    loadFiscalSummary(includeExternal)
      .then((summary) => {
        if (active && id === requestId.current) setState({ status: 'success', summary });
      })
      .catch((reason: unknown) => {
        if (!active || id !== requestId.current) return;
        const message = reason instanceof Error ? reason.message : 'Falha na consulta';
        setState((previous) =>
          previous.status === 'success'
            ? { status: 'success', summary: previous.summary, refreshError: message }
            : { status: 'error', message }
        );
      })
      .finally(() => {
        if (active && id === requestId.current) inFlight.current = false;
      });
    return () => {
      active = false;
    };
  }, [includeExternal, revision]);
  const refresh = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    beginLoading();
    setRevision((value) => value + 1);
  };
  const changeExternal = (value: boolean) => {
    if (value === includeExternal) return;
    ++requestId.current;
    inFlight.current = true;
    beginLoading();
    setIncludeExternal(value);
  };
  return (
    <FiscalDashboardView
      state={state}
      includeExternal={includeExternal}
      onIncludeExternalChange={changeExternal}
      onRefresh={refresh}
    />
  );
}
