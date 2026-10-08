import { useEffect, useState } from 'react';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse, ManagerSuppliersResponse } from '@sac-etice-bi/contracts';
import { loadManagerSummary, loadManagerFiscalLoad, loadManagerSuppliers } from '../../lib/api';
import { displayDate } from '../../lib/display-date';
import { useItemBalanceFilters } from '../item-balances/use-item-balance-filters';

type State = { status: 'loading' } | { status: 'error'; message: string } |
  { status: 'success'; summary: ManagerDashboardSummaryResponse; load?: ManagerFiscalLoadResponse | null;
    loadError?: string | null; suppliers?: ManagerSuppliersResponse | null; suppliersError?: string | null };
const money = (value: number | null) => value === null ? 'Indisponível' :
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const count = (value: number | null) => value === null ? 'Indisponível' : String(value);
const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const percentage = (value: number | null) => value === null ? 'Indisponível' : `${money(value)}%`;

export function PortfolioFinancialChart({ balances }: { balances: NonNullable<ManagerDashboardSummaryResponse['data']['contractBalances']> }) {
  const values = balances.flatMap(item => [item.contractedValue, item.consumedValue, item.balanceValue]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const scale = (value: number) => 200 + (value - min) / (max - min || 1) * 360;
  const origin = scale(0);
  const series = [
    { key: 'contractedValue', label: 'Contratado', opacity: 1 },
    { key: 'consumedValue', label: 'Consumido', opacity: 0.65 },
    { key: 'balanceValue', label: 'Saldo', opacity: 0.35 },
  ] as const;
  return <div className="fiscal-table-wrap"><svg style={{ minWidth: 640, display: 'block' }} viewBox={`0 0 800 ${balances.length * 110 + 30}`} width="100%" role="img" aria-label="Distribuição financeira por contrato">
    <title>Distribuição financeira por contrato: contratado, consumido e saldo em reais</title>
    {balances.map((item, index) => <g key={item.contractId}>
      <text x="8" y={index * 110 + 20} fontSize="14">{item.contractNumber ?? `#${item.contractId}`}</text>
      {series.map((entry, row) => {
        const value = item[entry.key];
        const y = index * 110 + row * 28 + 30;
        return <g key={entry.key}><title>{`${entry.label}: ${currency(value)}`}</title>
          <text x="8" y={y + 15} fontSize="12">{entry.label}</text>
          <rect x={Math.min(origin, scale(value))} y={y} width={Math.abs(scale(value) - origin)} height="18" fill="currentColor" opacity={entry.opacity} />
          <text x="575" y={y + 15} fontSize="12">{currency(value)}</text>
        </g>;
      })}
    </g>)}
  </svg></div>;
}

type Inspector = NonNullable<ManagerFiscalLoadResponse['data']['inspectors']>[number];
const inspectorName = (inspector: Inspector) => inspector.name ?? `Fiscal ${inspector.userId}`;
function orderedInspectors(inspectors: readonly Inspector[]): Inspector[] {
  return [...inspectors].sort((a, b) => b.activeContracts - a.activeContracts ||
    inspectorName(a).localeCompare(inspectorName(b), 'pt-BR') || a.userId - b.userId);
}

export function FiscalLoadChart({ inspectors }: { inspectors: readonly Inspector[] }) {
  const max = Math.max(0, ...inspectors.flatMap(inspector => [inspector.activeContracts, inspector.pendingOrders]));
  const barWidth = (value: number) => max === 0 ? 0 : value / max * 450;
  return <div className="fiscal-table-wrap manager-fiscal-chart-wrap">
    <div className="manager-fiscal-chart-legend" aria-hidden="true"><span><i className="contracts" />Contratos vigentes</span><span><i className="orders" />OS pendentes na carteira</span></div>
    <svg viewBox={`0 0 760 ${inspectors.length * 85 + 20}`} width="100%" role="img"
      aria-label="Comparativo de contratos vigentes e OS pendentes por fiscal" style={{ minWidth: 700, display: 'block' }}>
      <title>Contratos vigentes e OS pendentes na carteira por fiscal</title>
      <desc>Escala linear comum iniciada em zero. Os valores completos estão na tabela abaixo.</desc>
      {inspectors.map((inspector, index) => {
        const y = index * 85 + 16;
        const contractedWidth = barWidth(inspector.activeContracts);
        const pendingWidth = barWidth(inspector.pendingOrders);
        return <g key={inspector.userId} aria-label={`${inspectorName(inspector)}: ${inspector.activeContracts} contratos vigentes; ${inspector.pendingOrders} OS pendente${inspector.pendingOrders === 1 ? '' : 's'}`}>
          <text x="12" y={y + 13} className="manager-fiscal-name">{inspectorName(inspector)}</text>
          <rect x="150" y={y + 22} width={contractedWidth} height="18" className="manager-fiscal-bar-contracts" />
          <text x={156 + contractedWidth} y={y + 36}>{inspector.activeContracts}</text>
          <rect x="150" y={y + 47} width={pendingWidth} height="18" className="manager-fiscal-bar-orders" />
          <text x={156 + pendingWidth} y={y + 61}>{inspector.pendingOrders}</text>
        </g>;
      })}
    </svg>
  </div>;
}
export function ManagerDashboardView({ state }: { state: State }) {
  const summary = state.status === 'success' ? state.summary : null;
  const inspectors = state.status === 'success' && state.load?.meta.dataCoverage.inspectors === 'AVAILABLE'
    ? state.load.data.inspectors : null;
  const sortedInspectors = inspectors === null ? null : orderedInspectors(inspectors);
  const itemBalances = summary?.data.itemBalances;
  const context = summary ? JSON.stringify([summary.data.manager.userId,
    [...summary.meta.filtersApplied.contratoId].sort((a, b) => a - b)]) : null;
  const { items, suppliers, contracts, supplier, contract, band, search, setFilter, activeFilters,
    filteredItems, distribution, aggregates, allItemsSelected, clearFilters } = useItemBalanceFilters(itemBalances, context);
  return <main className="fiscal-dashboard manager-dashboard">
    <header className="fiscal-header"><div className="fiscal-header-inner">
      <div><span className="fiscal-brand">ETICE <span>•</span> SAC BI</span><h1>Dashboard do Gerente de Contratos</h1><p>Carteira contratual sob sua gestão</p></div>
      <div className="header-meta"><span className="header-chip">{summary?.data.manager.name ?? (summary ? `Gestor ${summary.data.manager.userId}` : 'Gerente')}</span><span>Data de referência: {displayDate(summary?.meta.dataReference, summary?.meta.timezone)}</span></div>
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
        <section className="fiscal-panel"><div className="panel-heading"><h2>Qualidade Preventiva da Gestão</h2><p>Decisões de vigência na janela D-90 e preenchimento cadastral dos contratos vigentes.</p></div>
          <div className="manager-quality-grid">
            <article><h3>Decisões de vigência D-90</h3>
              {summary.meta.dataCoverage.renewalDecisionsD90 === 'UNAVAILABLE' || summary.data.preventiveQuality.renewalDecisionsD90 === null
                ? <p role="status">Fonte indisponível para esta referência.</p>
                : <><strong>{summary.data.preventiveQuality.renewalDecisionsD90.eligibleContracts === 0 ? 'Sem população elegível' : percentage(summary.data.preventiveQuality.renewalDecisionsD90.percentage)}</strong>
                  <dl><div><dt>Elegíveis</dt><dd>{summary.data.preventiveQuality.renewalDecisionsD90.eligibleContracts}</dd></div>
                    <div><dt>Decididos</dt><dd>{summary.data.preventiveQuality.renewalDecisionsD90.decidedContracts}</dd></div>
                    <div><dt>Prorrogar</dt><dd>{summary.data.preventiveQuality.renewalDecisionsD90.extendContracts}</dd></div>
                    <div><dt>Não renovar</dt><dd>{summary.data.preventiveQuality.renewalDecisionsD90.nonRenewalContracts}</dd></div>
                    <div><dt>Sem decisão</dt><dd>{summary.data.preventiveQuality.renewalDecisionsD90.undecidedContracts}</dd></div></dl></>}
            </article>
            <article><h3>Preenchimento cadastral</h3>
              {summary.meta.dataCoverage.registrationCompleteness === 'UNAVAILABLE' || summary.data.preventiveQuality.registrationCompleteness === null
                ? <p role="status">Fonte indisponível para esta referência.</p>
                : <><strong>{summary.data.preventiveQuality.registrationCompleteness.activeContracts === 0 ? 'Sem contratos vigentes' : percentage(summary.data.preventiveQuality.registrationCompleteness.percentage)}</strong>
                  <dl><div><dt>Completos</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.completeContracts}</dd></div>
                    <div><dt>Vigentes</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.activeContracts}</dd></div>
                    <div><dt>Sem objeto</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.missingByField.objeto}</dd></div>
                    <div><dt>Sem valor total</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.missingByField.valor_total}</dd></div>
                    <div><dt>Sem data de assinatura</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.missingByField.data_assinatura}</dd></div>
                    <div><dt>Sem início da vigência</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.missingByField.vigencia_inicio}</dd></div>
                    <div><dt>Sem fim da vigência</dt><dd>{summary.data.preventiveQuality.registrationCompleteness.missingByField.vigencia_fim}</dd></div></dl></>}
            </article>
          </div>
          <p className="source-note">Preenchimento cadastral indica presença dos campos; intenção de prorrogar não significa prorrogação concluída.</p>
        </section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Alertas contratuais</h2><p>Pendências abertas ou em tratamento dos contratos vigentes da carteira.</p></div>
          <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Tipo</th><th>Estado</th><th>Descrição</th><th>Vencimento contratual</th></tr></thead><tbody>
            {summary.meta.dataCoverage.contractAlerts === 'AVAILABLE' && summary.data.contractAlerts?.length ? summary.data.contractAlerts.map(alert => <tr key={alert.alertId}>
              <td>{alert.contractNumber ?? `#${alert.contractId}`}</td><td>{alert.type ?? 'Indisponível'}</td><td>{alert.status}</td><td>{alert.description ?? 'Indisponível'}</td><td>{displayDate(alert.expiryDate, summary.meta.timezone)}</td>
            </tr>) : <tr><td colSpan={5} className="table-empty">{summary.meta.dataCoverage.contractAlerts === 'UNAVAILABLE' || summary.data.contractAlerts === null ? 'Indisponível' : 'Nenhum alerta contratual no recorte'}</td></tr>}
          </tbody></table></div>
        </section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Saldos da carteira</h2><p>Valores da visão de saldo contratual para a carteira completa; filtros locais de itens não se aplicam.</p></div>
          <div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Valor contratado</th><th>Valor consumido</th><th>Saldo</th><th>Percentual disponível</th></tr></thead><tbody>
            {summary.meta.dataCoverage.contractBalances === 'AVAILABLE' && summary.data.contractBalances?.length ? summary.data.contractBalances.map(item => <tr key={item.contractId}>
              <td>{item.contractNumber ?? `#${item.contractId}`}</td><td>{currency(item.contractedValue)}</td><td>{currency(item.consumedValue)}</td><td>{currency(item.balanceValue)}</td><td>{percentage(item.balancePct)}</td>
            </tr>) : <tr><td colSpan={5} className="table-empty">{summary.meta.dataCoverage.contractBalances === 'UNAVAILABLE' || summary.data.contractBalances === null ? 'Indisponível' : 'Nenhum saldo contratual no recorte'}</td></tr>}
          </tbody></table></div>
        </section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Distribuição financeira por contrato</h2><p>Contratado, consumido e saldo em reais, na mesma escala; filtros locais de itens não se aplicam.</p></div>
          {summary.meta.dataCoverage.contractBalances === 'UNAVAILABLE' || summary.data.contractBalances === null ? <div className="panel-unavailable" role="status">Indisponível</div> : summary.data.contractBalances.length === 0 ? <p className="table-empty">Nenhum saldo contratual no recorte</p> : <PortfolioFinancialChart balances={summary.data.contractBalances} />}
        </section>
        <section className="fiscal-panel fiscal-saldos"><div className="panel-heading"><h2>Gestão dos Saldos dos Itens Contratuais</h2><p>Itens da carteira autorizada; filtros locais não alteram os indicadores globais nem os saldos por contrato.</p></div>
          {itemBalances?.coverage === 'AVAILABLE' ? <>
            <div className="saldo-filters" aria-label="Filtros dos saldos contratuais">
              <label>Fornecedor<select value={supplier} onChange={event => setFilter({ supplier: event.target.value })}><option value="">Todos os fornecedores</option>{suppliers.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
              <label>Contrato<select value={contract} onChange={event => setFilter({ contract: event.target.value })}><option value="">Todos os contratos</option>{contracts.map(([id, number]) => <option key={id} value={id}>{number ?? `Contrato ID ${id}`} (ID {id})</option>)}</select></label>
              <label>Faixa<select value={band} onChange={event => setFilter({ band: event.target.value })}><option value="">Todas as faixas</option><option value="adequado">Adequado</option><option value="atencao">Atenção</option><option value="critico">Crítico</option><option value="nao_verificavel">Não verificável</option></select></label>
              <label>Busca textual<input type="search" placeholder="Buscar item, contrato ou fornecedor..." value={search} onChange={event => setFilter({ search: event.target.value })} /></label>
            </div>
            <div className="saldo-filter-meta"><span role="status">{filteredItems.length} de {items.length} itens encontrados</span><button type="button" onClick={clearFilters} disabled={!activeFilters}>Limpar todos os filtros</button></div>
            <div className="saldo-summary">
              <div><span>Total contratado dos itens</span><strong>{aggregates.totalContratado === null ? 'Indisponível' : currency(aggregates.totalContratado)}</strong></div>
              <div><span>Saldo comprometido dos itens</span><strong>{aggregates.saldoComprometido === null ? 'Indisponível' : currency(aggregates.saldoComprometido)}</strong></div>
              <div><span>Saldo medido dos itens</span><strong>{aggregates.saldoMedido === null ? 'Indisponível' : currency(aggregates.saldoMedido)}</strong></div>
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
            <p>Distribuição por faixa: Adequado: {distribution.adequado} · Atenção: {distribution.atencao} · Crítico: {distribution.critico} · Não verificável: {distribution.nao_verificavel}</p>
            <div className="fiscal-table-wrap"><table><thead><tr><th>Faixa / verificação</th><th>Contrato / fornecedor</th><th>Item contratual</th><th>Total</th><th>Executado</th><th>Saldo</th><th>% saldo</th><th>Orientação ao gerente</th></tr></thead><tbody>
              {filteredItems.length ? filteredItems.map(item => {
                const quantity = itemBalances.criterio.dimensao === 'quantidade';
                const total = quantity ? item.quantityContracted : item.valueContracted;
                const measuredBase = itemBalances.criterio.base === 'medido';
                const executed = quantity ? (measuredBase ? total === null ? null : item.quantityMeasured : item.quantityConsumed)
                  : (measuredBase ? total === null ? null : item.valueMeasured : item.valueConsumed);
                const balance = measuredBase ? (quantity ? item.quantityMeasuredBalance : item.valueMeasuredBalance)
                  : (quantity ? item.quantityBalance : item.valueBalance);
                const format = quantity ? (value: number | null) => value === null ? 'Não calculável' : `${value} ${item.unit ?? ''}` : (value: number | null) => value === null ? 'Indisponível' : currency(value);
                return <tr key={item.itemId}><td>{item.faixa}{item.statusVerificacao && <> <small>Verificação: {item.statusVerificacao}</small></>}{item.blockedAt && <small> Bloqueado: {item.blockReason ?? 'motivo indisponível'}</small>}</td>
                  <td>{item.contractNumber ?? `Contrato ID ${item.contractId}`}<br />{item.supplierName ?? 'Fornecedor indisponível'}</td>
                  <td>{item.sequence ?? '—'} · {item.specification ?? 'Sem especificação'}</td>
                  <td>{format(total)}</td><td>{format(executed)}</td>
                  <td>{format(balance)}{balance !== null && balance < 0 && <strong> · Saldo negativo</strong>}</td>
                  <td>{percentage((itemBalances.criterio.base === 'medido' ? item.pctSaldoMedido : item.pctSaldo) === null ? null : (itemBalances.criterio.base === 'medido' ? item.pctSaldoMedido! : item.pctSaldo!) * 100)}</td>
                  <td>{item.faixa === 'critico' ? 'Avaliar saldo e planejamento do item.' : item.faixa === 'nao_verificavel' ? 'Conferir dados do item.' : item.faixa === 'atencao' ? 'Acompanhar consumo do item.' : 'Manter acompanhamento do item.'}</td></tr>;
              }) : <tr><td colSpan={8} className="table-empty">{items.length ? 'Nenhum item encontrado com os filtros atuais.' : 'Nenhum item contratual cadastrado na carteira.'}</td></tr>}
            </tbody></table></div>
          </> : <div className="panel-unavailable" role="status">Fonte de saldos por item indisponível para esta data.</div>}
        </section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Fiscais e distribuição da carteira</h2><p>Contratos vigentes designados e OS com decisão fiscal pendente. OS pendentes são vinculadas aos contratos da carteira do fiscal e não representam necessariamente atribuições individuais. Uma mesma OS pode aparecer para fiscais diferentes; as contagens não devem ser somadas como OS únicas da carteira gerencial.</p></div>
          {state.status === 'success' && state.loadError ? <p role="alert">Erro ao carregar distribuição dos fiscais: {state.loadError}</p>
            : sortedInspectors === null ? <p role="status">Distribuição dos fiscais indisponível para esta referência.</p>
              : sortedInspectors.length === 0 ? <p role="status">Nenhum fiscal designado na carteira.</p>
                : <><FiscalLoadChart inspectors={sortedInspectors} /><div className="fiscal-table-wrap"><table><thead><tr><th>Fiscal</th><th>Contratos vigentes</th><th>OS pendentes</th><th>Capacidade</th></tr></thead><tbody>
                  {sortedInspectors.map(fiscal => <tr key={fiscal.userId}><td>{inspectorName(fiscal)}</td><td>{fiscal.activeContracts}</td><td>{fiscal.pendingOrders}</td><td>Indisponível</td></tr>)}
                </tbody></table></div></>}
        </section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Fornecedores da carteira</h2><p>Valor vigente dos contratos autorizados; demais indicadores sem fonte aprovada.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Valor vigente</th><th>ABC</th><th>Financeiro em aberto</th><th>Riscos críticos</th></tr></thead><tbody>
          {state.status === 'success' && state.suppliers?.data.suppliers?.length ? state.suppliers.data.suppliers.map((supplier) => <tr key={supplier.supplierId}><td>{supplier.name}</td><td>{money(supplier.vigentValue)}</td><td>Indisponível</td><td>Indisponível</td><td>Indisponível</td></tr>) : <tr><td colSpan={5} className="table-empty">{state.status === 'success' && state.suppliersError ? `Erro ao carregar fornecedores: ${state.suppliersError}` : state.status === 'success' && state.suppliers?.data.suppliers?.length === 0 ? 'Nenhum fornecedor na carteira' : 'Indisponível'}</td></tr>}
        </tbody></table></div></section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Contratos vigentes da carteira</h2><p>Dados atuais dos contratos autorizados.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Valor atual</th><th>Fim da vigência</th></tr></thead><tbody>
          {summary.data.contracts?.length ? summary.data.contracts.map((contract) => <tr key={contract.contractId}><td>{contract.contractNumber ?? `#${contract.contractId}`}</td><td>{contract.supplierName ?? 'Indisponível'}</td><td>{money(contract.value)}</td><td>{displayDate(contract.expiryDate, summary.meta.timezone)}</td></tr>) : <tr><td colSpan={4} className="table-empty">{summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente'}</td></tr>}
        </tbody></table></div></section>
        <section className="fiscal-panel"><div className="panel-heading"><h2>Contratos vigentes com vencimento nos próximos 120 dias</h2><p>Inclui a data de referência e o limite de 120 dias.</p></div><div className="fiscal-table-wrap"><table><thead><tr><th>Contrato</th><th>Fornecedor</th><th>Fim da vigência</th></tr></thead><tbody>
          {summary.data.expiringContractList?.length ? summary.data.expiringContractList.map((contract) => <tr key={contract.contractId}><td>{contract.contractNumber ?? `#${contract.contractId}`}</td><td>{contract.supplierName ?? 'Indisponível'}</td><td>{displayDate(contract.expiryDate, summary.meta.timezone)}</td></tr>) : <tr><td colSpan={3} className="table-empty">{summary.data.expiringContractList === null ? 'Indisponível' : 'Nenhum contrato na janela'}</td></tr>}
        </tbody></table></div></section>
      </>}
    </div>
  </main>;
}
export function ManagerDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => { let active = true; Promise.all([loadManagerSummary(), loadManagerFiscalLoad().then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error: error instanceof Error ? error.message : 'Falha na consulta' })), loadManagerSuppliers().then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error: error instanceof Error ? error.message : 'Falha na consulta' }))]).then(([summary, load, suppliers]) => { if (active) setState({ status: 'success', summary, load: load.value, loadError: load.error, suppliers: suppliers.value, suppliersError: suppliers.error }); })
    .catch((error: unknown) => { if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha na consulta' }); });
    return () => { active = false; }; }, []);
  return <ManagerDashboardView state={state} />;
}
