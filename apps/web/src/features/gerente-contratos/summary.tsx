import { BandDistribution } from '../item-balances/band-distribution';
import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type {
  ManagerDashboardSummaryResponse,
  ManagerFiscalLoadResponse,
  ManagerSuppliersResponse,
} from '@sac-etice-bi/contracts';
import { loadManagerSummary, loadManagerFiscalLoad, loadManagerSuppliers } from '../../lib/api';
import { displayDate } from '../../lib/display-date';
import { useItemBalanceFilters } from '../item-balances/use-item-balance-filters';
import { initialGlobalFilters, projectManagerSummary, selectGlobalContracts } from './global-filters';
import { contractOccurrences, genericEvaluation, genericEvaluationNote, occurrenceCoverage, occurrenceEmptyMessage } from './occurrences';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: ManagerDashboardSummaryResponse;
      load?: ManagerFiscalLoadResponse | null;
      loadError?: string | null;
      suppliers?: ManagerSuppliersResponse | null;
      suppliersError?: string | null;
      suppliersLoading?: boolean;
      suppliersPage?: number;
    };
const money = (value: number | null) =>
  value === null
    ? 'Indisponível'
    : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const count = (value: number | null) => (value === null ? 'Indisponível' : String(value));
const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const percentage = (value: number | null) => (value === null ? 'Indisponível' : `${money(value)}%`);

function QualityBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="manager-quality-bar" data-quality-bar={label}>
      <div className="manager-quality-bar-label">
        <span>{label}</span>
        <strong>{value === null ? 'Indisponível' : percentage(value)}</strong>
      </div>
      <div className="manager-quality-bar-track" aria-hidden="true">
        {value !== null && <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
      </div>
    </div>
  );
}

function ManagerCombinedChart({ inspectors }: { inspectors: readonly Inspector[] | null }) {
  const data = inspectors?.map(inspector => ({ name: inspectorName(inspector), contracts: inspector.activeContracts,
    critical: null, performance: null })) ?? [];
  return <figure className="manager-combined-chart" aria-label="Carga, criticidade e desempenho por fiscal">
    <div className="manager-chart-area">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="count" tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis yAxisId="percent" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
          <Bar yAxisId="count" dataKey="contracts" name="Contratos" fill="#164e63" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="count" dataKey="critical" name="Críticos" fill="#dc2626" />
          <Line yAxisId="percent" dataKey="performance" name="Ações no prazo" stroke="#0f766e" strokeWidth={3} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <figcaption><span><i className="manager-legend-contracts" />Contratos vigentes</span>
      <span><i className="manager-legend-critical" />Críticos: indisponível</span>
      <span><i className="manager-legend-performance" />Ações no prazo: indisponível</span></figcaption>
    {inspectors === null ? <p role="status">Distribuição dos fiscais indisponível.</p> : inspectors.length === 0 ?
      <p role="status">Nenhum fiscal designado na carteira.</p> : null}
  </figure>;
}

function ManagerPreventiveRadar({ completeness }: { completeness: number | null }) {
  const data = [
    { subject: 'Dados completos', score: completeness },
    { subject: 'Ações no prazo', score: null },
    { subject: 'Renovações D-90', score: null },
    { subject: 'Medições', score: null },
    { subject: 'Previsibilidade', score: null },
  ];
  return <figure className="manager-radar" aria-label="Radar de qualidade preventiva da gestão">
    <div className="manager-chart-area">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="68%">
          <PolarGrid stroke="#dbe3ef" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Qualidade" dataKey="score" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.35} connectNulls={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
    <figcaption>Dados completos: {percentage(completeness)}. Ações no prazo, Renovações D-90, Medições e Previsibilidade: indisponíveis.</figcaption>
  </figure>;
}

const balanceReasonLabels = {
  NO_ITEMS: 'Sem itens cadastrados para classificar o saldo',
  ALL_ITEMS_UNVERIFIABLE: 'Todos os itens são não verificáveis para classificar o saldo',
  ITEM_SOURCE_UNAVAILABLE: 'Fonte de itens indisponível para classificar o saldo',
} as const;
const riskLabels = {
  CRITICAL: 'Crítico',
  ATTENTION: 'Atenção',
  OK: 'OK',
  UNAVAILABLE: 'Indisponível',
} as const;

type Inspector = NonNullable<ManagerFiscalLoadResponse['data']['inspectors']>[number];
const inspectorName = (inspector: Inspector) => inspector.name ?? `Fiscal ${inspector.userId}`;
function orderedInspectors(inspectors: readonly Inspector[]): Inspector[] {
  return [...inspectors].sort(
    (a, b) =>
      b.activeContracts - a.activeContracts ||
      inspectorName(a).localeCompare(inspectorName(b), 'pt-BR') ||
      a.userId - b.userId
  );
}

export function FiscalLoadChart({ inspectors }: { inspectors: readonly Inspector[] }) {
  const max = Math.max(
    0,
    ...inspectors.flatMap((inspector) => [inspector.activeContracts, inspector.pendingOrders])
  );
  const barWidth = (value: number) => (max === 0 ? 0 : (value / max) * 450);
  const height = inspectors.length * 64 + 22;
  return (
    <figure className="manager-fiscal-chart-wrap">
      <div className="manager-fiscal-chart-legend" aria-label="Séries do gráfico">
        <span>
          <i className="contracts" aria-hidden="true" />
          Contratos vigentes
        </span>
        <span>
          <i className="orders" aria-hidden="true" />
          OS pendentes na carteira
        </span>
      </div>
      <div
        className="manager-fiscal-chart-scroll"
        tabIndex={0}
        role="region"
        aria-label="Gráfico de carga por fiscal, área com rolagem"
      >
        <svg
          viewBox={`0 0 700 ${height}`}
          width="100%"
          role="img"
          aria-label="Comparativo de contratos vigentes e OS pendentes por fiscal"
        >
          <title>Contratos vigentes e OS pendentes na carteira por fiscal</title>
          <desc>
            Escala linear comum iniciada em zero. Os valores completos e os nomes integrais estão na tabela
            abaixo.
          </desc>
          <g className="manager-fiscal-chart-axis" aria-hidden="true">
            <line x1="160" x2="160" y1="10" y2={height - 22} />
            {max > 0 && (
              <line x1="610" x2="610" y1="10" y2={height - 22} className="manager-fiscal-chart-grid" />
            )}
            <text x="160" y={height - 5} textAnchor="middle">
              0
            </text>
            {max > 0 && (
              <text x="610" y={height - 5} textAnchor="middle">
                {max}
              </text>
            )}
          </g>
          {inspectors.map((inspector, index) => {
            const y = index * 64 + 18;
            const name = inspectorName(inspector);
            return (
              <g
                key={inspector.userId}
                aria-label={`${name}: ${inspector.activeContracts} contratos vigentes; ${inspector.pendingOrders} OS pendente${inspector.pendingOrders === 1 ? '' : 's'}`}
              >
                <title>{name}</title>
                <foreignObject x="12" y={y - 2} width="136" height="42">
                  <div className="manager-fiscal-name">
                    <span>{name}</span>
                  </div>
                </foreignObject>
                <rect
                  x="160"
                  y={y}
                  width={barWidth(inspector.activeContracts)}
                  height="16"
                  rx="3"
                  className="manager-fiscal-bar-contracts"
                />
                <text
                  x={166 + barWidth(inspector.activeContracts)}
                  y={y + 12}
                  className="manager-fiscal-value"
                >
                  {inspector.activeContracts}
                </text>
                <rect
                  x="160"
                  y={y + 22}
                  width={barWidth(inspector.pendingOrders)}
                  height="16"
                  rx="3"
                  className="manager-fiscal-bar-orders"
                />
                <text x={166 + barWidth(inspector.pendingOrders)} y={y + 34} className="manager-fiscal-value">
                  {inspector.pendingOrders}
                </text>
                {index < inspectors.length - 1 && (
                  <line x1="12" x2="688" y1={y + 50} y2={y + 50} className="manager-fiscal-row-divider" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
export function ManagerDashboardView({ state, globalFiltersEnabled = false, onSuppliersPageChange, onSuppliersRetry }: {
  state: State; globalFiltersEnabled?: boolean; onSuppliersPageChange?: (page: number) => void; onSuppliersRetry?: () => void;
}) {
  const [globalFilters, setGlobalFilters] = useState(initialGlobalFilters);
  const baseSummary = state.status === 'success' ? state.summary : null;
  const selectedIds = globalFiltersEnabled && baseSummary
    ? selectGlobalContracts(baseSummary, state.status === 'success' ? state.load : null, globalFilters) : null;
  const selectionUnavailable = globalFiltersEnabled && baseSummary !== null && selectedIds === null;
  const projection = baseSummary && selectedIds ? projectManagerSummary(baseSummary, selectedIds) : null;
  const summary = projection?.summary ?? baseSummary;
  const occurrences = contractOccurrences(summary, selectionUnavailable, selectedIds?.size === 0);
  const subset = projection?.subset ?? false;
  const supplierPagination = state.status === 'success' ? state.suppliers?.meta.pagination : undefined;
  const supplierPage = state.status === 'success' ? state.suppliersPage ?? supplierPagination?.page ?? 1 : 1;
  const supplierTotal = supplierPagination?.totalItems ?? null;
  const supplierPageCount = supplierTotal === null ? null : Math.max(1, Math.ceil(supplierTotal / 25));
  const supplierStart = supplierTotal === null || supplierTotal === 0 ? 0 : (supplierPage - 1) * 25 + 1;
  const supplierEnd = supplierTotal === null ? 0 : Math.min(supplierPage * 25, supplierTotal);
  const baseInspectors = state.status === 'success' && state.load?.meta.dataCoverage.inspectors === 'AVAILABLE'
    ? state.load.data.inspectors : null;
  const inspectors =
    state.status === 'success' && state.load?.meta.dataCoverage.inspectors === 'AVAILABLE'
      ? state.load.data.inspectors
      : null;
  const sortedInspectors = inspectors === null || (subset && inspectors.some(item => item.contractIds === undefined))
    ? null : orderedInspectors(subset && selectedIds
    ? inspectors.filter(item => item.contractIds?.some(id => selectedIds.has(id)))
      .map(item => ({ ...item, activeContracts: item.contractIds?.filter(id => selectedIds.has(id) &&
        summary?.data.contracts?.some(contract => contract.contractId === id)).length ?? 0 })) : inspectors);
  const fiscalNamesForContract = (contractId: number) => {
    if (inspectors === null || inspectors.some(inspector => inspector.contractIds === undefined)) return 'Indisponível';
    const names = inspectors.filter(inspector => inspector.contractIds?.includes(contractId)).map(inspectorName);
    return names.length ? names.join(', ') : 'Sem designação fiscal ativa';
  };
  const itemBalances = summary?.data.itemBalances;
  const context = summary
    ? JSON.stringify([
        baseSummary!.data.manager.userId,
        [...baseSummary!.meta.filtersApplied.contratoId].sort((a, b) => a - b),
      ])
    : null;
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixDimension, setMatrixDimension] = useState('all');
  const [matrixClass, setMatrixClass] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState<{
    contractId: number;
    dimension: 'saldo' | 'vigencia' | 'sla' | 'medicao' | 'pagamento' | 'indice';
  } | null>(null);
  const selectedCellRef = useRef<HTMLButtonElement | null>(null);
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
    aggregates,
    allItemsSelected,
    clearFilters,
  } = useItemBalanceFilters(itemBalances, context, globalFiltersEnabled);
  const matrix = summary?.data.contractRiskMatrix;
  const dimensions = ['saldo', 'vigencia', 'sla', 'medicao', 'pagamento', 'indice'] as const;
  const matrixStatus = (row: NonNullable<typeof matrix>[number], dimension: (typeof dimensions)[number]) =>
    dimension === 'saldo' ? row.saldo.status : row[dimension];
  const severity = { CRITICAL: 3, ATTENTION: 2, OK: 1, UNAVAILABLE: 0 };
  const matrixRows = (matrix ?? [])
    .filter((row) => {
      const searchMatch = `${row.contractNumber ?? row.contractId} ${row.supplierName ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(matrixSearch.toLocaleLowerCase('pt-BR').trim());
      const selected =
        matrixDimension === 'all'
          ? dimensions
          : dimensions.filter((dimension) => dimension === matrixDimension);
      return (
        searchMatch &&
        (matrixClass === 'all' || selected.some((dimension) => matrixStatus(row, dimension) === matrixClass))
      );
    })
    .sort(
      (a, b) =>
        Math.max(...dimensions.map((dimension) => severity[matrixStatus(b, dimension)])) -
          Math.max(...dimensions.map((dimension) => severity[matrixStatus(a, dimension)])) ||
        (a.contractNumber ?? String(a.contractId)).localeCompare(
          b.contractNumber ?? String(b.contractId),
          'pt-BR'
        )
    );
  const matrixCounts = { CRITICAL: 0, ATTENTION: 0, OK: 0, UNAVAILABLE: 0 };
  const countedDimensions =
    matrixDimension === 'all' ? dimensions : dimensions.filter((dimension) => dimension === matrixDimension);
  matrixRows.forEach((row) =>
    countedDimensions.forEach((dimension) => {
      matrixCounts[matrixStatus(row, dimension)]++;
    })
  );
  const criticalContracts =
    summary?.meta.dataCoverage.contractRiskMatrix !== 'AVAILABLE' || matrix === null || matrix === undefined
      ? null
      : matrix.filter((row) => dimensions.some((dimension) => matrixStatus(row, dimension) === 'CRITICAL'))
          .length;
  const selectedRow = selectedRisk && matrixRows.find((row) => row.contractId === selectedRisk.contractId);
  const dimensionLabels = {
    saldo: 'Saldo',
    vigencia: 'Vigência',
    sla: 'SLA',
    medicao: 'Medição',
    pagamento: 'Pagamento',
    indice: 'Índice',
  };
  const riskCell = (row: NonNullable<typeof matrix>[number], dimension: (typeof dimensions)[number]) => {
    const status = matrixStatus(row, dimension);
    const selected = selectedRisk?.contractId === row.contractId && selectedRisk.dimension === dimension;
    return (
      <td key={dimension}>
        <button
          type="button"
          className={`manager-risk-cell manager-risk-${status.toLowerCase()}${selected ? ' is-selected' : ''}`}
          aria-label={`${row.contractNumber ?? `Contrato ID ${row.contractId}`}, ${dimensionLabels[dimension]}: ${riskLabels[status]}`}
          aria-pressed={selected}
          aria-controls="manager-risk-detail"
          onClick={(event) => {
            selectedCellRef.current = event.currentTarget;
            setSelectedRisk(selected ? null : { contractId: row.contractId, dimension });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSelectedRisk(null);
          }}
        >
          {riskLabels[status]}
        </button>
      </td>
    );
  };
  return (
    <main className="fiscal-dashboard manager-dashboard">
      <header className="fiscal-header manager-header">
        <div className="fiscal-header-inner">
          <div>
            <h1>ETICE • Dashboard do Gerente de Contratos</h1>
            <p>Supervisão de fiscais, fornecedores estratégicos e prevenção de riscos</p>
          </div>
          <div className="header-meta">
            <span className="header-chip">
              {summary?.data.manager.name ?? (summary ? `Gestor ${summary.data.manager.userId}` : 'Gerente')}
              {' • '}Data de referência: {displayDate(summary?.meta.dataReference, summary?.meta.timezone)}
            </span>
          </div>
        </div>
      </header>
      <div className="fiscal-page">
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
            <section className="fiscal-kpis manager-kpis" aria-label="Indicadores executivos">
              <article className="fiscal-kpi">
                <span>Contratos monitorados</span>
                <strong>{!selectionUnavailable && summary.meta.dataCoverage.activeContracts === 'AVAILABLE' ? count(summary.data.cards.activeContracts) : 'Indisponível'}</strong>
                <small>Contratos vigentes da carteira autorizada no recorte global</small>
              </article>
              <article className="fiscal-kpi">
                <span>Contratos críticos</span>
                <strong>{selectionUnavailable ? 'Indisponível' : count(criticalContracts)}</strong>
                <small>Ao menos uma dimensão crítica na matriz do recorte global; não há índice geral aprovado</small>
              </article>
              <article className="fiscal-kpi">
                <span>Valor contratado</span>
                <strong>
                  {selectionUnavailable || summary.meta.dataCoverage.activePortfolioValue !== 'AVAILABLE' || summary.data.cards.activePortfolioValue === null
                    ? 'Indisponível'
                    : currency(summary.data.cards.activePortfolioValue)}
                </strong>
                <small>Valor dos contratos vigentes no recorte global da carteira ativa</small>
              </article>
              <article className="fiscal-kpi">
                <span>Renovações atrasadas</span>
                <strong className="unavailable-value">Indisponível</strong>
                <small>Sem fonte e regra aprovadas para atraso de renovação</small>
              </article>
              <article className="fiscal-kpi">
                <span>SLA abaixo da meta</span>
                <strong className="unavailable-value">Indisponível</strong>
                <small>Depende do Projeto de KPIs</small>
              </article>
              <article className="fiscal-kpi">
                <span>Intervenções gerenciais</span>
                <strong className="unavailable-value">Indisponível</strong>
                <small>Sem indicador agregado e regra de intervenção aprovados</small>
              </article>
            </section>
            <section className="manager-decision" aria-label="Alertas executivos">
              {[
                ['Decisão imediata', 'red', 'Sem prioridade e prazo de intervenção aprovados.'],
                ['Capacidade', 'yellow', 'Capacidade e sobrecarga dos fiscais indisponíveis.'],
                ['Concentração', 'purple', 'Classe ABC e risco agregado por fornecedor indisponíveis.'],
                ['Antecipação', 'blue', 'Antecedência de intervenções indisponível.'],
              ].map(([label, tone, detail]) => <article className="manager-decision-item" key={label}>
                <span className={`manager-decision-tag ${tone}`}>{label}</span>
                <strong>Indisponível</strong><small>{detail}</small>
              </article>)}
            </section>
            {globalFiltersEnabled && <section className="manager-global-filters fiscal-panel" aria-label="Filtros globais da carteira">
              <div className="manager-global-grid">
                <label>Fiscal
                  <select value={globalFilters.fiscal} disabled={baseInspectors === null}
                    onChange={event => setGlobalFilters(current => ({ ...current, fiscal: event.target.value }))}>
                    <option value="">Todos os fiscais</option>
                    {baseInspectors?.map(fiscal => <option key={fiscal.userId} value={fiscal.userId}>
                      {inspectorName(fiscal)}</option>)}
                  </select>
                </label>
                <label>Gerência
                  <select disabled value=""><option value="">Todas as gerências</option></select>
                  <small>Fonte de gerências não aprovada</small>
                </label>
                <label>Risco: Saldo ou Vigência
                  <select value={globalFilters.risk} disabled={baseSummary?.data.contractRiskMatrix === null}
                    onChange={event => setGlobalFilters(current => ({ ...current, risk: event.target.value }))}>
                    <option value="">Todos os riscos</option>
                    {Object.entries(riskLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <label>Janela de vencimento
                  <select value={globalFilters.days}
                    onChange={event => setGlobalFilters(current => ({ ...current, days: Number(event.target.value) as 90 | 180 | 365 }))}>
                    <option value={90}>Próximos 90 dias</option>
                    <option value={180}>Próximos 180 dias</option>
                    <option value={365}>Próximos 365 dias</option>
                  </select>
                </label>
                <label>Buscar fiscal, contrato ou fornecedor
                  <input type="search" value={globalFilters.search} placeholder="Buscar fiscal, contrato ou fornecedor..."
                    onChange={event => setGlobalFilters(current => ({ ...current, search: event.target.value }))} />
                </label>
              </div>
              <p role="status">{selectedIds === null ? 'Recorte indisponível para esta referência ou fonte.' :
                `${selectedIds.size} de ${baseSummary?.data.contracts?.length ?? 0} contratos no recorte global. `}
                Janela selecionada: da data de referência (D0) até D+{globalFilters.days} dias, inclusive;
                o padrão é 180 dias. Os indicadores e painéis abaixo seguem este recorte quando há dados suficientes.
              </p>
            </section>}
            {selectionUnavailable ? <p className="panel-unavailable" role="status">
              Não é possível determinar o recorte global com as fontes disponíveis. Ajuste os filtros ou consulte a cobertura dos dados.
            </p> : <>

            {summary.meta.dataCoverage.activeContracts === 'AVAILABLE' && summary.data.cards.activeContracts === 0 && (
              <p className="empty-contracts" role="status">
                Nenhum contrato vigente no recorte global da carteira.
              </p>
            )}
            {summary.meta.dataCoverage.activePortfolioValue === 'UNAVAILABLE' && (
              <p className="coverage-note" role="status">
                Valor do recorte global indisponível: há valor contratual ausente ou a fotografia histórica não pode ser
                reconstruída.
              </p>
            )}

            <div className="manager-focus-grid manager-first-grid">
<section className="fiscal-panel manager-fiscals-panel">
                <div className="panel-heading">
                  <h2>Carga, criticidade e desempenho por fiscal</h2>
                  <p>Barras: contratos vigentes e críticos. Linha: ações concluídas no prazo; séries sem fonte aprovada ficam indisponíveis.</p>
                  <details className="manager-fiscal-explanation">
                    <summary>Como são contados contratos e OS</summary>
                    <p>
                      Contratos vigentes designados e OS com decisão fiscal pendente. OS pendentes são
                      vinculadas aos contratos da carteira do fiscal e não representam necessariamente
                      atribuições individuais. Uma mesma OS pode aparecer para fiscais diferentes; as
                      contagens não devem ser somadas como OS únicas da carteira gerencial.
                    </p>
                  </details>
                </div>
                <ManagerCombinedChart inspectors={state.status === 'success' && state.loadError ? null : sortedInspectors} />
                {state.status === 'success' && state.loadError && <p role="alert">Erro ao carregar distribuição dos fiscais: {state.loadError}</p>}
                <details className="manager-operational-details"><summary>Ver contagens operacionais e explicações</summary>
                {state.status === 'success' && state.loadError ? (
                  <p role="alert">Erro ao carregar distribuição dos fiscais: {state.loadError}</p>
                ) : sortedInspectors === null ? (
                  <p role="status">Distribuição dos fiscais indisponível para esta referência.</p>
                ) : sortedInspectors.length === 0 ? (
                  <p role="status">Nenhum fiscal designado na carteira.</p>
                ) : subset ? (
                  <>
                    <p role="status">OS pendentes por fiscal indisponíveis no recorte: a resposta de carga não associa cada OS a um contrato.</p>
                    <div className="fiscal-table-wrap"><table><thead><tr><th>Fiscal</th><th>Contratos vigentes no recorte</th><th>OS pendentes</th></tr></thead>
                      <tbody>{sortedInspectors.map(fiscal => <tr key={fiscal.userId}><td>{inspectorName(fiscal)}</td>
                        <td>{fiscal.activeContracts}</td><td>Indisponível</td></tr>)}</tbody></table></div>
                  </>
                ) : (
                  <>
                    <FiscalLoadChart inspectors={sortedInspectors} />
                    <div className="fiscal-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Fiscal</th>
                            <th>Contratos vigentes</th>
                            <th>OS pendentes</th>
                            <th>Capacidade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedInspectors.map((fiscal) => (
                            <tr key={fiscal.userId}>
                              <td>{inspectorName(fiscal)}</td>
                              <td>{fiscal.activeContracts}</td>
                              <td>{fiscal.pendingOrders}</td>
                              <td>Indisponível</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                </details>
              </section>
<section className="fiscal-panel manager-quality-panel">
                <div className="panel-heading">
                  <h2>Qualidade preventiva da gestão</h2>
                  <p>Mede a disciplina operacional antes da materialização dos riscos.</p>
                </div>
                <ManagerPreventiveRadar completeness={summary.meta.dataCoverage.registrationCompleteness === 'AVAILABLE'
                  ? summary.data.preventiveQuality.registrationCompleteness?.percentage ?? null : null} />
                <details className="manager-quality-details"><summary>Ver medidas preventivas disponíveis</summary>
                <div className="manager-quality-visual">
                  <QualityBar
                    label="Dados completos"
                    value={
                      summary.meta.dataCoverage.registrationCompleteness === 'AVAILABLE'
                        ? (summary.data.preventiveQuality.registrationCompleteness?.percentage ?? null)
                        : null
                    }
                  />
                  <QualityBar
                    label="Decisões D-90"
                    value={
                      summary.meta.dataCoverage.renewalDecisionsD90 === 'AVAILABLE'
                        ? (summary.data.preventiveQuality.renewalDecisionsD90?.percentage ?? null)
                        : null
                    }
                  />
                </div>
                </details>
              </section>
            </div>
            <div className="manager-focus-grid manager-second-grid">
<section className="fiscal-panel manager-risk-panel">
                <div className="panel-heading">
                  <h2>Matriz Contrato × Dimensão de Risco</h2>
                  <p>
                    Contratos do recorte global: classificação por itens e prazo até o fim da vigência. Demais dimensões
                    aguardam fonte aprovada.
                  </p>
                </div>
                {matrix !== null && matrix !== undefined && (
                  <details className="manager-matrix-filter-details"><summary>Filtrar matriz</summary>
                  <div className="manager-matrix-controls">
                    <label>
                      Contrato ou fornecedor
                      <input
                        type="search"
                        value={matrixSearch}
                        onChange={(event) => setMatrixSearch(event.target.value)}
                        placeholder="Buscar contrato ou fornecedor"
                      />
                    </label>
                    <label>
                      Dimensão
                      <select
                        value={matrixDimension}
                        onChange={(event) => setMatrixDimension(event.target.value)}
                      >
                        <option value="all">Todas as dimensões</option>
                        <option value="saldo">Saldo</option>
                        <option value="vigencia">Vigência</option>
                        <option value="sla">SLA</option>
                        <option value="medicao">Medição</option>
                        <option value="pagamento">Pagamento</option>
                        <option value="indice">Índice</option>
                      </select>
                    </label>
                    <label>
                      Classificação
                      <select value={matrixClass} onChange={(event) => setMatrixClass(event.target.value)}>
                        <option value="all">Todas as classificações</option>
                        <option value="CRITICAL">Crítico</option>
                        <option value="ATTENTION">Atenção</option>
                        <option value="OK">OK</option>
                        <option value="UNAVAILABLE">Indisponível</option>
                      </select>
                    </label>
                  </div>
                  </details>
                )}
                {matrix !== null && matrix !== undefined && (
                  <div className="manager-matrix-counts" role="status">
                    <span>
                      {matrixRows.length} de {matrix.length} contratos
                    </span>
                    <span className="manager-count-critical">Crítico {matrixCounts.CRITICAL}</span>
                    <span className="manager-count-attention">Atenção {matrixCounts.ATTENTION}</span>
                    <span className="manager-count-ok">OK {matrixCounts.OK}</span>
                    <span className="manager-count-unavailable">Indisponível {matrixCounts.UNAVAILABLE}</span>
                    <small>Células nas dimensões selecionadas · ordem pela classificação mais crítica</small>
                  </div>
                )}
                {summary.meta.dataCoverage.contractRiskMatrix === 'UNAVAILABLE' ||
                summary.data.contractRiskMatrix === null ? (
                  <div className="panel-unavailable" role="status">
                    Matriz indisponível para esta referência.
                  </div>
                ) : summary.data.contractRiskMatrix.length === 0 ? (
                  <p className="table-empty" role="status">
                    Nenhum contrato vigente no recorte global.
                  </p>
                ) : matrixRows.length === 0 ? (
                  <p className="table-empty" role="status">
                    Nenhum contrato encontrado com os filtros da matriz.
                  </p>
                ) : (
                  <div className="fiscal-table-wrap manager-risk-scroll">
                    <table className="manager-risk-table">
                      <caption className="visually-hidden">Risco por contrato e dimensão</caption>
                      <thead>
                        <tr>
                          <th scope="col">Contrato</th>
                          <th scope="col">Saldo</th>
                          <th scope="col">Vigência</th>
                          <th scope="col">SLA</th>
                          <th scope="col">Medição</th>
                          <th scope="col">Pagamento</th>
                          <th scope="col">Índice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrixRows.map((row) => (
                          <tr key={row.contractId}>
                            <th scope="row">
                              {row.contractNumber ?? `Contrato ID ${row.contractId}`}
                              <small>{row.supplierName ?? 'Fornecedor indisponível'}</small>
                            </th>
                            {dimensions.map((dimension) => riskCell(row, dimension))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div
                  id="manager-risk-detail"
                  className="manager-risk-detail"
                  aria-live="polite"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      selectedCellRef.current?.focus();
                      setSelectedRisk(null);
                    }
                  }}
                >
                  {selectedRisk && selectedRow ? (
                    <>
                      <div className="manager-risk-detail-head">
                        <h3>Detalhes da célula selecionada</h3>
                        <button
                          type="button"
                          onClick={() => {
                            selectedCellRef.current?.focus();
                            setSelectedRisk(null);
                          }}
                        >
                          Fechar detalhes
                        </button>
                      </div>
                      <dl>
                        <div>
                          <dt>Contrato</dt>
                          <dd>{selectedRow.contractNumber ?? `Contrato ID ${selectedRow.contractId}`}</dd>
                        </div>
                        <div>
                          <dt>Fornecedor</dt>
                          <dd>{selectedRow.supplierName ?? 'Indisponível'}</dd>
                        </div>
                        <div>
                          <dt>Dimensão</dt>
                          <dd>{dimensionLabels[selectedRisk.dimension]}</dd>
                        </div>
                        <div>
                          <dt>Classificação</dt>
                          <dd>{riskLabels[matrixStatus(selectedRow, selectedRisk.dimension)]}</dd>
                        </div>
                        {selectedRisk.dimension === 'saldo' && selectedRow.saldo.reason && (
                          <div>
                            <dt>Motivo de indisponibilidade</dt>
                            <dd>{balanceReasonLabels[selectedRow.saldo.reason]}</dd>
                          </div>
                        )}
                        {selectedRisk.dimension === 'saldo' && selectedRow.saldo.partialCoverage && (
                          <div>
                            <dt>Cobertura parcial</dt>
                            <dd>Há itens não verificáveis</dd>
                          </div>
                        )}
                        {selectedRisk.dimension === 'vigencia' && selectedRow.vigencia === 'UNAVAILABLE' && (
                          <div>
                            <dt>Motivo de indisponibilidade</dt>
                            <dd>Data de fim da vigência indisponível</dd>
                          </div>
                        )}
                        {selectedRisk.dimension !== 'saldo' && selectedRisk.dimension !== 'vigencia' && (
                          <div>
                            <dt>Motivo de indisponibilidade</dt>
                            <dd>Fonte aprovada indisponível para esta dimensão</dd>
                          </div>
                        )}
                      </dl>
                    </>
                  ) : null}
                </div>
              </section>
<section className="fiscal-panel manager-strategic">
                <div className="panel-heading">
                  <h2>Fornecedores estratégicos: valor × risco</h2>
                  <p>Classe ABC, participação e tendência de ocorrências.</p>
                </div>
                <figure className="manager-strategic-chart" aria-label="Fornecedores estratégicos: valor por risco indisponível">
                  <div className="manager-strategic-plot" aria-hidden="true" />
                  <figcaption>Indisponível: valor de pagamentos em 12 meses, classe ABC, risco e tendência sem fonte e regra aprovadas.</figcaption>
                </figure>
              </section>
            </div>
            <section className="fiscal-panel manager-interventions">
              <div className="panel-heading">
                <h2>Intervenções gerenciais priorizadas</h2>
                <p>Ocorrências verificáveis por contrato, sem classificação de prioridade. Impacto, antecedência e prazo sem fonte aprovada.</p>
              </div>
              <p className="source-note" role="status">{occurrenceCoverage(occurrences)}</p>
              <div className="fiscal-table-wrap">
                <table>
                  <thead><tr>
                    <th scope="col">Prior.</th><th scope="col">Fiscal</th>
                    <th scope="col">Contrato / fornecedor</th><th scope="col">Sinal antecipado</th>
                    <th scope="col">Impacto</th><th scope="col">Antecedência</th>
                    <th scope="col">Ação gerencial</th><th scope="col">Prazo</th>
                  </tr></thead>
                  <tbody>{occurrences.rows.length ? occurrences.rows.map((row, index) => <tr key={row.key} data-occurrence-id={row.key} data-contract-id={row.contractId}
                    className={index === 0 || occurrences.rows[index - 1].contractId !== row.contractId ? 'manager-occurrence-group-start' : undefined}>
                    <td>Indisponível</td><td>Indisponível</td>
                    <td><strong>{row.contractNumber ?? `Contrato ID ${row.contractId}`}</strong>{row.supplierName && <><br />{row.supplierName}</>}</td>
                    <td><strong>{row.signal}</strong><br />{row.detail}</td>
                    <td>Indisponível</td><td>Indisponível</td>
                    <td>{genericEvaluation}<small className="manager-occurrence-note">{genericEvaluationNote}</small></td>
                    <td>Indisponível</td>
                  </tr>) : <tr><td colSpan={8} className="table-empty" role="status">{occurrenceEmptyMessage(occurrences)}</td></tr>}</tbody>
                </table>
              </div>
            </section>
            <div className="manager-abc-grid manager-abc-pair">
<section className="fiscal-panel manager-suppliers">
                <div className="panel-heading">
                  <h2>Curva ABC dos principais fornecedores</h2>
                  <p>
                    Base: pagamentos efetivos dos últimos 12 meses. Classificação, participação e tendência aguardam fonte e regra aprovadas.
                  </p>
                </div>
                <div className="manager-abc-note" role="status">
                  <strong>Classificação ABC indisponível</strong>
                  <span>Base necessária: pagamentos efetivos dos últimos 12 meses e regra aprovada.</span>
                </div>
                <div className="fiscal-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Classe</th><th>Fornecedor</th><th>Valor 12m</th><th>%</th>
                        <th>% acum.</th><th>Contratos</th><th>Risco</th><th>Tendência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subset ? (
                        <tr><td colSpan={8} className="table-empty">Curva ABC indisponível no recorte global: a resposta não vincula pagamentos aos contratos selecionados.</td></tr>
                      ) : state.status === 'success' && !state.suppliersLoading && !state.suppliersError && state.suppliers?.data.suppliers?.length ? (
                        state.suppliers.data.suppliers.map((supplier) => (
                          <tr key={supplier.supplierId}>
                            <td>Indisponível</td><td>{supplier.name.length > 28 ?
                              <details className="manager-supplier-name"><summary title={supplier.name} aria-label={`Fornecedor ${supplier.name}`}>
                                {supplier.name}</summary><span>{supplier.name}</span></details> : supplier.name}</td><td>Indisponível</td>
                            <td>Indisponível</td><td>Indisponível</td><td>Indisponível</td>
                            <td>Indisponível</td><td>Indisponível</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="table-empty">
                            {state.status === 'success' && state.suppliersLoading
                              ? 'Carregando fornecedores…'
                              : state.status === 'success' && state.suppliersError
                              ? `Erro ao carregar fornecedores: ${state.suppliersError}`
                              : state.status === 'success' && state.suppliers?.data.suppliers?.length === 0
                                ? 'Nenhum fornecedor na carteira'
                                : 'Indisponível'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!subset && <nav className="manager-supplier-pagination" aria-label="Paginação de fornecedores">
                  <span role="status">{state.status === 'success' && state.suppliersLoading ? 'Carregando fornecedores…' :
                    state.status === 'success' && state.suppliersError ? 'Total de fornecedores indisponível.' :
                    supplierTotal === null ? 'Total de fornecedores indisponível.' :
                    `${supplierStart}–${supplierEnd} de ${supplierTotal} fornecedores`}</span>
                  <div>
                    <button type="button" disabled={!onSuppliersPageChange || state.status !== 'success' || supplierPage <= 1}
                      onClick={() => onSuppliersPageChange?.(supplierPage - 1)}>Anterior</button>
                    <button type="button" disabled={!onSuppliersPageChange || state.status !== 'success' || !!state.suppliersLoading ||
                      supplierPageCount === null || supplierPage >= supplierPageCount}
                      onClick={() => onSuppliersPageChange?.(supplierPage + 1)}>Próxima</button>
                    {state.status === 'success' && state.suppliersError && onSuppliersRetry &&
                      <button type="button" onClick={onSuppliersRetry}>Tentar novamente</button>}
                  </div>
                </nav>}
                <details className="manager-supplier-details"><summary>Ver valores vigentes verificáveis</summary>
                  <p>Valor vigente não equivale a pagamentos acumulados em 12 meses nem determina classe ABC.</p>
                  {subset ? <p role="status">Valores vigentes por fornecedor indisponíveis no recorte global.</p>
                    : state.status === 'success' && !state.suppliersLoading && !state.suppliersError && state.suppliers?.data.suppliers?.length ?
                      <div className="fiscal-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Valor vigente</th></tr></thead>
                        <tbody>{state.suppliers.data.suppliers.map(supplier => <tr key={supplier.supplierId}>
                          <td>{supplier.name}</td><td>{money(supplier.vigentValue)}</td></tr>)}</tbody></table></div> :
                      <p role="status">Valores vigentes indisponíveis.</p>}
                </details>
              </section>
<section className="fiscal-panel manager-band-distribution">
                <div className="panel-heading">
                  <h2>Distribuição dos itens por faixa de saldo</h2>
                  <p>Resultado atualizado conforme os filtros locais aplicados.</p>
                </div>
                <BandDistribution
                  distribution={distribution}
                  available={itemBalances?.coverage === 'AVAILABLE'}
                  hasItems={items.length > 0}
                  emptyWithoutItemsMessage="Nenhum item contratual disponível no recorte global atual."
                  title="Distribuição dos itens por faixa de saldo"
                  scope="Fornecedor, contrato, faixa e busca aplicados."
                  outerRadius={96}
                />
              </section>
            </div>
<section className="fiscal-panel fiscal-saldos">
              <div className="panel-heading">
                <h2>Gestão dos Saldos dos Itens Contratuais</h2>
                <p>
                  Itens dos contratos no recorte global da carteira autorizada; filtros locais não alteram os indicadores globais nem os
                  saldos por contrato.
                </p>
              </div>
              {itemBalances?.coverage === 'AVAILABLE' ? (
                <>
                  <div className="saldo-summary manager-saldo-kpis" aria-label="Indicadores dos saldos dos itens">
                    <div><span>Total contratado</span><strong>{aggregates.totalContratado === null ? 'Indisponível' : currency(aggregates.totalContratado)}</strong>
                      <small>{aggregates.contractedValueRows} de {filteredItems.length} itens cobertos</small></div>
                    <div><span>Saldo disponível</span><strong>{aggregates.saldoComprometido === null ? 'Indisponível' : currency(aggregates.saldoComprometido)}</strong>
                      <small>Saldo comprometido · {aggregates.committedBalanceRows} de {filteredItems.length} itens cobertos</small></div>
                    <div><span>Saldo consolidado</span><strong>Indisponível</strong><small>Percentual agregado sem regra aprovada</small></div>
                    <div><span>Itens críticos</span><strong>{distribution.critico}</strong><small>Faixa crítica verificável no recorte</small></div>
                  </div>
                  <p className="manager-saldo-coverage" role="status">Cobertura do recorte: {filteredItems.length} de {items.length} itens; total contratado {aggregates.contractedValueRows}/{filteredItems.length}, saldo comprometido {aggregates.committedBalanceRows}/{filteredItems.length}, saldo medido {aggregates.measuredBalanceRows}/{filteredItems.length}.</p>
                  {items.length === 0 ? (
                    <p className="manager-saldo-coverage" role="status">Os totais zerados representam um recorte sem itens; não comprovam saldo contratual zero.</p>
                  ) : filteredItems.length === 0 ? (
                    <p className="manager-saldo-coverage" role="status">Os totais zerados representam filtros locais sem resultados.</p>
                  ) : null}
                  <div className="fiscal-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Fiscal</th>
                          <th>Contrato / fornecedor</th>
                          <th>Item</th>
                          <th>Total</th>
                          <th>Executado</th>
                          <th>Saldo</th>
                          <th>% saldo</th>
                          <th>Direcionamento gerencial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.length ? (
                          filteredItems.map((item) => {
                            const quantity = itemBalances.criterio.dimensao === 'quantidade';
                            const total = quantity ? item.quantityContracted : item.valueContracted;
                            const measuredBase = itemBalances.criterio.base === 'medido';
                            const executed = quantity
                              ? measuredBase
                                ? total === null
                                  ? null
                                  : item.quantityMeasured
                                : item.quantityConsumed
                              : measuredBase
                                ? total === null
                                  ? null
                                  : item.valueMeasured
                                : item.valueConsumed;
                            const balance = measuredBase
                              ? quantity
                                ? item.quantityMeasuredBalance
                                : item.valueMeasuredBalance
                              : quantity
                                ? item.quantityBalance
                                : item.valueBalance;
                            const balancePercent = measuredBase ? item.pctSaldoMedido : item.pctSaldo;
                            const bandLabel = { adequado: 'Adequado', atencao: 'Atenção', critico: 'Crítico', nao_verificavel: 'Não verificável' }[item.faixa];
                            const format = quantity
                              ? (value: number | null) =>
                                  value === null ? 'Não calculável' : `${value} ${item.unit ?? ''}`
                              : (value: number | null) => (value === null ? 'Indisponível' : currency(value));
                            return (
                              <tr key={item.itemId}>
                                <td><span className={`manager-saldo-status ${item.faixa}`}>{bandLabel}</span>
                                  {(item.statusVerificacao || item.blockedAt) && <details className="manager-saldo-row-details"><summary>Ver detalhes</summary>
                                    {item.statusVerificacao && <small>Verificação: {item.statusVerificacao}</small>}
                                    {item.blockedAt && <small>Bloqueado: {item.blockReason ?? 'motivo indisponível'}</small>}
                                  </details>}
                                </td>
                                <td>{fiscalNamesForContract(item.contractId)}</td>
                                <td>
                                  {item.contractNumber ?? `Contrato ID ${item.contractId}`}
                                  <br />
                                  {item.supplierName ?? 'Fornecedor indisponível'}
                                </td>
                                <td>
                                  {item.sequence ?? '—'} · {item.specification ?? 'Sem especificação'}
                                </td>
                                <td>{format(total)}</td>
                                <td>{format(executed)}</td>
                                <td>
                                  {format(balance)}
                                  {balance !== null && balance < 0 && <strong> · Saldo negativo</strong>}
                                </td>
                                <td>
                                  {balancePercent === null ? 'Indisponível' : <>
                                    <div className={`manager-saldo-progress ${item.faixa}`} role="img" aria-label={`${bandLabel}: ${percentage(balancePercent * 100)} de saldo`}>
                                      <span style={{ width: `${Math.max(0, Math.min(100, balancePercent * 100))}%` }} /></div>
                                    <strong>{percentage(balancePercent * 100)}</strong>
                                  </>}
                                </td>
                                <td>
                                  Indisponível — sem direcionamento individual aprovado
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={9} className="table-empty">
                              {items.length
                                ? 'Nenhum item encontrado com os filtros atuais.'
                                : 'Nenhum item contratual disponível no recorte global atual.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <details className="manager-saldo-tools"><summary>Filtros, busca e informações da consulta</summary>
                  <div className="saldo-filters" aria-label="Filtros dos saldos contratuais">
                    <label>
                      Fornecedor
                      <select
                        value={supplier}
                        onChange={(event) => setFilter({ supplier: event.target.value })}
                      >
                        <option value="">Todos os fornecedores</option>
                        {missingSupplier && <option value={supplier}>Fornecedor selecionado (fora do recorte global)</option>}
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
                        {missingContract && <option value={contract}>Contrato selecionado (fora do recorte global)</option>}
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
                  <div className="saldo-filter-meta">
                    <span role="status">
                      {filteredItems.length} de {items.length} itens encontrados
                    </span>
                    <button type="button" onClick={clearFilters} disabled={!activeFilters}>
                      Limpar todos os filtros
                    </button>
                  </div>
                    <div className="manager-saldo-secondary-measures"><span>Saldo medido dos itens: {aggregates.saldoMedido === null ? 'Indisponível' : currency(aggregates.saldoMedido)}</span><span>Não verificáveis: {distribution.nao_verificavel}</span></div>
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
                  <p>
                    Distribuição por faixa: Adequado: {distribution.adequado} · Atenção:{' '}
                    {distribution.atencao} · Crítico: {distribution.critico} · Não verificável:{' '}
                    {distribution.nao_verificavel}
                  </p>
                  </details>
                </>
              ) : (
                <div className="panel-unavailable" role="status">
                  Fonte de saldos por item indisponível para esta data.
                </div>
              )}
            </section>
<section className="fiscal-panel manager-cycle">
              <div className="panel-heading">
                <h2>Eficiência do Ciclo Financeiro — carteira gerenciada</h2>
                <p>Etapas entre faturamento, medição e pagamento.</p>
              </div>
              <div className="manager-cycle-flow" aria-label="Etapas do ciclo financeiro">
                {[
                  'Faturado clientes',
                  'A receber',
                  'Recebido ETICE',
                  'Medição fornecedor',
                  'Processando pagamento',
                  'Programado',
                  'Pago fornecedor',
                ].map((phase) => (
                  <div key={phase}>
                    <span>{phase}</span>
                    <strong>Indisponível</strong>
                  </div>
                ))}
              </div>
              <p className="source-note" role="status">
                Volumes e tempos por etapa indisponíveis: não há fonte e regra aprovadas para este ciclo.
              </p>
            </section>
            </>}
          </>
        )}
      </div>
    </main>
  );
}
export function ManagerDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierRequest, setSupplierRequest] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      loadManagerSummary(),
      loadManagerFiscalLoad()
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({
          value: null,
          error: error instanceof Error ? error.message : 'Falha na consulta',
        })),
    ])
      .then(([summary, load]) => {
        if (active)
          setState({
            status: 'success',
            summary,
            load: load.value,
            loadError: load.error,
            suppliersLoading: true,
            suppliersPage: 1,
          });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Falha na consulta',
          });
      });
    return () => {
      active = false;
    };
  }, []);
  const summaryReady = state.status === 'success';
  useEffect(() => {
    if (!summaryReady) return;
    let active = true;
    setState(current => current.status === 'success' ? { ...current, suppliersPage: supplierPage,
      suppliers: null, suppliersError: null, suppliersLoading: true } : current);
    loadManagerSuppliers(supplierPage).then(value => {
      if (!active) return;
      const total = value.meta.pagination.totalItems;
      const lastPage = total === null ? null : Math.max(1, Math.ceil(total / 25));
      if (lastPage !== null && supplierPage > lastPage) { setSupplierPage(lastPage); return; }
      setState(current => current.status === 'success' ? { ...current, suppliers: value,
        suppliersError: null, suppliersLoading: false } : current);
    }).catch((error: unknown) => {
      if (active) setState(current => current.status === 'success' ? { ...current, suppliers: null,
        suppliersError: error instanceof Error ? error.message : 'Falha na consulta', suppliersLoading: false } : current);
    });
    return () => { active = false; };
  }, [summaryReady, supplierPage, supplierRequest]);
  return <ManagerDashboardView state={state} globalFiltersEnabled onSuppliersPageChange={setSupplierPage}
    onSuppliersRetry={() => setSupplierRequest(current => current + 1)} />;
}
