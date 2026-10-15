import { fiscalOperationalOverview, initialOperationalFilters } from './operational-overview';
import { FiscalContractExpiry } from './contract-expiry';
import { FiscalContractBalanceChart } from './contract-balance-chart';
import { BandDistribution } from '../item-balances/band-distribution';
import { useEffect, useId, useRef, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { FiscalItemBalanceDetails } from './item-balance-details';
import { downloadFiscalItemsCsv } from './item-balances-csv';
import { downloadFiscalQueueCsv } from './queue-csv';
import { queueContractKey, useFiscalQueueFilters } from './use-fiscal-queue-filters';
import {
  displayedItemBalance,
  displayedItemRatio,
  itemSortLabels,
  useItemBalanceSort,
  type ItemSortKey,
  type ItemSortDirection,
} from './use-item-balance-sort';
import { useItemPagination, type ItemPageSize } from './use-item-pagination';
import { useItemBalanceFilters } from '../item-balances/use-item-balance-filters';
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
type CardKey = keyof FiscalDashboardSummaryResponse['data']['cards'];

const cards: readonly { key: CardKey; label: string; detail: string }[] = [
  { key: 'activeContracts', label: 'Contratos sob fiscalização', detail: 'Carteira atribuída' },
  { key: 'pendingServiceOrders', label: 'OS pendentes', detail: 'Fluxo operacional' },
  {
    key: 'criticalItems',
    label: 'Itens críticos (legado)',
    detail: 'Indicador contratual com regra própria',
  },
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

const money = (value: number | null) =>
  value === null
    ? 'Indisponível'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const percentage = (value: number | null) =>
  value === null
    ? 'Indisponível'
    : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;

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
  const kpiSource =
    summary && 'sources' in summary.meta
      ? summary.meta.sources.find((source) => source.system === 'KPIs')
      : null;
  const queue = summary?.data.priorityQueue;
  const itemBalances = summary?.data.itemBalances;
  // O recorte explícito da API e o fiscal identificam a carteira; data e fonte externa não a alteram.
  const context = summary
    ? JSON.stringify([
        summary.data.fiscal.userId,
        summary.meta.filtersApplied.unidadeId,
        [...summary.meta.filtersApplied.contratoId].sort((a, b) => a - b),
      ])
    : null;
  const {
    items,
    suppliers,
    contracts,
    missingSupplier,
    missingContract,
    supplier,
    contract,
    band,
    search,
    setFilter,
    activeFilters,
    filteredItems,
    distribution,
    distributionBeforeBand,
    aggregates,
    allItemsSelected,
    clearFilters,
  } = useItemBalanceFilters(itemBalances, context, true);
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
  const itemSort = useItemBalanceSort(filteredItems, itemBalances, queueContext);
  const pagination = useItemPagination(
    itemSort.orderedItems,
    itemBalances?.coverage === 'AVAILABLE',
    queueContext,
    JSON.stringify([supplier, contract, band, search, itemSort.key, itemSort.direction])
  );
  const noRegisteredItems = itemBalances?.coverage === 'AVAILABLE' && items.length === 0;
  const itemTotalLabel = (value: number | null) =>
    noRegisteredItems ? 'Sem itens cadastrados' : money(value);

  return (
    <main className="fiscal-dashboard">
      <header className="fiscal-header">
        <div className="fiscal-header-inner">
          <div>
            <span className="fiscal-brand">
              ETICE <span>•</span> SAC BI
            </span>
            <h1>Dashboard do Fiscal do Contrato</h1>
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
          <p className="source-note">Recorte local dos painéis operacionais; fila e itens usam filtros próprios.</p>
          <details className="fiscal-filter-guidance"><summary>Escopo dos filtros e fontes disponíveis</summary>
            <p className="source-note">Filtros acima: somente Saldos por contrato e Vigências e renovações. KPIs e saúde representam a carteira completa; fila e itens têm filtros próprios. Datas ausentes não entram em janelas de vencimento.</p>
            <p className="source-note" id={`${queueFilterId}-risk-note`}>Risco indisponível: sem classificação contratual aprovada na resposta fiscal.{!overview?.contracts && ' Fonte de contratos indisponível para os filtros operacionais.'}</p>
          </details>
          <div className="fiscal-overview-scope"><span>Recorte autorizado do fiscal · Unidade: {summary?.meta.filtersApplied.unidadeId ?? 'Todas'} · Contratos: {summary?.meta.filtersApplied.contratoId.join(', ') || 'Todos'}</span>
            <label className="external-switch"><input type="checkbox" checked={includeExternal} onChange={event => onIncludeExternalChange(event.target.checked)} /> Consultar fonte externa</label></div>
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
          {partial && <p className="coverage-note" role="status">Cobertura parcial: indicadores marcados como indisponíveis não foram calculados.</p>}
          {summary && (
            <p className="source-note">
              Horário de geração da resposta, não de atualização do banco. A data de referência é apresentada
              separadamente.
            </p>
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
                          <tr key={item.serviceOrderId}>
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
                              <ul>
                                {pendencies.map((pendency) => (
                                  <li key={pendency.pendencyId}>
                                    {pendency.description?.trim() || 'Decisão fiscal pendente no Processo 1'}
                                    <small className="fiscal-queue-pendency-status">
                                      Status: {pendency.status === 'aberta' ? 'Aberta' : 'Em tratamento'}
                                    </small>
                                  </li>
                                ))}
                              </ul>
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
                <p className="source-note">Não há percentuais de saúde aprovados para estas dimensões. Saldo por contrato e vencimentos factuais estão nos painéis abaixo; não equivalem a um índice de saúde.</p>
              </Panel>
            </div>
            <div className="fiscal-operational-grid">
              <Panel title="Saldos por contrato" subtitle="Recorte dos filtros superiores; percentuais recebidos, sem classificação de risco." className="fiscal-operational-balances">
                {overview?.balances === null || !overview ? <Unavailable /> : overview.balances.length ? <FiscalContractBalanceChart balances={overview.balances} /> : <p className="source-note">Nenhum saldo contratual no recorte operacional.</p>}
                <a href={`#${queueFilterId}-balances`}>Consultar valores completos na tabela inferior</a>
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
                <p className="source-note">Renovações efetivamente identificadas: Indisponível. Alertas e vencimentos não comprovam processo ou decisão de renovação. Dias em relação à data de referência.</p>
              </Panel>
              <Panel title="Pagamento e medição" subtitle="Etapas financeiras da carteira." className="fiscal-operational-payment">
                {['Medições', 'Pagamento em processamento', 'Pagamento realizado'].map(label => <div className="fiscal-payment-stage" key={label}><span>{label}</span><strong>Indisponível</strong></div>)}
                <p className="source-note">Sem fonte aprovada de documentos, etapas, valores ou prazos financeiros na resposta atual.</p>
              </Panel>
            </div>
            <Panel title="Ciclo financeiro do contrato" subtitle="Cliente → ETICE → fornecedor.">
              <Unavailable label="Indisponível: a resposta atual não fornece etapas, valores ou tempos do ciclo financeiro." />
            </Panel>
            <Panel
              title="Relevância Econômica das Partes do Contrato / ABC"
              subtitle="Indisponível: não há classificação corporativa verificável de fornecedores e clientes na resposta atual."
            >
              <div className="fiscal-grid-two relevance">
                <div>
                  Fornecedores <strong>Indisponível</strong>
                </div>
                <div>
                  Clientes <strong>Indisponível</strong>
                </div>
              </div>
            </Panel>
            <details className="fiscal-operational-indicators"><summary>Indicadores operacionais complementares · carteira completa</summary>
              <div className="fiscal-legacy-kpis">{cards.filter(card => card.key !== 'activeContracts').map(({ key, label, detail }) => <article key={key}><span>{label}</span><strong className={summary.data.cards[key] === null ? 'unavailable-value' : ''}>{key === 'externalViolations' && !includeExternal ? 'Consulta desabilitada' : key !== 'externalViolations' && summary.meta.dataCoverage[key] !== 'AVAILABLE' ? 'Indisponível' : countLabel(summary.data.cards[key])}</strong><small>{detail}</small></article>)}
                <article><span>Alertas contratuais</span><strong>{summary.meta.dataCoverage.contractAlerts === 'AVAILABLE' && summary.data.contractAlerts !== null ? summary.data.contractAlerts.length : 'Indisponível'}</strong><small>Pendências abertas de vigência</small></article>
              </div>
            </details>
            <div className="fiscal-grid-two fiscal-balances-grid">
              <Panel
                title="Saldo consolidado por contrato"
                subtitle="Carteira autorizada completa; filtros locais de itens não se aplicam."
                className="fiscal-contract-balances"
              >
                <span id={`${queueFilterId}-balances`} />
                <div className="fiscal-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Valor contratado</th>
                        <th>Valor consumido</th>
                        <th>Saldo</th>
                        <th>% saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.data.contractBalances?.length ? (
                        summary.data.contractBalances.map((balance) => (
                          <tr key={balance.contractId}>
                            <td>{balance.contractNumber ?? 'Indisponível'}</td>
                            <td>{money(balance.contractedValue)}</td>
                            <td>{money(balance.consumedValue)}</td>
                            <td>{money(balance.balanceValue)}</td>
                            <td>{percentage(balance.balancePct)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            {summary.data.contractBalances === null
                              ? 'Indisponível'
                              : 'Nenhum contrato vigente na carteira'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel
                title="Distribuição dos itens por faixa"
                className="fiscal-band-distribution"
              >
                {itemBalances?.coverage === 'AVAILABLE' ? (
                  <>
                    <BandDistribution
                      distribution={distributionBeforeBand}
                      available={true}
                      hasItems={!noRegisteredItems}
                      title="Distribuição dos itens por faixa"
                      scope="Contagens considerando fornecedor, contrato e busca, antes da faixa e da paginação."
                      captionId={`${queueFilterId}-band-scope`}
                      instructions="Selecione uma faixa para filtrar; clique novamente na faixa selecionada para remover somente esse filtro."
                    />
                    <div className="fiscal-band-buttons">
                      {(
                        [
                          ['adequado', 'Adequado'],
                          ['atencao', 'Atenção'],
                          ['critico', 'Crítico'],
                          ['nao_verificavel', 'Não verificável'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          data-band={value}
                          aria-pressed={band === value}
                          aria-describedby={`${queueFilterId}-band-scope`}
                          disabled={noRegisteredItems}
                          onClick={() => setFilter({ band: band === value ? '' : value })}
                        >
                          <span>
                            {label}: {distributionBeforeBand[value]}
                          </span>
                          {band === value && <strong>✓ Selecionada</strong>}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <Unavailable />
                )}
              </Panel>
            </div>
            <Panel
              title="Gestão dos Saldos dos Itens Contratuais"
              subtitle="Total contratado, execução acumulada, saldo e ação do fiscal."
              className="fiscal-saldos"
            >
              <div className="fiscal-items-export">
                <button
                  type="button"
                  disabled={itemBalances?.coverage !== 'AVAILABLE' || filteredItems.length === 0}
                  aria-describedby={`${queueFilterId}-items-export-note`}
                  onClick={() => {
                    if (itemBalances?.coverage === 'AVAILABLE')
                      downloadFiscalItemsCsv(
                        itemSort.orderedItems,
                        summary.meta.dataReference,
                        itemBalances.criterio
                      );
                  }}
                >
                  Exportar itens CSV
                </button>
                <p className="source-note" id={`${queueFilterId}-items-export-note`}>
                  Exporta todos os itens filtrados na ordem escolhida, não apenas a página atual. Uma linha
                  por item; não representa o saldo consolidado por contrato.
                </p>
              </div>
              {itemBalances?.coverage === 'AVAILABLE' ? (
                <>
                  <div className="saldo-filters" aria-label="Filtros dos saldos contratuais">
                    <label>
                      Fornecedor
                      <select
                        value={supplier}
                        onChange={(event) => setFilter({ supplier: event.target.value })}
                      >
                        <option value="">Todos os fornecedores</option>
                        {missingSupplier && (
                          <option value={supplier}>{supplier} (não disponível na resposta)</option>
                        )}
                        {suppliers.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Contrato
                      <select
                        value={contract}
                        onChange={(event) => setFilter({ contract: event.target.value })}
                      >
                        <option value="">Todos os contratos</option>
                        {missingContract && (
                          <option value={contract}>
                            Contrato ID {contract} (não disponível na resposta)
                          </option>
                        )}
                        {contracts.map(([id, number]) => (
                          <option key={id} value={id}>
                            {number ?? `Contrato ID ${id}`} (ID {id})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Faixa
                      <select value={band} onChange={(event) => setFilter({ band: event.target.value })}>
                        <option value="">Todas as faixas</option>
                        <option value="adequado">Adequado</option>
                        <option value="atencao">Atenção</option>
                        <option value="critico">Crítico</option>
                        <option value="nao_verificavel">Não verificável</option>
                      </select>
                    </label>
                    <label>
                      Busca textual
                      <input
                        type="search"
                        placeholder="Buscar item, contrato ou fornecedor..."
                        value={search}
                        onChange={(event) => setFilter({ search: event.target.value })}
                      />
                    </label>
                  </div>
                  {(missingSupplier || missingContract) && (
                    <p role="status">
                      Há opções selecionadas que não estão disponíveis nesta resposta. Os filtros foram
                      mantidos; escolha outras opções ou limpe os filtros para alterar o recorte.
                    </p>
                  )}
                  <div className="saldo-filter-meta">
                    <span role="status">
                      {filteredItems.length} de {items.length} itens encontrados
                    </span>
                    <button type="button" onClick={clearFilters} disabled={!activeFilters}>
                      Limpar todos os filtros
                    </button>
                  </div>
                  {noRegisteredItems ? (
                    <p className="source-note" role="status">
                      Não há dados de itens cadastrados na carteira para avaliar o saldo. O saldo consolidado
                      por contrato é apresentado separadamente.
                    </p>
                  ) : (
                    filteredItems.length === 0 && (
                      <p className="source-note" role="status">
                        Os totais dos itens representam um recorte sem resultados. Ajuste ou limpe os filtros
                        para avaliar os itens cadastrados na carteira.
                      </p>
                    )
                  )}
                  <div className="saldo-summary">
                    <div>
                      <span>Total contratado dos itens</span>
                      <strong>{itemTotalLabel(aggregates.totalContratado)}</strong>
                    </div>
                    <div>
                      <span>Saldo comprometido dos itens</span>
                      <strong>{itemTotalLabel(aggregates.saldoComprometido)}</strong>
                    </div>
                    <div>
                      <span>Saldo medido dos itens</span>
                      <strong>{itemTotalLabel(aggregates.saldoMedido)}</strong>
                    </div>
                    <div>
                      <span>Itens críticos</span>
                      <strong>{distribution.critico}</strong>
                    </div>
                    <div>
                      <span>Não verificáveis</span>
                      <strong>{distribution.nao_verificavel}</strong>
                    </div>
                  </div>
                  {aggregates.contractedValueRows < filteredItems.length && (
                    <p role="status">
                      Total contratado incompleto: {aggregates.contractedValueRows} de {filteredItems.length}{' '}
                      itens cobertos.
                    </p>
                  )}
                  {aggregates.committedBalanceRows < filteredItems.length && (
                    <p role="status">
                      Saldo comprometido incompleto: {aggregates.committedBalanceRows} de{' '}
                      {filteredItems.length} itens cobertos.
                    </p>
                  )}
                  {aggregates.measuredBalanceRows < filteredItems.length && (
                    <p role="status">
                      Saldo medido incompleto: {aggregates.measuredBalanceRows} de {filteredItems.length}{' '}
                      itens cobertos.
                    </p>
                  )}
                  {!allItemsSelected &&
                    aggregates.contractedValueRows === filteredItems.length &&
                    aggregates.totalContratado === null && (
                      <p role="status">Total contratado indisponível por limite de precisão.</p>
                    )}
                  {!allItemsSelected &&
                    aggregates.committedBalanceRows === filteredItems.length &&
                    aggregates.saldoComprometido === null && (
                      <p role="status">Saldo comprometido indisponível por limite de precisão.</p>
                    )}
                  {!allItemsSelected &&
                    aggregates.measuredBalanceRows === filteredItems.length &&
                    aggregates.saldoMedido === null && (
                      <p role="status">Saldo medido indisponível por limite de precisão.</p>
                    )}
                  <p>
                    Faixa por {itemBalances.criterio.dimensao}, base {itemBalances.criterio.base}: adequado ≥{' '}
                    {percentage(itemBalances.criterio.limiar_atencao * 100)}; crítico ≤{' '}
                    {percentage(itemBalances.criterio.limiar_critico * 100)}; atenção entre esses limites.
                    Limiares provisórios.
                  </p>
                  <div className="fiscal-item-sort" role="group" aria-label="Ordenação local dos itens">
                    <div>
                      <label htmlFor={`${queueFilterId}-item-sort`}>Ordenar itens por</label>
                      <select
                        id={`${queueFilterId}-item-sort`}
                        value={itemSort.key}
                        onChange={(event) => itemSort.setSort({ key: event.target.value as ItemSortKey })}
                      >
                        {Object.entries(itemSortLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${queueFilterId}-item-direction`}>Direção da ordenação</label>
                      <select
                        id={`${queueFilterId}-item-direction`}
                        value={itemSort.direction}
                        disabled={itemSort.key === 'source'}
                        onChange={(event) =>
                          itemSort.setSort({ direction: event.target.value as ItemSortDirection })
                        }
                      >
                        <option value="asc">Crescente</option>
                        <option value="desc">Decrescente</option>
                      </select>
                    </div>
                  </div>
                  <p role="status" className="fiscal-item-sort-note">
                    Ordenação: {itemSortLabels[itemSort.key]}
                    {itemSort.key !== 'source' &&
                      ` — ${itemSort.direction === 'asc' ? 'crescente' : 'decrescente'}`}
                    . Valores ausentes ficam no final; empates de saldo ou percentual usam IDs de
                    contrato/item em ordem crescente.
                  </p>
                  <nav className="fiscal-item-pagination" aria-label="Paginação local dos itens">
                    <div>
                      <label htmlFor={`${queueFilterId}-item-page-size`}>Itens por página</label>
                      <select
                        id={`${queueFilterId}-item-page-size`}
                        value={pagination.size}
                        onChange={(event) => pagination.setSize(Number(event.target.value) as ItemPageSize)}
                      >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                      </select>
                    </div>
                    <span role="status">
                      Exibindo {pagination.from}–{pagination.to} de {pagination.total} itens filtrados ·
                      Página {pagination.total ? pagination.page : 0} de {pagination.pageCount}
                    </span>
                    <div className="fiscal-item-page-buttons">
                      <button
                        type="button"
                        onClick={pagination.previous}
                        disabled={pagination.total === 0 || pagination.page <= 1}
                      >
                        Página anterior
                      </button>
                      <button
                        type="button"
                        onClick={pagination.next}
                        disabled={pagination.total === 0 || pagination.page >= pagination.pageCount}
                      >
                        Próxima página
                      </button>
                    </div>
                  </nav>
                  <div className="fiscal-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Contrato / fornecedor</th>
                          <th>Item contratual</th>
                          <th>Total</th>
                          <th>Executado</th>
                          <th>Saldo</th>
                          <th>% saldo</th>
                          <th>Ação do fiscal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageItems.length ? (
                          pagination.pageItems.map((item) => {
                            const quantity = itemBalances.criterio.dimensao === 'quantidade';
                            const total = quantity ? item.quantityContracted : item.valueContracted;
                            const measuredBase = itemBalances.criterio.base === 'medido';
                            const executed = quantity
                              ? measuredBase
                                ? total === null
                                  ? null
                                  : (item.quantityMeasured ?? 0)
                                : item.quantityConsumed
                              : measuredBase
                                ? total === null
                                  ? null
                                  : (item.valueMeasured ?? 0)
                                : item.valueConsumed;
                            const balance = displayedItemBalance(item, itemBalances.criterio);
                            const ratio = displayedItemRatio(item, itemBalances.criterio);
                            const format = quantity
                              ? (value: number | null) =>
                                  value === null ? 'Não calculável' : `${value} ${item.unit ?? ''}`
                              : money;
                            return (
                              <tr key={`${item.contractId}:${item.itemId}`}>
                                <td>
                                  {item.faixa}
                                  {item.statusVerificacao && (
                                    <>
                                      {' '}
                                      <small>Verificação: {item.statusVerificacao}</small>
                                    </>
                                  )}
                                  {item.blockedAt && (
                                    <small> Bloqueado: {item.blockReason ?? 'motivo indisponível'}</small>
                                  )}
                                </td>
                                <td>
                                  {item.contractNumber ?? 'Contrato sem número'}
                                  <br />
                                  {item.supplierName ?? 'Fornecedor indisponível'}
                                </td>
                                <td>
                                  {item.sequence ?? '—'} · {item.specification ?? 'Sem especificação'}
                                  <FiscalItemBalanceDetails item={item} criteria={itemBalances.criterio} />
                                </td>
                                <td>{format(total)}</td>
                                <td>{format(executed)}</td>
                                <td>
                                  {format(balance)}
                                  {balance !== null && balance < 0 && <strong> · Saldo negativo</strong>}
                                </td>
                                <td>{percentage(ratio === null ? null : ratio * 100)}</td>
                                <td>
                                  Indisponível — sem ação individual aprovada
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="table-empty">
                              {items.length
                                ? 'Nenhum item encontrado com os filtros atuais.'
                                : 'Nenhum item contratual cadastrado na carteira.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <Unavailable label="Fonte de saldos por item indisponível para esta data." />
              )}
            </Panel>
            </>
            <p className="source-note">
              Fonte KPI:{' '}
              {includeExternal
                ? kpiSource?.status === 'UNAVAILABLE'
                  ? 'Indisponível'
                  : (kpiSource?.status ?? 'Indisponível')
                : 'Consulta desabilitada'}
            </p>
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
