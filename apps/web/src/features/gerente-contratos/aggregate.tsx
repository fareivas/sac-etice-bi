import { useEffect, useState } from 'react';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
import { loadManagerFiscalLoad, loadManagerSummary } from '../../lib/api';
import { displayDate } from '../../lib/display-date';
import { initialGlobalFilters, projectManagerSummary, selectGlobalContracts } from './global-filters';
import { contractOccurrences, genericEvaluation, genericEvaluationNote, occurrenceCoverage, occurrenceEmptyMessage } from './occurrences';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; summary: ManagerDashboardSummaryResponse; load: ManagerFiscalLoadResponse | null; loadError: string | null };
const labels = { CRITICAL: 'Crítico', ATTENTION: 'Atenção', OK: 'OK', UNAVAILABLE: 'Indisponível' } as const;
const unavailable = 'Indisponível';
const formatMoney = (value: number | null) => value === null ? unavailable : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function EmptyTable({ columns, message = 'Fonte e regra aprovadas indisponíveis.' }: { columns: string[]; message?: string }) {
  return <div className="aggregate-table-wrap"><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
    <tbody><tr><td colSpan={columns.length} className="table-empty">{message}</td></tr></tbody></table></div>;
}

function AggregateView({ state }: { state: State }) {
  const [filters, setFilters] = useState(initialGlobalFilters);
  const source = state.status === 'success' ? state.summary : null;
  const load = state.status === 'success' ? state.load : null;
  const selectedIds = source ? selectGlobalContracts(source, load, filters) : null;
  const projected = source && selectedIds ? projectManagerSummary(source, selectedIds) : null;
  const summary = projected?.summary ?? source;
  const scopeUnavailable = source !== null && selectedIds === null;
  const occurrences = contractOccurrences(summary, scopeUnavailable, selectedIds?.size === 0);
  const emptyLabel = source?.data.contracts?.length === 0 ? 'Carteira autorizada sem contratos.' : 'Nenhum contrato no recorte selecionado.';
  const rows = scopeUnavailable ? null : summary?.data.contractRiskMatrix;
  const inspectors = load?.meta.dataCoverage.inspectors === 'AVAILABLE' ? load.data.inspectors : null;
  const selectedInspectors = scopeUnavailable ? null : selectedIds?.size === 0 ? [] : inspectors?.filter(inspector =>
    !filters.fiscal || String(inspector.userId) === filters.fiscal).map(inspector => ({ ...inspector,
    activeContracts: inspector.contractIds ? inspector.contractIds.filter(id => selectedIds?.has(id)).length : null,
  })) ?? null;
  const maxLoad = Math.max(0, ...selectedInspectors?.map(item => item.activeContracts ?? 0) ?? []);
  const critical = rows === null || rows === undefined ? null : rows.filter(row =>
    [row.saldo.status, row.vigencia, row.sla, row.medicao, row.pagamento, row.indice].includes('CRITICAL')).length;
  const quality = scopeUnavailable ? null : summary?.data.preventiveQuality;
  const registration = quality?.registrationCompleteness?.percentage ?? null;
  const qualityMeasures = [
    ['Dados completos', registration], ['Ações no prazo', null], ['Renovações D-90', null],
  ] as const;
  const financialPhases = ['Faturado clientes', 'A receber', 'Recebido ETICE', 'Medição fornecedor',
    'Processando pagamento', 'Programado', 'Pago fornecedor'];
  return <main className="aggregate-dashboard">
    <header className="aggregate-header"><div className="aggregate-header-inner"><div><h1>ETICE • Dashboard do Gerente de Contratos</h1>
      <p>Visão agregada de contratos, fiscais, riscos e intervenções</p></div>
      <span className="aggregate-header-chip">Visão agregada • {displayDate(source?.meta.dataReference, source?.meta.timezone)}</span></div></header>
    <div className="aggregate-page">
      {state.status === 'loading' && <p role="status" className="aggregate-notice">Carregando visão agregada…</p>}
      {state.status === 'error' && <p role="alert" className="aggregate-notice">Erro ao carregar a carteira: {state.message}</p>}
      {source && <>
        <section className="aggregate-filters" aria-label="Filtros globais da carteira">
          <label><span>Fiscal</span><select value={filters.fiscal} disabled={!inspectors}
            onChange={event => setFilters(current => ({ ...current, fiscal: event.target.value }))}>
            <option value="">Todos os fiscais</option>{inspectors?.map(item => <option value={item.userId} key={item.userId}>{item.name ?? `Fiscal ${item.userId}`}</option>)}</select></label>
          <label><span>Gerência</span><select disabled value=""><option value="">Todas as gerências</option></select><small>Fonte não aprovada</small></label>
          <label><span>Risco: Saldo ou Vigência</span><select value={filters.risk} disabled={source.data.contractRiskMatrix === null}
            onChange={event => setFilters(current => ({ ...current, risk: event.target.value }))}>
            <option value="">Todos os riscos</option>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label><span>Janela de vencimento</span><select value={filters.days}
            onChange={event => setFilters(current => ({ ...current, days: Number(event.target.value) as 90 | 180 | 365 }))}>
            {[90, 180, 365].map(days => <option value={days} key={days}>Próximos {days} dias</option>)}</select></label>
          <label><span>Buscar fiscal, contrato ou fornecedor</span><input type="search" value={filters.search}
            placeholder="Buscar fiscal, contrato ou fornecedor..."
            onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} /></label>
        </section>
        <p className="aggregate-recut" role="status">{selectedIds === null ? 'Recorte indisponível para a fonte atual.' :
          `${selectedIds.size} de ${source.data.contracts?.length ?? 0} contratos no recorte global.`} Janela: D0 a D+{filters.days} dias.</p>
        {summary ? <>
          <section className="aggregate-kpis" aria-label="Indicadores executivos">
            {[
              ['Contratos monitorados', !scopeUnavailable && summary.meta.dataCoverage.activeContracts === 'AVAILABLE' ? String(summary.data.cards.activeContracts ?? unavailable) : unavailable, 'Contratos vigentes no recorte global'],
              ['Contratos críticos', critical === null ? unavailable : String(critical), 'Dimensão crítica na matriz; sem índice geral'],
              ['Valor contratado', !scopeUnavailable && summary.meta.dataCoverage.activePortfolioValue === 'AVAILABLE' ? formatMoney(summary.data.cards.activePortfolioValue) : unavailable, 'Carteira ativa no recorte global'],
              ['Renovações atrasadas', unavailable, 'Sem fonte e regra aprovadas'],
              ['SLA abaixo da meta', unavailable, 'Depende do Projeto de KPIs'],
              ['Intervenções gerenciais', unavailable, 'Sem regra de intervenção aprovada'],
            ].map(([title, value, note]) => <article className="aggregate-kpi" key={title}><small>{title}</small><strong>{value}</strong><span>{note}</span></article>)}
          </section>
          <div className="aggregate-grid-two">
            <section className="aggregate-card aggregate-matrix"><h2>Matriz Contrato × Dimensão de Risco</h2><p className="aggregate-sub">Seis dimensões da carteira autorizada; índice geral indisponível.</p>
              {rows === null || rows === undefined ? <p className="aggregate-unavailable">Matriz indisponível.</p> : rows.length === 0 ? <p className="aggregate-unavailable">{emptyLabel}</p> :
                <div className="aggregate-matrix-scroll"><div className="aggregate-matrix-grid">
                  {['Contrato', 'Saldo', 'Vigência', 'SLA', 'Medição', 'Pagamento', 'Índice'].map(name => <div className="aggregate-matrix-head" key={name}>{name}</div>)}
                  {rows.map(row => <div className="aggregate-matrix-row" key={row.contractId}>
                    <div className="aggregate-matrix-head">{row.contractNumber ?? `ID ${row.contractId}`}</div>
                    {([row.saldo.status, row.vigencia, row.sla, row.medicao, row.pagamento, row.indice] as const).map((status, index) =>
                      <div key={index} className={`aggregate-matrix-cell aggregate-${status.toLowerCase()}`}>{labels[status]}</div>)}
                  </div>)}
                </div></div>}
            </section>
            <section className="aggregate-card"><h2>Carga e risco por fiscal</h2>
              {selectedInspectors === null ? <p className="aggregate-unavailable">{state.status === 'success' && state.loadError ? `Fonte de distribuição indisponível: ${state.loadError}` : 'Fonte de distribuição indisponível.'}</p>
                : selectedInspectors.length === 0 ? <p className="aggregate-unavailable">{selectedIds?.size ? 'Contratos no recorte sem fiscais com designação ativa.' : emptyLabel}</p>
                  : selectedInspectors.map(item => <div className="aggregate-bar" key={item.userId}><span>{item.name ?? `Fiscal ${item.userId}`}</span>
                    <div className="aggregate-track"><i style={{ width: item.activeContracts === null || maxLoad === 0 ? '0%' : `${item.activeContracts / maxLoad * 100}%` }} /></div>
                    <b>{item.activeContracts === null ? unavailable : `${item.activeContracts} ctr.`}</b></div>)}
              <p className="aggregate-note">Criticidade por fiscal indisponível: sem índice ou regra aprovada.</p>
            </section>
          </div>
          <section className="aggregate-card aggregate-block"><h2>Intervenções gerenciais priorizadas</h2>
            <p className="aggregate-sub" role="status">{occurrenceCoverage(occurrences)} Sem classificação de prioridade ou ação formalmente atribuída.</p>
            <div className="aggregate-table-wrap"><table><thead><tr>{['Prior.', 'Fiscal', 'Contrato / Empresa', 'Risco', 'Impacto', 'Ação gerencial', 'Prazo'].map(column => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>{occurrences.rows.length ? occurrences.rows.map((row, index) => <tr key={row.key} data-occurrence-id={row.key} data-contract-id={row.contractId}
                className={index === 0 || occurrences.rows[index - 1].contractId !== row.contractId ? 'manager-occurrence-group-start' : undefined}>
                <td>Indisponível</td><td>Indisponível</td>
                <td><strong>{row.contractNumber ?? `Contrato ID ${row.contractId}`}</strong>{row.supplierName && <><br />{row.supplierName}</>}</td>
                <td><strong>{row.signal}</strong><br />{row.detail}</td><td>Indisponível</td>
                <td>{genericEvaluation}<small className="manager-occurrence-note">{genericEvaluationNote}</small></td><td>Indisponível</td>
              </tr>) : <tr><td colSpan={7} className="table-empty">{occurrenceEmptyMessage(occurrences)}</td></tr>}</tbody></table></div></section>
          <div className="aggregate-grid-three">
            <section className="aggregate-card"><h2>Forecast 180 dias</h2><div className="aggregate-alert"><strong>{unavailable}</strong><span>Valor de contratos com risco de saldo ou vigência sem regra aprovada.</span></div>
              <div className="aggregate-alert aggregate-warn"><strong>{unavailable}</strong><span>Necessidade de renovação, aditivo ou licitação sem regra aprovada.</span></div></section>
            <section className="aggregate-card"><h2>Exposição financeira</h2>{['SLA / glosas', 'Medições', 'Pagamento'].map(label => <div className="aggregate-bar" key={label}><span>{label}</span><div className="aggregate-track"/><b>{unavailable}</b></div>)}
              <p className="aggregate-note">Fonte financeira e Projeto de KPIs indisponíveis.</p></section>
            <section className="aggregate-card"><h2>Qualidade da gestão</h2>{qualityMeasures.map(([label, value]) => <div className="aggregate-bar" key={label}><span>{label}</span><div className="aggregate-track"><i style={{ width: value === null ? '0%' : `${Math.max(0, Math.min(100, value))}%` }} /></div><b>{value === null ? unavailable : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</b></div>)}
              <p className="aggregate-note">Medidas sem decomposição aprovada ficam indisponíveis no subconjunto.</p></section>
          </div>
          <section className="aggregate-card aggregate-block"><h2>Eficiência do Ciclo Financeiro — carteira gerenciada</h2>
            <p className="aggregate-sub">Volumes em cada fase e tempo entre etapas.</p>
            <div className="aggregate-payflow">{financialPhases.map(phase => <div className="aggregate-phase" key={phase}><b>{phase}</b><strong>{unavailable}</strong><span>Sem fonte aprovada</span></div>)}</div>
            <div className="aggregate-metric-row">{['Tempo mínimo', 'Tempo médio', 'Mediana', 'P90', 'Tempo máximo'].map(label => <div key={label}><small>{label}</small><b>{unavailable}</b></div>)}</div>
            <EmptyTable columns={['Fase', 'Valor parado', 'Qtd.', 'Tempo médio', 'P90', 'Responsável típico', 'Situação']} /></section>
          <div className="aggregate-abc-grid">
            <section className="aggregate-card"><h2>Curva ABC de Fornecedores</h2><p className="aggregate-sub">Base: pagamentos efetivos acumulados nos últimos 12 meses.</p>
              <div className="aggregate-abc-track" role="img" aria-label="Curva ABC indisponível" />
              <p className="aggregate-abc-unavailable">Classificação e faixas A/B/C indisponíveis.</p>
              <EmptyTable columns={['Classe', 'Fornecedor', 'Valor 12m', '%', '% acum.', 'Contratos', 'Risco atual']} /></section>
            <section className="aggregate-card"><h2>Curva ABC de Clientes</h2><p className="aggregate-sub">Base: recebimentos efetivos acumulados nos últimos 12 meses.</p>
              <div className="aggregate-abc-track" role="img" aria-label="Curva ABC indisponível" />
              <p className="aggregate-abc-unavailable">Classificação e faixas A/B/C indisponíveis.</p>
              <EmptyTable columns={['Classe', 'Cliente', 'Recebido 12m', '%', '% acum.', 'Contratos', 'Situação']} /></section>
          </div>
        </> : null}
      </>}
    </div>
  </main>;
}

export function ManagerAggregateDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    Promise.all([
      loadManagerSummary(),
      loadManagerFiscalLoad().then(load => ({ load, loadError: null })).catch((error: unknown) =>
        ({ load: null, loadError: error instanceof Error ? error.message : 'Falha na consulta' })),
    ]).then(([summary, fiscal]) => { if (active) setState({ status: 'success', summary, ...fiscal }); })
      .catch((error: unknown) => { if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha na consulta' }); });
    return () => { active = false; };
  }, []);
  return <AggregateView state={state} />;
}

export { AggregateView };
