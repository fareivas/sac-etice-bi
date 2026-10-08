import { useEffect, useMemo, useState } from 'react';
import type { FiscalDashboardSummaryResponse, FiscalItemBalance } from '@sac-etice-bi/contracts';
import { loadFiscalSummary } from '../../lib/api';
import { displayDate } from '../../lib/display-date';

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; summary: FiscalDashboardSummaryResponse };
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

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function sumMoney(values: (number | null)[]): number | null {
  if (values.some(value => value === null)) return null;
  const parts = values.map(value => {
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const [whole, fraction = ''] = mantissa.replace('-', '').split('.');
    const scale = Math.max(0, fraction.length - Number(exponent));
    const digits = BigInt(whole + fraction) * (value! < 0 ? -1n : 1n);
    const shift = Number(exponent) - fraction.length;
    return { digits: shift > 0 ? digits * 10n ** BigInt(shift) : digits, scale: shift > 0 ? 0 : scale };
  });
  const scale = Math.max(2, ...parts.map(part => part.scale));
  const sum = parts.reduce((total, part) => total + part.digits * 10n ** BigInt(scale - part.scale), 0n);
  const divisor = 10n ** BigInt(scale - 2);
  const cents = (sum < 0n ? -1n : 1n) * ((sum < 0n ? -sum : sum) + divisor / 2n) / divisor;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(cents) / 100;
}

function filteredAggregates(items: FiscalItemBalance[]) {
  const count = items.length;
  return {
    itemCount: count,
    contractedValueRows: items.filter(item => item.valueContracted !== null).length,
    committedBalanceRows: items.filter(item => item.valueBalance !== null).length,
    measuredBalanceRows: items.filter(item => item.valueMeasuredBalance !== null).length,
    totalContratado: sumMoney(items.map(item => item.valueContracted)),
    saldoComprometido: sumMoney(items.map(item => item.valueBalance)),
    saldoMedido: sumMoney(items.map(item => item.valueMeasuredBalance)),
  };
}

type ItemFilters = { context: string | null; supplier: string; contract: string; band: string; search: string };
const emptyFilters = (context: string | null): ItemFilters => ({ context, supplier: '', contract: '', band: '', search: '' });

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
  const itemBalances = summary?.data.itemBalances;
  // O recorte explícito da API e o fiscal identificam a carteira; data e fonte externa não a alteram.
  const context = summary ? JSON.stringify([
    summary.data.fiscal.userId,
    summary.meta.filtersApplied.unidadeId,
    [...summary.meta.filtersApplied.contratoId].sort((a, b) => a - b),
  ]) : null;
  const [storedFilters, setFilters] = useState<ItemFilters>(() => emptyFilters(null));
  const items = itemBalances?.coverage === 'AVAILABLE' ? itemBalances.itens : [];
  const suppliers = useMemo(() => [...new Set(items.map(item => item.supplierName).filter((name): name is string => name !== null))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [items]);
  const contracts = useMemo(() => [...new Map(items.map(item => [item.contractId, item.contractNumber] as const)).entries()]
    .sort((a, b) => a[0] - b[0]), [items]);
  let filters = storedFilters;
  if (context !== null && filters.context !== context) {
    filters = emptyFilters(context);
    setFilters(filters);
  } else if (itemBalances?.coverage === 'AVAILABLE') {
    const supplier = suppliers.includes(filters.supplier) ? filters.supplier : '';
    const contract = contracts.some(([id]) => String(id) === filters.contract) ? filters.contract : '';
    if (supplier !== filters.supplier || contract !== filters.contract) {
      filters = { ...filters, supplier, contract };
      setFilters(filters);
    }
  }
  const { supplier, contract, band, search } = filters;
  const setFilter = (change: Partial<ItemFilters>) => setFilters(current => ({ ...current, ...change }));
  const activeFilters = Boolean(supplier || contract || band || search.trim());
  const filteredItems = useMemo(() => {
    const query = normalize(search.trim());
    return items.filter(item =>
      (!supplier || item.supplierName === supplier) &&
      (!contract || String(item.contractId) === contract) &&
      (!band || item.faixa === band) &&
      (!query || [item.specification, item.contractNumber, item.supplierName, item.sequence === null ? null : String(item.sequence)]
        .some(value => value !== null && normalize(value).includes(query))));
  }, [items, supplier, contract, band, search]);
  const distribution = useMemo(() => ({
    adequado: filteredItems.filter(item => item.faixa === 'adequado').length,
    atencao: filteredItems.filter(item => item.faixa === 'atencao').length,
    critico: filteredItems.filter(item => item.faixa === 'critico').length,
    nao_verificavel: filteredItems.filter(item => item.faixa === 'nao_verificavel').length,
  }), [filteredItems]);
  // filter() preserva ordem, referências e multiplicidade; a comparação confirma o conjunto integral.
  const allItemsSelected = filteredItems.length === items.length && filteredItems.every((item, index) => item === items[index]);
  const aggregates = useMemo(() => filteredItems.length === 0 ? filteredAggregates([])
    : itemBalances?.coverage === 'AVAILABLE' && allItemsSelected ? itemBalances.agregados
      : filteredAggregates(filteredItems), [filteredItems, itemBalances, allItemsSelected]);
  const clearFilters = () => setFilters(emptyFilters(context));

  return <main className="fiscal-dashboard">
    <header className="fiscal-header"><div className="fiscal-header-inner">
      <div><span className="fiscal-brand">ETICE <span>•</span> SAC BI</span><h1>Dashboard do Fiscal do Contrato</h1><p>Visão da carteira sob fiscalização</p></div>
      <div className="header-meta"><span className="header-chip">{summary?.data.fiscal.name ?? (summary ? `Fiscal ${summary.data.fiscal.userId}` : 'Fiscal')}</span><span>Data de referência: {displayDate(summary?.meta.dataReference, summary?.meta.timezone)}</span></div>
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
              <td>{displayDate(alert.expiryDate, summary.meta.timezone)}</td>
            </tr>) : <tr><td colSpan={3} className="table-empty">{summary.meta.dataCoverage.contractAlerts === 'UNAVAILABLE' || summary.data.contractAlerts === null ? 'Indisponível' : 'Nenhum alerta contratual no recorte'}</td></tr>}
          </tbody></table></div>
        </Panel>
        <Panel title="Contratos fiscalizados" subtitle="Contratos vigentes da carteira autorizada atual.">
          <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Valor atual</th><th>Fim da vigência</th></tr></thead><tbody>
            {summary.data.contracts?.length ? summary.data.contracts.map(contract => <tr key={contract.contractId}>
              <td>{contract.contractNumber ?? 'Indisponível'}</td><td>{contract.supplierName ?? 'Indisponível'}</td>
              <td>{money(contract.value)}</td><td>{displayDate(contract.expiryDate, summary.meta.timezone)}</td>
            </tr>) : <tr><td colSpan={4} className="table-empty">{summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente na carteira'}</td></tr>}
          </tbody></table></div>
        </Panel>
        <div className="fiscal-grid-two">
          <Panel title="Minha fila de ação" subtitle="Ordens de serviço da carteira autorizada."><div className="fiscal-table-wrap"><table><thead><tr><th>Prior.</th><th>Contrato / empresa</th><th>Problema</th><th>Impacto</th><th>Prazo</th><th>Ação recomendada</th></tr></thead><tbody>{queue?.length ? queue.map((item, index) => <tr key={`${item.contractId ?? 'sem-contrato'}-${index}`}><td>{item.severity ?? 'Indisponível'}</td><td><b>{item.contractNumber ?? 'Indisponível'}</b><br />{item.supplierName ?? 'Indisponível'}</td><td>{item.title ?? 'Indisponível'}</td><td>Indisponível</td><td>{displayDate(item.dueAt, summary.meta.timezone)}</td><td>Indisponível</td></tr>) : <tr><td colSpan={6} className="table-empty">{queueLabel(queue ?? null)}</td></tr>}</tbody></table></div></Panel>
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
          {itemBalances?.coverage === 'AVAILABLE' ? <>
            <div className="saldo-filters" aria-label="Filtros dos saldos contratuais">
              <label>Fornecedor<select value={supplier} onChange={event => setFilter({ supplier: event.target.value })}><option value="">Todos os fornecedores</option>{suppliers.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
              <label>Contrato<select value={contract} onChange={event => setFilter({ contract: event.target.value })}><option value="">Todos os contratos</option>{contracts.map(([id, number]) => <option key={id} value={id}>{number ?? `Contrato ID ${id}`} (ID {id})</option>)}</select></label>
              <label>Faixa<select value={band} onChange={event => setFilter({ band: event.target.value })}><option value="">Todas as faixas</option><option value="adequado">Adequado</option><option value="atencao">Atenção</option><option value="critico">Crítico</option><option value="nao_verificavel">Não verificável</option></select></label>
              <label>Busca textual<input type="search" placeholder="Buscar item, contrato ou fornecedor..." value={search} onChange={event => setFilter({ search: event.target.value })} /></label>
            </div>
            <div className="saldo-filter-meta"><span role="status">{filteredItems.length} de {items.length} itens encontrados</span><button type="button" onClick={clearFilters} disabled={!activeFilters}>Limpar todos os filtros</button></div>
            <div className="saldo-summary">
              <div><span>Total contratado dos itens</span><strong>{money(aggregates.totalContratado)}</strong></div>
              <div><span>Saldo comprometido dos itens</span><strong>{money(aggregates.saldoComprometido)}</strong></div>
              <div><span>Saldo medido dos itens</span><strong>{money(aggregates.saldoMedido)}</strong></div>
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
                  <td>{item.sequence ?? '—'} · {item.specification ?? 'Sem especificação'}</td>
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
