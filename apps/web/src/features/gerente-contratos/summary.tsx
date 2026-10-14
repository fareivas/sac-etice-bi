import { DashboardTabs } from '../dashboard-tabs';
import { alertAgeDays, alertContractLabel, downloadManagerAlertsCsv, formatAlertRegistered, useManagerContractAlerts } from './contract-alerts';
import { BandDistribution } from '../item-balances/band-distribution';
import { useEffect, useRef, useState } from 'react';
import type {
  ManagerDashboardSummaryResponse,
  ManagerFiscalLoadResponse,
  ManagerSuppliersResponse,
} from '@sac-etice-bi/contracts';
import { loadManagerSummary, loadManagerFiscalLoad, loadManagerSuppliers } from '../../lib/api';
import { displayDate } from '../../lib/display-date';
import { useItemBalanceFilters } from '../item-balances/use-item-balance-filters';
import { initialGlobalFilters, projectManagerSummary, selectGlobalContracts } from './global-filters';

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

export function PortfolioFinancialChart({
  balances,
}: {
  balances: NonNullable<ManagerDashboardSummaryResponse['data']['contractBalances']>;
}) {
  const values = balances.flatMap((item) => [item.contractedValue, item.consumedValue, item.balanceValue]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const scale = (value: number) => 200 + ((value - min) / (max - min || 1)) * 360;
  const origin = scale(0);
  const series = [
    { key: 'contractedValue', label: 'Contratado', opacity: 1 },
    { key: 'consumedValue', label: 'Consumido', opacity: 0.65 },
    { key: 'balanceValue', label: 'Saldo', opacity: 0.35 },
  ] as const;
  return (
    <div className="fiscal-table-wrap">
      <svg
        style={{ minWidth: 640, display: 'block' }}
        viewBox={`0 0 800 ${balances.length * 110 + 30}`}
        width="100%"
        role="img"
        aria-label="Distribuição financeira por contrato"
      >
        <title>Distribuição financeira por contrato: contratado, consumido e saldo em reais</title>
        {balances.map((item, index) => (
          <g key={item.contractId}>
            <text x="8" y={index * 110 + 20} fontSize="14">
              {item.contractNumber ?? `#${item.contractId}`}
            </text>
            {series.map((entry, row) => {
              const value = item[entry.key];
              const y = index * 110 + row * 28 + 30;
              return (
                <g key={entry.key}>
                  <title>{`${entry.label}: ${currency(value)}`}</title>
                  <text x="8" y={y + 15} fontSize="12">
                    {entry.label}
                  </text>
                  <rect
                    x={Math.min(origin, scale(value))}
                    y={y}
                    width={Math.abs(scale(value) - origin)}
                    height="18"
                    fill="currentColor"
                    opacity={entry.opacity}
                  />
                  <text x="575" y={y + 15} fontSize="12">
                    {currency(value)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

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
export function ManagerDashboardView({ state, globalFiltersEnabled = false }: { state: State; globalFiltersEnabled?: boolean }) {
  const [globalFilters, setGlobalFilters] = useState(initialGlobalFilters);
  const baseSummary = state.status === 'success' ? state.summary : null;
  const selectedIds = globalFiltersEnabled && baseSummary
    ? selectGlobalContracts(baseSummary, state.status === 'success' ? state.load : null, globalFilters) : null;
  const selectionUnavailable = globalFiltersEnabled && baseSummary !== null && selectedIds === null;
  const projection = baseSummary && selectedIds ? projectManagerSummary(baseSummary, selectedIds) : null;
  const summary = projection?.summary ?? baseSummary;
  const subset = projection?.subset ?? false;
  const baseInspectors = state.status === 'success' && state.load?.meta.dataCoverage.inspectors === 'AVAILABLE'
    ? state.load.data.inspectors : null;
  const inspectors =
    state.status === 'success' && state.load?.meta.dataCoverage.inspectors === 'AVAILABLE'
      ? state.load.data.inspectors
      : null;
  const sortedInspectors = inspectors === null ? null : orderedInspectors(subset && selectedIds
    ? inspectors.filter(item => item.contractIds?.some(id => selectedIds.has(id)))
      .map(item => ({ ...item, activeContracts: item.contractIds?.filter(id => selectedIds.has(id) &&
        summary?.data.contracts?.some(contract => contract.contractId === id)).length ?? 0 })) : inspectors);
  const itemBalances = summary?.data.itemBalances;
  const context = summary
    ? JSON.stringify([
        baseSummary!.data.manager.userId,
        [...baseSummary!.meta.filtersApplied.contratoId].sort((a, b) => a - b),
      ])
    : null;
  const alertContext = summary ? JSON.stringify([
    baseSummary!.data.manager.userId,
    [...baseSummary!.meta.filtersApplied.contratoId].sort((a, b) => a - b),
    baseSummary!.meta.dataReference,
  ]) : null;
  const contractAlerts = useManagerContractAlerts(summary?.data.contractAlerts, alertContext);
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
            <p>Visão agregada de contratos, fiscais, riscos e intervenções</p>
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
            <section className="fiscal-filters" aria-label="Escopo da carteira">
              <div>
                <strong>Carteira autorizada</strong>
                <span>Designações atuais do gestor</span>
              </div>
              <div className="filter-values">
                <span>
                  Contrato:{' '}
                  {summary.meta.filtersApplied.contratoId.length
                    ? summary.meta.filtersApplied.contratoId.join(', ')
                    : 'Todos'}
                </span>
              </div>
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
            </p> : <DashboardTabs id="manager" main={<>
            <section className="fiscal-kpis manager-kpis" aria-label="Indicadores executivos">
              <article className="fiscal-kpi">
                <span>Contratos monitorados</span>
                <strong>{summary.meta.dataCoverage.activeContracts === 'AVAILABLE' ? count(summary.data.cards.activeContracts) : 'Indisponível'}</strong>
                <small>Contratos vigentes da carteira autorizada no recorte global</small>
              </article>
              <article className="fiscal-kpi">
                <span>Contratos críticos</span>
                <strong>{count(criticalContracts)}</strong>
                <small>Ao menos uma dimensão crítica na matriz do recorte global; não há índice geral aprovado</small>
              </article>
              <article className="fiscal-kpi">
                <span>Valor contratado</span>
                <strong>
                  {summary.meta.dataCoverage.activePortfolioValue !== 'AVAILABLE' || summary.data.cards.activePortfolioValue === null
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
                <small>Sem indicador agregado aprovado; veja os alertas abaixo</small>
              </article>
            </section>
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
            <div className="manager-focus-grid">
              <section className="fiscal-panel manager-risk-panel">
                <div className="panel-heading">
                  <h2>Matriz Contrato × Dimensão de Risco</h2>
                  <p>
                    Contratos do recorte global: classificação por itens e prazo até o fim da vigência. Demais dimensões
                    aguardam fonte aprovada.
                  </p>
                </div>
                {matrix !== null && matrix !== undefined && (
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
              <section className="fiscal-panel manager-fiscals-panel">
                <div className="panel-heading">
                  <h2>Carga e risco por fiscal</h2>
                  <p>
                    Fiscais e distribuição da carteira no recorte global. Risco agregado indisponível; contagens operacionais
                    verificáveis abaixo.
                  </p>
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
              </section>
            </div>
            <section className="fiscal-panel">
              <div className="panel-heading">
                <h2>Intervenções e pendências contratuais</h2>
                <p>
                  Pendências abertas ou em tratamento dos contratos no recorte global. Vencimento contratual não é prazo da pendência;
                  a ordenação por contrato e registro não representa prioridade.
                </p>
              </div>
              {summary.meta.dataCoverage.contractAlerts !== 'AVAILABLE' || summary.data.contractAlerts === null ? (
                <div className="panel-unavailable" role="status">Pendências contratuais indisponíveis para esta referência.</div>
              ) : (
                <>
                  <div className="manager-alert-controls" role="group" aria-label="Filtros das pendências contratuais">
                    <label>Contrato
                      <select value={contractAlerts.contract} onChange={event => contractAlerts.setFilter({ contract: event.target.value })}>
                        <option value="">Todos os contratos</option>
                        {contractAlerts.missingContract && <option value={contractAlerts.contract}>Contrato selecionado (não disponível na resposta)</option>}
                        {contractAlerts.contracts.map(([id, number]) => <option key={id} value={id}>{number ?? `Contrato ID ${id}`}</option>)}
                      </select>
                    </label>
                    <label>Tipo
                      <select value={contractAlerts.type} onChange={event => contractAlerts.setFilter({ type: event.target.value })}>
                        <option value="">Todos os tipos</option>
                        {contractAlerts.missingType && <option value={contractAlerts.type}>Tipo selecionado (não disponível na resposta)</option>}
                        {contractAlerts.types.map(([key, type]) => <option key={key} value={key}>{type ?? 'Indisponível'}</option>)}
                      </select>
                    </label>
                    <label>Estado
                      <select value={contractAlerts.status} onChange={event => contractAlerts.setFilter({ status: event.target.value })}>
                        <option value="">Todos os estados</option>
                        <option value="aberta">Aberta</option>
                        <option value="em_tratamento">Em tratamento</option>
                      </select>
                    </label>
                    <label>Pesquisar pendências
                      <input type="search" value={contractAlerts.search}
                        onChange={event => contractAlerts.setFilter({ search: event.target.value })}
                        placeholder="Contrato, tipo, estado ou descrição" />
                    </label>
                  </div>
                  <div className="manager-alert-actions">
                    <p role="status">{contractAlerts.visible.length} de {contractAlerts.total} pendências visíveis</p>
                    <div>
                      <button type="button" onClick={contractAlerts.clearFilters} disabled={!contractAlerts.activeFilters}>Limpar filtros</button>
                      <button type="button" disabled={contractAlerts.visible.length === 0}
                        onClick={() => downloadManagerAlertsCsv(contractAlerts.visible, summary.meta.dataReference, summary.meta.timezone)}>
                        Exportar pendências CSV
                      </button>
                    </div>
                  </div>
                  {contractAlerts.total === 0 ? (
                    <p className="table-empty" role="status">Nenhuma pendência contratual no recorte.</p>
                  ) : contractAlerts.visible.length === 0 ? (
                    <p className="table-empty" role="status">Nenhuma pendência encontrada com os filtros atuais.</p>
                  ) : (
                    <div className="manager-alert-groups">
                      {contractAlerts.groups.map(group => (
                        <section className="manager-alert-group" key={group.contractId}>
                          <h3>{alertContractLabel(group)} <small>{group.alerts.length} pendência{group.alerts.length === 1 ? '' : 's'}</small></h3>
                          <div className="fiscal-table-wrap">
                            <table>
                              <caption className="visually-hidden">Pendências do {alertContractLabel(group)}</caption>
                              <thead><tr>
                                <th scope="col">Contrato</th><th scope="col">Tipo</th><th scope="col">Estado</th>
                                <th scope="col">Descrição</th><th scope="col">Data de registro</th>
                                <th scope="col">Vencimento contratual</th>
                              </tr></thead>
                              <tbody>{group.alerts.map(alert => {
                                const age = alertAgeDays(alert.createdAt, summary.meta.dataReference, summary.meta.timezone);
                                return <tr key={alert.alertId}>
                                  <td>{alertContractLabel(alert)}</td>
                                  <td>{alert.type ?? 'Indisponível'}</td>
                                  <td>{alert.status === 'em_tratamento' ? 'Em tratamento' : 'Aberta'}</td>
                                  <td>{alert.description ?? 'Indisponível'}</td>
                                  <td>{formatAlertRegistered(alert.createdAt, summary.meta.timezone)}
                                    {age !== null && <small className="manager-alert-age">Antiguidade: {age} dia{age === 1 ? '' : 's'}</small>}
                                  </td>
                                  <td>{displayDate(alert.expiryDate, summary.meta.timezone)}</td>
                                </tr>;
                              })}</tbody>
                            </table>
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
              {matrix !== null &&
                matrix !== undefined &&
                matrix.filter((row) => row.saldo.status === 'CRITICAL' || row.vigencia === 'CRITICAL')
                  .length > 0 && (
                  <div className="manager-risk-observations">
                    <h3>Observações da matriz</h3>
                    <ul>
                      {matrix
                        .filter((row) => row.saldo.status === 'CRITICAL' || row.vigencia === 'CRITICAL')
                        .map((row) => (
                          <li key={row.contractId}>
                            <strong>{row.contractNumber ?? `Contrato ID ${row.contractId}`}</strong>:{' '}
                            {row.saldo.status === 'CRITICAL' ? 'saldo crítico' : ''}
                            {row.saldo.status === 'CRITICAL' && row.vigencia === 'CRITICAL' ? ' e ' : ''}
                            {row.vigencia === 'CRITICAL' ? 'vigência crítica' : ''}.{' '}
                            <span>Recomendação: avaliar o contrato e o encaminhamento cabível.</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
            </section>
            <div className="manager-insight-grid manager-overview-grid">
                <section className="fiscal-panel">
                  <div className="panel-heading">
                    <h2>Forecast 180 dias</h2>
                    <p>Projeção de saldo e vigência.</p>
                  </div>
                  <div className="manager-unavailable" role="status">
                    <strong>Indisponível</strong>
                    <span>Não há série ou regra aprovada para previsão de 180 dias.</span>
                  </div>
                </section>
                <section className="fiscal-panel manager-exposure-panel">
                  <div className="panel-heading">
                    <h2>Exposição financeira</h2>
                    <p>SLA, glosas, medições e pagamentos.</p>
                  </div>
                  <div className="manager-exposure-rows" role="status">
                    {['SLA / glosas', 'Medições', 'Pagamento'].map((label) => (
                      <div key={label}><span>{label}</span><strong>Indisponível</strong></div>
                    ))}
                  </div>
                  <p className="source-note">Faltam fontes financeiras e regras aprovadas. Saldo contratual não representa exposição.</p>
                </section>
              <section className="fiscal-panel manager-quality-panel">
                <div className="panel-heading">
                  <h2>Qualidade da gestão</h2>
                  <p>Indicadores preventivos disponíveis para o recorte global quando há cobertura suficiente.</p>
                </div>
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
              </section>
            </div>
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
            <div className="manager-abc-grid manager-abc-pair">
              <section className="fiscal-panel manager-suppliers">
                <div className="panel-heading">
                  <h2>Curva ABC de Fornecedores</h2>
                  <p>
                    Fornecedores da carteira no recorte global quando há dados decomponíveis. A classe depende de pagamentos efetivos acumulados em 12 meses e
                    de regra aprovada; valor vigente não determina classe.
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
                        <th>Fornecedor</th>
                        <th>Valor vigente</th>
                        <th>ABC</th>
                        <th>Financeiro em aberto</th>
                        <th>Riscos críticos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subset ? (
                        <tr><td colSpan={5} className="table-empty">Valor por fornecedor indisponível no recorte global: a resposta não vincula os agregados aos contratos selecionados.</td></tr>
                      ) : state.status === 'success' && state.suppliers?.data.suppliers?.length ? (
                        state.suppliers.data.suppliers.map((supplier) => (
                          <tr key={supplier.supplierId}>
                            <td>{supplier.name}</td>
                            <td>{money(supplier.vigentValue)}</td>
                            <td>Indisponível</td>
                            <td>Indisponível</td>
                            <td>Indisponível</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            {state.status === 'success' && state.suppliersError
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
              </section>
              <section className="fiscal-panel">
                <div className="panel-heading">
                  <h2>Curva ABC de Clientes</h2>
                  <p>Relevância econômica dos clientes relacionados à carteira.</p>
                </div>
                <div className="manager-abc-note" role="status">
                  <strong>Classificação ABC indisponível</strong>
                  <span>
                    A resposta atual não fornece recebimentos acumulados de clientes nem classificação
                    corporativa verificável.
                  </span>
                </div>
              </section>
            </div>
            </>} complementary={<>
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
                  <div className="saldo-summary">
                    <div>
                      <span>Total contratado dos itens</span>
                      <strong>
                        {aggregates.totalContratado === null
                          ? 'Indisponível'
                          : currency(aggregates.totalContratado)}
                      </strong>
                    </div>
                    <div>
                      <span>Saldo comprometido dos itens</span>
                      <strong>
                        {aggregates.saldoComprometido === null
                          ? 'Indisponível'
                          : currency(aggregates.saldoComprometido)}
                      </strong>
                    </div>
                    <div>
                      <span>Saldo medido dos itens</span>
                      <strong>
                        {aggregates.saldoMedido === null ? 'Indisponível' : currency(aggregates.saldoMedido)}
                      </strong>
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
                  <p>
                    Distribuição por faixa: Adequado: {distribution.adequado} · Atenção:{' '}
                    {distribution.atencao} · Crítico: {distribution.critico} · Não verificável:{' '}
                    {distribution.nao_verificavel}
                  </p>
                  <div className="fiscal-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Faixa / verificação</th>
                          <th>Contrato / fornecedor</th>
                          <th>Item contratual</th>
                          <th>Total</th>
                          <th>Executado</th>
                          <th>Saldo</th>
                          <th>% saldo</th>
                          <th>Orientação ao gerente</th>
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
                            const format = quantity
                              ? (value: number | null) =>
                                  value === null ? 'Não calculável' : `${value} ${item.unit ?? ''}`
                              : (value: number | null) => (value === null ? 'Indisponível' : currency(value));
                            return (
                              <tr key={item.itemId}>
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
                                  {percentage(
                                    (itemBalances.criterio.base === 'medido'
                                      ? item.pctSaldoMedido
                                      : item.pctSaldo) === null
                                      ? null
                                      : (itemBalances.criterio.base === 'medido'
                                          ? item.pctSaldoMedido!
                                          : item.pctSaldo!) * 100
                                  )}
                                </td>
                                <td>
                                  {item.faixa === 'critico'
                                    ? 'Avaliar saldo e planejamento do item.'
                                    : item.faixa === 'nao_verificavel'
                                      ? 'Conferir dados do item.'
                                      : item.faixa === 'atencao'
                                        ? 'Acompanhar consumo do item.'
                                        : 'Manter acompanhamento do item.'}
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
                <div className="panel-unavailable" role="status">
                  Fonte de saldos por item indisponível para esta data.
                </div>
              )}
            </section>
            <section
              className="dashboard-complementary manager-complementary"
              aria-labelledby="manager-complementary-title"
            >
              <h2 id="manager-complementary-title" className="dashboard-complementary-heading">
                Painéis complementares
              </h2>{' '}
              <section className="manager-secondary-metrics" aria-label="Indicadores contratuais complementares">
                <article className="fiscal-kpi">
                  <span>Vencimento nos próximos 120 dias</span>
                  <strong>{summary.meta.dataCoverage.renewalsWithin120Days === 'AVAILABLE' ? count(summary.data.cards.renewalsWithin120Days) : 'Indisponível'}</strong>
                  <small>Vencimento contratual em até 120 dias dentro do recorte global; sem presumir renovação atrasada</small>
                </article>
                <article className="fiscal-kpi">
                  <span>Alertas contratuais</span>
                  <strong>{summary.meta.dataCoverage.contractAlerts === 'AVAILABLE' && summary.data.contractAlerts !== null ? summary.data.contractAlerts.length : 'Indisponível'}</strong>
                  <small>Pendências abertas ou em tratamento dos contratos no recorte global</small>
                </article>
              </section>
              <section className="fiscal-panel manager-strategic">
                <div className="panel-heading">
                  <h2>Fornecedores estratégicos: valor × risco</h2>
                  <p>Classe ABC, participação e tendência de ocorrências.</p>
                </div>
                <div className="panel-unavailable" role="status">
                  Indisponível: não há fonte e regra aprovadas para classe ABC, risco ou tendência dos
                  fornecedores.
                </div>
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
                  title="Distribuição dos itens por faixa de saldo"
                  scope="Fornecedor, contrato, faixa e busca aplicados."
                  outerRadius={96}
                />
              </section>
              <section className="fiscal-panel manager-quality-details">
                <div className="panel-heading">
                  <h2>Detalhamento dos indicadores preventivos</h2>
                  <p>Indicadores preventivos do recorte global quando a fonte permite apuração.</p>
                </div>
                <div className="manager-quality-grid">
                  <article>
                    <h3>Dados completos</h3>
                    {summary.meta.dataCoverage.registrationCompleteness === 'UNAVAILABLE' ||
                    summary.data.preventiveQuality.registrationCompleteness === null ? (
                      <p role="status">Fonte indisponível para esta referência.</p>
                    ) : (
                      <>
                        {summary.data.preventiveQuality.registrationCompleteness.activeContracts === 0 && (
                          <p role="status">Sem contratos vigentes</p>
                        )}
                        <dl>
                          <div>
                            <dt>Contratos vigentes</dt>
                            <dd>{summary.data.preventiveQuality.registrationCompleteness.activeContracts}</dd>
                          </div>
                          <div>
                            <dt>Contratos completos</dt>
                            <dd>
                              {summary.data.preventiveQuality.registrationCompleteness.completeContracts}
                            </dd>
                          </div>
                          <div>
                            <dt>Sem objeto</dt>
                            <dd>
                              {summary.data.preventiveQuality.registrationCompleteness.missingByField.objeto}
                            </dd>
                          </div>
                          <div>
                            <dt>Sem valor total</dt>
                            <dd>
                              {
                                summary.data.preventiveQuality.registrationCompleteness.missingByField
                                  .valor_total
                              }
                            </dd>
                          </div>
                          <div>
                            <dt>Sem data de assinatura</dt>
                            <dd>
                              {
                                summary.data.preventiveQuality.registrationCompleteness.missingByField
                                  .data_assinatura
                              }
                            </dd>
                          </div>
                          <div>
                            <dt>Sem início da vigência</dt>
                            <dd>
                              {
                                summary.data.preventiveQuality.registrationCompleteness.missingByField
                                  .vigencia_inicio
                              }
                            </dd>
                          </div>
                          <div>
                            <dt>Sem fim da vigência</dt>
                            <dd>
                              {
                                summary.data.preventiveQuality.registrationCompleteness.missingByField
                                  .vigencia_fim
                              }
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}
                  </article>
                  <article>
                    <h3>Decisões D-90</h3>
                    {summary.meta.dataCoverage.renewalDecisionsD90 === 'UNAVAILABLE' ||
                    summary.data.preventiveQuality.renewalDecisionsD90 === null ? (
                      <p role="status">Fonte indisponível para esta referência.</p>
                    ) : (
                      <>
                        {summary.data.preventiveQuality.renewalDecisionsD90.eligibleContracts === 0 && (
                          <p role="status">Sem população elegível</p>
                        )}
                        <dl>
                          <div>
                            <dt>Contratos elegíveis</dt>
                            <dd>{summary.data.preventiveQuality.renewalDecisionsD90.eligibleContracts}</dd>
                          </div>
                          <div>
                            <dt>Contratos decididos</dt>
                            <dd>{summary.data.preventiveQuality.renewalDecisionsD90.decidedContracts}</dd>
                          </div>
                          <div>
                            <dt>Intenções de prorrogar</dt>
                            <dd>{summary.data.preventiveQuality.renewalDecisionsD90.extendContracts}</dd>
                          </div>
                          <div>
                            <dt>Intenções de não renovar</dt>
                            <dd>{summary.data.preventiveQuality.renewalDecisionsD90.nonRenewalContracts}</dd>
                          </div>
                          <div>
                            <dt>Contratos sem decisão</dt>
                            <dd>{summary.data.preventiveQuality.renewalDecisionsD90.undecidedContracts}</dd>
                          </div>
                        </dl>
                      </>
                    )}
                  </article>
                </div>
                <p className="source-note">
                  Preenchimento cadastral indica presença dos campos; intenção de prorrogar não significa
                  prorrogação concluída.
                </p>
              </section>
              <section className="fiscal-panel">
                <div className="panel-heading">
                  <h2>Saldos da carteira</h2>
                  <p>
                    Valores da visão de saldo contratual para o recorte global; filtros locais de itens não se aplicam.
                  </p>
                </div>
                <div className="fiscal-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Valor contratado</th>
                        <th>Valor consumido</th>
                        <th>Saldo</th>
                        <th>Percentual disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.meta.dataCoverage.contractBalances === 'AVAILABLE' &&
                      summary.data.contractBalances?.length ? (
                        summary.data.contractBalances.map((item) => (
                          <tr key={item.contractId}>
                            <td>{item.contractNumber ?? `#${item.contractId}`}</td>
                            <td>{currency(item.contractedValue)}</td>
                            <td>{currency(item.consumedValue)}</td>
                            <td>{currency(item.balanceValue)}</td>
                            <td>{percentage(item.balancePct)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            {summary.meta.dataCoverage.contractBalances === 'UNAVAILABLE' ||
                            summary.data.contractBalances === null
                              ? 'Indisponível'
                              : 'Nenhum saldo contratual no recorte'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="fiscal-panel">
                <div className="panel-heading">
                  <h2>Distribuição financeira por contrato</h2>
                  <p>
                    Contratado, consumido e saldo em reais no recorte global, na mesma escala; filtros locais de itens não se aplicam.
                  </p>
                </div>
                {summary.meta.dataCoverage.contractBalances === 'UNAVAILABLE' ||
                summary.data.contractBalances === null ? (
                  <div className="panel-unavailable" role="status">
                    Indisponível
                  </div>
                ) : summary.data.contractBalances.length === 0 ? (
                  <p className="table-empty">Nenhum saldo contratual no recorte</p>
                ) : (
                  <PortfolioFinancialChart balances={summary.data.contractBalances} />
                )}
              </section>
              <section className="fiscal-panel">
                <div className="panel-heading">
                  <h2>Contratos vigentes da carteira</h2>
                  <p>Dados atuais dos contratos autorizados selecionados pelo recorte global.</p>
                </div>
                <div className="fiscal-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Fornecedor</th>
                        <th>Valor atual</th>
                        <th>Fim da vigência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.data.contracts?.length ? (
                        summary.data.contracts.map((contract) => (
                          <tr key={contract.contractId}>
                            <td>{contract.contractNumber ?? `#${contract.contractId}`}</td>
                            <td>{contract.supplierName ?? 'Indisponível'}</td>
                            <td>{money(contract.value)}</td>
                            <td>{displayDate(contract.expiryDate, summary.meta.timezone)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="table-empty">
                            {summary.data.contracts === null ? 'Indisponível' : 'Nenhum contrato vigente'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="fiscal-panel">
                <div className="panel-heading">
                  <h2>Contratos vigentes com vencimento nos próximos 120 dias</h2>
                  <p>Dentro do recorte global selecionado, inclui a data de referência e o limite próprio de 120 dias.</p>
                </div>
                <div className="fiscal-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Fornecedor</th>
                        <th>Fim da vigência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.data.expiringContractList?.length ? (
                        summary.data.expiringContractList.map((contract) => (
                          <tr key={contract.contractId}>
                            <td>{contract.contractNumber ?? `#${contract.contractId}`}</td>
                            <td>{contract.supplierName ?? 'Indisponível'}</td>
                            <td>{displayDate(contract.expiryDate, summary.meta.timezone)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="table-empty">
                            {summary.data.expiringContractList === null
                              ? 'Indisponível'
                              : 'Nenhum contrato na janela'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
            </>} />}
          </>
        )}
      </div>
    </main>
  );
}
export function ManagerDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
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
      loadManagerSuppliers()
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({
          value: null,
          error: error instanceof Error ? error.message : 'Falha na consulta',
        })),
    ])
      .then(([summary, load, suppliers]) => {
        if (active)
          setState({
            status: 'success',
            summary,
            load: load.value,
            loadError: load.error,
            suppliers: suppliers.value,
            suppliersError: suppliers.error,
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
  return <ManagerDashboardView state={state} globalFiltersEnabled />;
}
