import { useEffect, useId, useRef, useState } from 'react';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { FiscalContractExpiry, FiscalExpiryReferenceNote } from './contract-expiry';
import { FiscalItemBalanceDetails } from './item-balance-details';
import { downloadFiscalItemsCsv } from './item-balances-csv';
import { downloadFiscalQueueCsv } from './queue-csv';
import { queueContractKey, useFiscalQueueFilters } from './use-fiscal-queue-filters';
import { useItemBalanceFilters } from '../item-balances/use-item-balance-filters';
import { loadFiscalSummary } from '../../lib/api';
import { displayGeneratedAt } from './generated-at';
import { displayDate } from '../../lib/display-date';

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; summary: FiscalDashboardSummaryResponse; refreshing?: boolean; refreshError?: string };
type CardKey = keyof FiscalDashboardSummaryResponse['data']['cards'];

const cards: readonly { key: CardKey; label: string; detail: string }[] = [
  { key: 'activeContracts', label: 'Contratos sob fiscalização', detail: 'Carteira atribuída' },
  { key: 'pendingServiceOrders', label: 'OS pendentes', detail: 'Fluxo operacional' },
  { key: 'criticalItems', label: 'Itens críticos (legado)', detail: 'Indicador contratual com regra própria' },
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

export function FiscalDashboardView({ state, includeExternal, onIncludeExternalChange, onRefresh }: {
  state: ViewState;
  includeExternal: boolean;
  onIncludeExternalChange: (value: boolean) => void;
  onRefresh?: () => void;
}) {
  const queueFilterId = useId();
  const summary = state.status === 'success' ? state.summary : null;
  const partial = summary && Object.values(summary.meta.dataCoverage).includes('UNAVAILABLE');
  const kpiSource = summary && 'sources' in summary.meta
    ? summary.meta.sources.find((source) => source.system === 'KPIs') : null;
  const queue = summary?.data.priorityQueue;
  const itemBalances = summary?.data.itemBalances;
  // O recorte explícito da API e o fiscal identificam a carteira; data e fonte externa não a alteram.
  const context = summary ? JSON.stringify([
    summary.data.fiscal.userId,
    summary.meta.filtersApplied.unidadeId,
    [...summary.meta.filtersApplied.contratoId].sort((a, b) => a - b),
  ]) : null;
  const { items, suppliers, contracts, missingSupplier, missingContract, supplier, contract, band, search, setFilter, activeFilters,
    filteredItems, distribution, aggregates, allItemsSelected, clearFilters } = useItemBalanceFilters(itemBalances, context, true);
  const queueContext = summary ? JSON.stringify([
    summary.data.fiscal.userId, summary.meta.filtersApplied.unidadeId,
    [...summary.meta.filtersApplied.contratoId].sort((a, b) => a - b), summary.meta.dataReference,
  ]) : null;
  const queueFilters = useFiscalQueueFilters(queue, queueContext);
  const noRegisteredItems = itemBalances?.coverage === 'AVAILABLE' && items.length === 0;
  const itemTotalLabel = (value: number | null) => noRegisteredItems ? 'Sem itens cadastrados' : money(value);

  return <main className="fiscal-dashboard">
    <header className="fiscal-header"><div className="fiscal-header-inner">
      <div><span className="fiscal-brand">ETICE <span>•</span> SAC BI</span><h1>Dashboard do Fiscal do Contrato</h1><p>Visão da carteira sob fiscalização</p></div>
      <div className="header-meta"><span className="header-chip">{summary?.data.fiscal.name ?? (summary ? `Fiscal ${summary.data.fiscal.userId}` : 'Fiscal')}</span><span>Data de referência: {displayDate(summary?.meta.dataReference, summary?.meta.timezone)}</span></div>
    </div></header>
    <div className="fiscal-page">
      <section className="fiscal-filters" aria-label="Filtros do dashboard"><div><strong>Filtros da carteira</strong><span>Recorte autorizado do fiscal</span></div><div className="filter-values"><span>Unidade: {summary?.meta.filtersApplied.unidadeId ?? 'Todas'}</span><span>Contrato: {summary?.meta.filtersApplied.contratoId.length ? summary.meta.filtersApplied.contratoId.join(', ') : 'Todos'}</span><label className="external-switch"><input type="checkbox" checked={includeExternal} onChange={(event) => onIncludeExternalChange(event.target.checked)} /> Consultar fonte externa</label></div></section>
      <div className="fiscal-refresh">
        <button type="button" onClick={onRefresh} disabled={state.status === 'loading' || (state.status === 'success' && state.refreshing === true)}>Atualizar dados</button>
        {summary && <span>Última atualização do dashboard: {displayGeneratedAt(summary.meta.generatedAt, summary.meta.timezone)} ({summary.meta.timezone})</span>}
      </div>
      {summary && <p className="source-note">Horário de geração da resposta, não de atualização do banco. A data de referência é apresentada separadamente.</p>}
      {state.status === 'success' && state.refreshing && <p role="status">Atualizando dados… Os dados anteriores permanecem visíveis.</p>}
      {state.status === 'success' && state.refreshError && <p role="alert" className="fiscal-message error">Os dados não foram atualizados. Exibindo a última resposta recebida. {state.refreshError} Tente novamente em “Atualizar dados”.</p>}
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
              <td><FiscalContractExpiry expiryDate={alert.expiryDate} reference={summary.meta.dataReference} timezone={summary.meta.timezone} /></td>
            </tr>) : <tr><td colSpan={3} className="table-empty">{summary.meta.dataCoverage.contractAlerts === 'UNAVAILABLE' || summary.data.contractAlerts === null ? 'Indisponível' : 'Nenhum alerta contratual no recorte'}</td></tr>}
          </tbody></table></div>
          <FiscalExpiryReferenceNote reference={summary.meta.dataReference} />
        </Panel>
        <Panel title="Contratos fiscalizados" subtitle="Contratos vigentes da carteira autorizada atual.">
          <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Valor atual</th><th>Fim da vigência</th></tr></thead><tbody>
            {summary.data.contracts?.length ? summary.data.contracts.map(contract => <tr key={contract.contractId}>
              <td>{contract.contractNumber ?? 'Indisponível'}</td><td>{contract.supplierName ?? 'Indisponível'}</td>
              <td>{money(contract.value)}</td><td><FiscalContractExpiry expiryDate={contract.expiryDate} reference={summary.meta.dataReference} timezone={summary.meta.timezone} /></td>
            </tr>) : <tr><td colSpan={4} className="table-empty">{summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente na carteira'}</td></tr>}
          </tbody></table></div>
          <FiscalExpiryReferenceNote reference={summary.meta.dataReference} />
        </Panel>
        <div className="fiscal-grid-two">
          <Panel className="fiscal-action-queue" title="OS com decisão fiscal pendente na carteira" subtitle="OS cliente dos contratos autorizados, com pendência de decisão fiscal no Processo 1 aberta ou em tratamento.">
            <p className="source-note">A inclusão nesta lista decorre da carteira contratual; não comprova tarefa atribuída diretamente a você. A ordem das linhas não representa prioridade.</p>
            {queue !== null && queue !== undefined && <>
              <div className="fiscal-queue-filters" role="group" aria-label="Filtros locais da fila fiscal">
                <div><label htmlFor={`${queueFilterId}-contract`}>Contrato da fila</label><select id={`${queueFilterId}-contract`} value={queueFilters.contract} onChange={event => queueFilters.setFilter({ contract: event.target.value })}>
                  <option value="">Todos os contratos</option>{queueFilters.missingContract && <option value={queueFilters.contract}>Contrato ID {queueFilters.contract} (não disponível na resposta)</option>}{queueFilters.contracts.map(([id, number]) => <option key={queueContractKey(id)} value={queueContractKey(id)}>
                    {id === null ? 'Contrato não identificado' : `${number ?? 'Contrato sem número'} (ID ${id})`}
                  </option>)}
                </select></div>
                <div><label htmlFor={`${queueFilterId}-status`}>Status da pendência</label><select id={`${queueFilterId}-status`} value={queueFilters.status} onChange={event => queueFilters.setFilter({ status: event.target.value as '' | 'aberta' | 'em_tratamento' })}>
                  <option value="">Todos</option><option value="aberta">Aberta</option><option value="em_tratamento">Em tratamento</option>
                </select></div>
                <div><label htmlFor={`${queueFilterId}-search`}>Busca na fila</label><input id={`${queueFilterId}-search`} type="search" value={queueFilters.search} placeholder="OS ID, contrato, fornecedor ou descrição"
                  onChange={event => queueFilters.setFilter({ search: event.target.value })} /></div>
              </div>
              {queueFilters.missingContract && <p role="status">O contrato selecionado não está disponível nesta fila. O filtro foi mantido; selecione outro contrato ou limpe os filtros para alterar o recorte.</p>}
              <div className="fiscal-queue-filter-meta"><span role="status">{queueFilters.visible.length} de {queueFilters.totalOrders} OS</span>
                <button type="button" onClick={queueFilters.clearFilters} disabled={!queueFilters.activeFilters}>Limpar filtros da fila</button>
              </div>
            </>}
            <div className="fiscal-queue-export">
              <button type="button" disabled={queue == null || !queueFilters.visible.length}
                aria-describedby={`${queueFilterId}-export-note`}
                onClick={() => downloadFiscalQueueCsv(queueFilters.visible, summary.meta.dataReference)}>Exportar CSV</button>
              <p id={`${queueFilterId}-export-note`} className="source-note">Exporta somente o recorte visível. Cada linha representa uma pendência; uma OS pode ocupar várias linhas.</p>
            </div>
            <div className="fiscal-table-wrap"><table><caption className="visually-hidden">OS da carteira com decisão fiscal pendente</caption><thead><tr>
              <th scope="col">OS</th><th scope="col">Severidade</th><th scope="col">Contrato / fornecedor</th><th scope="col">Motivo / descrição</th><th scope="col">Impacto</th><th scope="col">Prazo de decisão</th><th scope="col">Ação recomendada</th>
            </tr></thead><tbody>{queueFilters.visible.length ? queueFilters.visible.map(({ item, pendencies, hiddenCount }) => <tr key={item.serviceOrderId}>
              <th scope="row">OS ID {item.serviceOrderId}</th>
              <td>{item.severity ?? 'Severidade não definida'}</td>
              <td><b>{item.contractNumber ?? (item.contractId === null ? 'Contrato não identificado' : `Contrato ID ${item.contractId}`)}</b><br />{item.supplierName ?? 'Fornecedor não identificado na fila'}</td>
              <td><ul>{pendencies.map(pendency => <li key={pendency.pendencyId}>
                {pendency.description?.trim() || 'Decisão fiscal pendente no Processo 1'}
                <small className="fiscal-queue-pendency-status">Status: {pendency.status === 'aberta' ? 'Aberta' : 'Em tratamento'}</small>
              </li>)}</ul>{hiddenCount > 0 && <small className="fiscal-queue-hidden">{hiddenCount} {hiddenCount === 1 ? 'pendência oculta' : 'pendências ocultas'} pelos filtros</small>}</td>
              <td>Impacto não apurado</td>
              <td>{item.dueAt === null ? 'Prazo de decisão não disponível' : displayDate(item.dueAt, summary.meta.timezone)}</td>
              <td>Recomendação não definida para esta OS</td>
            </tr>) : <tr><td colSpan={7} className="table-empty">{queue === null || queue === undefined ? queueLabel(null) : queue.length === 0 ? queueLabel([]) : 'Nenhuma OS encontrada com os filtros atuais.'}</td></tr>}</tbody></table></div>
            <p className="source-note">Não há fonte aprovada de severidade, impacto ou prazo de decisão para estas OS. Valor e saldo do contrato não medem impacto; competência e vigência não são prazo para decidir.</p>
            <p className="source-note">A resposta da fila não fornece ação recomendada. As decisões são registradas no SAC; este dashboard apenas apresenta a lista e não executa ações no sistema oficial.</p>
          </Panel>
          <Panel title="Saúde da carteira" subtitle="Indicadores operacionais da carteira."><Unavailable /></Panel>
        </div>
        <div className="fiscal-grid-two">
          <Panel title="Saldo consolidado por contrato" subtitle="Percentual financeiro ainda disponível. Carteira autorizada completa; filtros locais de itens não se aplicam.">
            <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Valor contratado</th><th>Valor consumido</th><th>Saldo</th><th>% saldo</th></tr></thead><tbody>
              {summary.data.contractBalances?.length ? summary.data.contractBalances.map(balance => <tr key={balance.contractId}>
                <td>{balance.contractNumber ?? 'Indisponível'}</td><td>{money(balance.contractedValue)}</td>
                <td>{money(balance.consumedValue)}</td><td>{money(balance.balanceValue)}</td><td>{percentage(balance.balancePct)}</td>
              </tr>) : <tr><td colSpan={5} className="table-empty">{summary.data.contractBalances === null ? 'Indisponível' : 'Nenhum contrato vigente na carteira'}</td></tr>}
            </tbody></table></div>
          </Panel>
          <Panel title="Distribuição dos itens por faixa" subtitle="Classificação dos saldos contratuais.">{itemBalances?.coverage === 'AVAILABLE'
            ? <p>Adequado: {distribution.adequado} · Atenção: {distribution.atencao} · Crítico: {distribution.critico} · Não verificável: {distribution.nao_verificavel}</p>
            : <Unavailable />}</Panel>
        </div>
        <Panel title="Gestão dos Saldos dos Itens Contratuais" subtitle="Total contratado, execução acumulada, saldo e ação do fiscal." className="fiscal-saldos">
          <div className="fiscal-items-export">
            <button type="button" disabled={itemBalances?.coverage !== 'AVAILABLE' || filteredItems.length === 0}
              aria-describedby={`${queueFilterId}-items-export-note`}
              onClick={() => { if (itemBalances?.coverage === 'AVAILABLE') downloadFiscalItemsCsv(filteredItems, summary.meta.dataReference, itemBalances.criterio); }}>Exportar itens CSV</button>
            <p className="source-note" id={`${queueFilterId}-items-export-note`}>Uma linha por item visível após os filtros locais. A exportação dos itens não representa o saldo consolidado por contrato.</p>
          </div>
          {itemBalances?.coverage === 'AVAILABLE' ? <>
            <div className="saldo-filters" aria-label="Filtros dos saldos contratuais">
              <label>Fornecedor<select value={supplier} onChange={event => setFilter({ supplier: event.target.value })}><option value="">Todos os fornecedores</option>{missingSupplier && <option value={supplier}>{supplier} (não disponível na resposta)</option>}{suppliers.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
              <label>Contrato<select value={contract} onChange={event => setFilter({ contract: event.target.value })}><option value="">Todos os contratos</option>{missingContract && <option value={contract}>Contrato ID {contract} (não disponível na resposta)</option>}{contracts.map(([id, number]) => <option key={id} value={id}>{number ?? `Contrato ID ${id}`} (ID {id})</option>)}</select></label>
              <label>Faixa<select value={band} onChange={event => setFilter({ band: event.target.value })}><option value="">Todas as faixas</option><option value="adequado">Adequado</option><option value="atencao">Atenção</option><option value="critico">Crítico</option><option value="nao_verificavel">Não verificável</option></select></label>
              <label>Busca textual<input type="search" placeholder="Buscar item, contrato ou fornecedor..." value={search} onChange={event => setFilter({ search: event.target.value })} /></label>
            </div>
            {(missingSupplier || missingContract) && <p role="status">Há opções selecionadas que não estão disponíveis nesta resposta. Os filtros foram mantidos; escolha outras opções ou limpe os filtros para alterar o recorte.</p>}
            <div className="saldo-filter-meta"><span role="status">{filteredItems.length} de {items.length} itens encontrados</span><button type="button" onClick={clearFilters} disabled={!activeFilters}>Limpar todos os filtros</button></div>
            {noRegisteredItems
              ? <p className="source-note" role="status">Não há dados de itens cadastrados na carteira para avaliar o saldo. O saldo consolidado por contrato é apresentado separadamente.</p>
              : filteredItems.length === 0 && <p className="source-note" role="status">Os totais dos itens representam um recorte sem resultados. Ajuste ou limpe os filtros para avaliar os itens cadastrados na carteira.</p>}
            <div className="saldo-summary">
              <div><span>Total contratado dos itens</span><strong>{itemTotalLabel(aggregates.totalContratado)}</strong></div>
              <div><span>Saldo comprometido dos itens</span><strong>{itemTotalLabel(aggregates.saldoComprometido)}</strong></div>
              <div><span>Saldo medido dos itens</span><strong>{itemTotalLabel(aggregates.saldoMedido)}</strong></div>
              <div><span>Itens críticos</span><strong>{distribution.critico}</strong></div>
              <div><span>Não verificáveis</span><strong>{distribution.nao_verificavel}</strong></div>
            </div>
            {aggregates.contractedValueRows < filteredItems.length && <p role="status">Total contratado incompleto: {aggregates.contractedValueRows} de {filteredItems.length} itens cobertos.</p>}
            {aggregates.committedBalanceRows < filteredItems.length && <p role="status">Saldo comprometido incompleto: {aggregates.committedBalanceRows} de {filteredItems.length} itens cobertos.</p>}
            {aggregates.measuredBalanceRows < filteredItems.length && <p role="status">Saldo medido incompleto: {aggregates.measuredBalanceRows} de {filteredItems.length} itens cobertos.</p>}
            {!allItemsSelected && aggregates.contractedValueRows === filteredItems.length && aggregates.totalContratado === null && <p role="status">Total contratado indisponível por limite de precisão.</p>}
            {!allItemsSelected && aggregates.committedBalanceRows === filteredItems.length && aggregates.saldoComprometido === null && <p role="status">Saldo comprometido indisponível por limite de precisão.</p>}
            {!allItemsSelected && aggregates.measuredBalanceRows === filteredItems.length && aggregates.saldoMedido === null && <p role="status">Saldo medido indisponível por limite de precisão.</p>}
            <p>Faixa por {itemBalances.criterio.dimensao}, base {itemBalances.criterio.base}: adequado ≥ {percentage(itemBalances.criterio.limiar_atencao * 100)}; crítico ≤ {percentage(itemBalances.criterio.limiar_critico * 100)}; atenção entre esses limites. Limiares provisórios.</p>
            <div className="fiscal-table-wrap"><table><thead><tr><th>Faixa / verificação</th><th>Contrato / fornecedor</th><th>Item contratual</th><th>Total</th><th>Executado</th><th>Saldo</th><th>% saldo</th><th>Orientação ao fiscal</th></tr></thead><tbody>
              {filteredItems.length ? filteredItems.map(item => {
                const quantity = itemBalances.criterio.dimensao === 'quantidade';
                const total = quantity ? item.quantityContracted : item.valueContracted;
                const measuredBase = itemBalances.criterio.base === 'medido';
                const executed = quantity ? (measuredBase ? total === null ? null : item.quantityMeasured ?? 0 : item.quantityConsumed)
                  : (measuredBase ? total === null ? null : item.valueMeasured ?? 0 : item.valueConsumed);
                const balance = measuredBase ? (quantity ? item.quantityMeasuredBalance : item.valueMeasuredBalance)
                  : (quantity ? item.quantityBalance : item.valueBalance);
                const format = quantity ? (value: number | null) => value === null ? 'Não calculável' : `${value} ${item.unit ?? ''}` : money;
                return <tr key={item.itemId}><td>{item.faixa}{item.statusVerificacao && <> <small>Verificação: {item.statusVerificacao}</small></>}{item.blockedAt && <small> Bloqueado: {item.blockReason ?? 'motivo indisponível'}</small>}</td>
                  <td>{item.contractNumber ?? 'Contrato sem número'}<br />{item.supplierName ?? 'Fornecedor indisponível'}</td>
                  <td>{item.sequence ?? '—'} · {item.specification ?? 'Sem especificação'}
                    <FiscalItemBalanceDetails item={item} criteria={itemBalances.criterio} />
                  </td>
                  <td>{format(total)}</td><td>{format(executed)}</td>
                  <td>{format(balance)}{balance !== null && balance < 0 && <strong> · Saldo negativo</strong>}</td>
                  <td>{percentage((itemBalances.criterio.base === 'medido' ? item.pctSaldoMedido : item.pctSaldo) === null ? null : (itemBalances.criterio.base === 'medido' ? item.pctSaldoMedido! : item.pctSaldo!) * 100)}</td>
                  <td>{item.faixa === 'critico' ? 'Avaliar o saldo e o planejamento do item.' : item.faixa === 'nao_verificavel' ? 'Conferir dados do item.' : item.faixa === 'atencao' ? 'Acompanhar o consumo do item.' : 'Acompanhar normalmente.'}</td></tr>;
              }) : <tr><td colSpan={8} className="table-empty">{items.length ? 'Nenhum item encontrado com os filtros atuais.' : 'Nenhum item contratual cadastrado na carteira.'}</td></tr>}
            </tbody></table></div>
          </> : <Unavailable label="Fonte de saldos por item indisponível para esta data." />}
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
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const inFlight = useRef(true);
  const requestId = useRef(0);
  const beginLoading = () => setState(previous => previous.status === 'success'
    ? { status: 'success', summary: previous.summary, refreshing: true } : { status: 'loading' });
  useEffect(() => {
    let active = true;
    const id = ++requestId.current;
    inFlight.current = true;
    beginLoading();
    loadFiscalSummary(includeExternal).then(summary => {
      if (active && id === requestId.current) setState({ status: 'success', summary });
    }).catch((reason: unknown) => {
      if (!active || id !== requestId.current) return;
      const message = reason instanceof Error ? reason.message : 'Falha na consulta';
      setState(previous => previous.status === 'success'
        ? { status: 'success', summary: previous.summary, refreshError: message }
        : { status: 'error', message });
    }).finally(() => {
      if (active && id === requestId.current) inFlight.current = false;
    });
    return () => { active = false; };
  }, [includeExternal, revision]);
  const refresh = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    beginLoading();
    setRevision(value => value + 1);
  };
  const changeExternal = (value: boolean) => {
    if (value === includeExternal) return;
    ++requestId.current;
    inFlight.current = true;
    beginLoading();
    setIncludeExternal(value);
  };
  return <FiscalDashboardView state={state} includeExternal={includeExternal} onIncludeExternalChange={changeExternal} onRefresh={refresh} />;
}
