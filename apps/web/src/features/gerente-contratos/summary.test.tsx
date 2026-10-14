// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse, ManagerSuppliersResponse } from '@sac-etice-bi/contracts';
import { ManagerDashboard, ManagerDashboardView } from './summary';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const base: ManagerDashboardSummaryResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
    source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [] },
    dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE',
      expiringContracts: 'AVAILABLE', renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE', itemBalances: 'AVAILABLE', renewalDecisionsD90: 'AVAILABLE', registrationCompleteness: 'AVAILABLE', contractRiskMatrix: 'AVAILABLE' } },
  data: { manager: { userId: 1, name: 'Gestora' },
    cards: { activeContracts: 0, activePortfolioValue: 0, expiringContracts: 0, renewalsWithin120Days: 0 },
    contracts: [], expiringContractList: [], contractAlerts: [], contractBalances: [], contractRiskMatrix: [],
    preventiveQuality: { renewalDecisionsD90: { eligibleContracts: 0, decidedContracts: 0, extendContracts: 0,
      nonRenewalContracts: 0, undecidedContracts: 0, percentage: null },
      registrationCompleteness: { activeContracts: 0, completeContracts: 0, percentage: null,
        missingByField: { objeto: 0, valor_total: 0, data_assinatura: 0, vigencia_inicio: 0, vigencia_fim: 0 } } },
    itemBalances: { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 },
      resumo: { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 },
      agregados: { totalContratado: 0, saldoComprometido: 0, saldoMedido: 0, itemCount: 0, completeValueRows: 0,
        contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 }, itens: [] } },
};
const render = (summary: ManagerDashboardSummaryResponse) =>
  renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary }} />);
it('renders the contract risk matrix with distinct states and partial balance coverage', () => {
  const summary = structuredClone(base);
  summary.data.contractRiskMatrix = [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X',
    saldo: { status: 'CRITICAL', partialCoverage: true, reason: null }, vigencia: 'ATTENTION',
    sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' },
  { contractId: 8, contractNumber: null, supplierName: null,
    saldo: { status: 'OK', partialCoverage: false, reason: null }, vigencia: 'UNAVAILABLE',
    sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }];
  const host = document.createElement('div');
  host.innerHTML = render(summary);
  const panel = host.querySelector('.manager-risk-panel')!;
  expect(panel.querySelectorAll('thead th')).toHaveLength(7);
  expect([...panel.querySelectorAll('tbody tr')]).toHaveLength(2);
  expect(panel.textContent).toContain('CT-7');
  expect(panel.textContent).toContain('Fornecedor X');
  expect(panel.querySelector('.manager-risk-table tbody td')?.textContent).toBe('Crítico');
  expect(panel.textContent).toContain('Contrato ID 8');
  for (const label of ['Crítico', 'Atenção', 'OK', 'Indisponível']) expect(panel.textContent).toContain(label);
  expect(panel.querySelectorAll('.manager-risk-cell')).toHaveLength(12);
  expect(host.querySelector('.manager-focus-grid .manager-risk-panel h2')?.textContent).toBe('Matriz Contrato × Dimensão de Risco');
  const unavailable = structuredClone(base);
  unavailable.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE';
  unavailable.data.contractRiskMatrix = null;
  unavailable.data.contractAlerts = [{ alertId: 99, contractId: 7, contractNumber: 'CT-7', type: 'vigencia',
    status: 'aberta', description: 'Não exibir no recorte indisponível', expiryDate: null, createdAt: null }];
  expect(render(unavailable)).toContain('Matriz indisponível para esta referência.');
  expect(render(unavailable)).not.toContain('Risco por contrato e dimensão');
});

it('GC-035C restores the supervision header, four alerts, filter position and chart structures', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base,
    load: fiscalLoad([inspector(7, 'Fiscal A', 1, 0)]) }} globalFiltersEnabled />);
  expect(host.querySelector('.manager-header p')?.textContent).toBe(
    'Supervisão de fiscais, fornecedores estratégicos e prevenção de riscos');
  expect([...host.querySelectorAll('.manager-decision-tag')].map(node => node.textContent)).toEqual([
    'Decisão imediata', 'Capacidade', 'Concentração', 'Antecipação',
  ]);
  expect(host.querySelectorAll('.manager-decision-item strong')).toHaveLength(4);
  expect([...host.querySelectorAll('.manager-decision-item strong')].every(node => node.textContent === 'Indisponível')).toBe(true);
  const kpis = host.querySelector('.manager-kpis')!;
  const alerts = host.querySelector('.manager-decision')!;
  const filters = host.querySelector('.manager-global-filters')!;
  const charts = host.querySelector('.manager-first-grid')!;
  expect(kpis.compareDocumentPosition(alerts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(alerts.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(filters.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.querySelector('.manager-combined-chart figcaption')?.textContent).toContain('Críticos: indisponível');
  expect(host.querySelector('.manager-radar figcaption')?.textContent).toContain('Previsibilidade: indisponíveis');
  expect(host.querySelector('.manager-strategic-chart')).not.toBeNull();
  expect(host.querySelector('.manager-strategic-chart svg')).toBeNull();
  expect([...host.querySelectorAll('.manager-suppliers > .fiscal-table-wrap thead th')].map(node => node.textContent)).toEqual([
    'Classe', 'Fornecedor', 'Valor 12m', '%', '% acum.', 'Contratos', 'Risco', 'Tendência',
  ]);
  expect(host.querySelectorAll('.manager-first-grid .fiscal-panel')).toHaveLength(2);
});

it('GC-035C keeps all four executive alerts visible when the global scope is unavailable', () => {
  const unavailable = structuredClone(base);
  unavailable.data.contracts = null;
  unavailable.data.contractRiskMatrix = null;
  unavailable.meta.dataCoverage.portfolio = 'UNAVAILABLE';
  unavailable.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE';
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: unavailable }} globalFiltersEnabled />);
  expect(host.querySelectorAll('.manager-decision-item')).toHaveLength(4);
  expect(host.querySelector('.manager-kpis')?.textContent).not.toContain('R$ 0,00');
  expect(host.textContent).toContain('Não é possível determinar o recorte global');
  expect(host.querySelector('.manager-interventions [data-occurrence-id]')).toBeNull();
  expect(host.textContent).not.toContain('Não exibir no recorte indisponível');
});
it.each([
  ['NO_ITEMS', false, 'Sem itens cadastrados para classificar o saldo'],
  ['ALL_ITEMS_UNVERIFIABLE', true, 'Todos os itens são não verificáveis para classificar o saldo'],
  ['ITEM_SOURCE_UNAVAILABLE', false, 'Fonte de itens indisponível para classificar o saldo'],
] as const)('explains unavailable balance: %s', (reason, partialCoverage, explanation) => {
  const summary = structuredClone(base);
  summary.data.contractRiskMatrix = [{ contractId: 29, contractNumber: '20/2022', supplierName: null,
    saldo: { status: 'UNAVAILABLE', partialCoverage, reason }, vigencia: 'OK',
    sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }];
  const view = mount(summary);
  try {
    const cell = view.host.querySelector<HTMLButtonElement>('.manager-risk-table tbody td button')!;
    expect(cell.textContent).toBe('Indisponível');
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    act(() => cell.click());
    const detail = view.host.querySelector('.manager-risk-detail')!;
    expect(detail.textContent).toContain(explanation);
    expect(detail.textContent?.includes('Cobertura parcial')).toBe(partialCoverage);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    act(() => view.host.querySelector<HTMLButtonElement>('.manager-risk-detail-head button')!.click());
    expect(detail.textContent).toBe('');
    expect(document.activeElement).toBe(cell);
  } finally { view.unmount(); }
});
it('renders unavailable when vigencia_fim cannot classify the portfolio', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base,
    meta: { ...base.meta, dataCoverage: { ...base.meta.dataCoverage,
      expiringContracts: 'UNAVAILABLE', renewalsWithin120Days: 'UNAVAILABLE' } },
    data: { ...base.data, cards: { ...base.data.cards, expiringContracts: null, renewalsWithin120Days: null },
      expiringContractList: null } };
  const html = render(summary);
  expect(html).toContain('Indisponível');
  expect(html).not.toContain('Nenhum contrato na janela');
});

it('renders official fiscal load fields and unavailable capacity', () => {
  const load: ManagerFiscalLoadResponse = {
    meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25',
      timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
      dataCoverage: { inspectors: 'AVAILABLE', activeContracts: 'AVAILABLE', pendingOrders: 'AVAILABLE',
        capacity: 'UNAVAILABLE', weightedLoad: 'UNAVAILABLE', criticality: 'UNAVAILABLE',
        ranking: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' } },
    data: { inspectors: [{ userId: 7, name: 'Fiscal Sete', activeContracts: 2, pendingOrders: 3,
      capacity: null, weightedLoad: null, criticality: null, ranking: null, overdueActions: null }] },
  };
  const html = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, load }} />);
  expect(html).toContain('Contratos vigentes');
  expect(html).toContain('<td>Fiscal Sete</td><td>2</td><td>3</td><td>Indisponível</td>');
});

type Inspector = NonNullable<ManagerFiscalLoadResponse['data']['inspectors']>[number];
function fiscalLoad(inspectors: Inspector[] | null): ManagerFiscalLoadResponse {
  const coverage = inspectors === null ? 'UNAVAILABLE' : 'AVAILABLE';
  return { meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25',
    timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
    dataCoverage: { inspectors: coverage, activeContracts: coverage, pendingOrders: coverage,
      capacity: 'UNAVAILABLE', weightedLoad: 'UNAVAILABLE', criticality: 'UNAVAILABLE',
      ranking: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' } },
    data: { inspectors } };
}
const inspector = (userId: number, name: string | null, activeContracts: number, pendingOrders: number): Inspector => ({
  userId, name, activeContracts, pendingOrders, capacity: null, weightedLoad: null,
  criticality: null, ranking: null, overdueActions: null,
});

it('shows observed zeros, including an all-zero chart without a false bar', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base,
    load: fiscalLoad([inspector(2, null, 0, 0), inspector(1, 'Ana', 0, 0)]) }} />);
  const chart = host.querySelector('svg[aria-label="Comparativo de contratos vigentes e OS pendentes por fiscal"]')!;
  expect([...chart.querySelectorAll('rect')].map(node => node.getAttribute('width'))).toEqual(['0', '0', '0', '0']);
  expect(chart.textContent).toContain('Fiscal 2');
  expect(chart.querySelectorAll('g[aria-label] text:not(.manager-fiscal-name)')).toHaveLength(4);
  expect([...chart.querySelectorAll('g[aria-label] text:not(.manager-fiscal-name)')].every(node => node.textContent === '0')).toBe(true);
});

it('distinguishes empty, unavailable and loading fiscal distribution', () => {
  const empty = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, load: fiscalLoad([]) }} />);
  expect(empty).toContain('Nenhum fiscal designado na carteira');
  expect(empty).not.toContain('Comparativo de contratos vigentes');
  const unavailable = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, load: fiscalLoad(null) }} />);
  expect(unavailable).toContain('Distribuição dos fiscais indisponível para esta referência');
  expect(unavailable).not.toContain('Nenhum fiscal designado na carteira');
  const loading = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'loading' }} />);
  expect(loading).toContain('Carregando resumo');
  expect(loading).not.toContain('Distribuição dos fiscais indisponível');
});

it('isolates a fiscal-load HTTP error without hiding the main summary', async () => {
  const suppliers = { meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25',
    timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
    pagination: { page: 1, pageSize: 25, totalItems: 0 },
    dataCoverage: { suppliers: 'AVAILABLE', vigentValue: 'AVAILABLE', abcClass: 'UNAVAILABLE',
      openFinancialAmount: 'UNAVAILABLE', openCriticalRisks: 'UNAVAILABLE' } }, data: { suppliers: [] } };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/fiscais/carga')
    ? new Response('{}', { status: 503 })
    : new Response(JSON.stringify(input.includes('/fornecedores/') ? suppliers : base), { status: 200 })));
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<ManagerDashboard />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Dashboard do Gerente de Contratos');
    expect(host.textContent).toContain('Contratos monitorados');
    expect(host.textContent).toContain('Erro ao carregar distribuição dos fiscais');
    expect(host.textContent).not.toContain('Distribuição dos fiscais indisponível para esta referência');
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

function item(id: number, contractId: number, supplierName: string | null, faixa: 'adequado' | 'critico' | 'nao_verificavel', overrides: Record<string, unknown> = {}) {
  return { contractId, contractNumber: `CT-${contractId}`, supplierName, itemId: id, sequence: id,
    specification: `Serviço ${id}`, unit: 'un', quantityContracted: 1, quantityConsumed: 0,
    quantityMeasured: 0, quantityBalance: 1, valueContracted: 100, valueConsumed: 0,
    valueMeasured: 0, valueBalance: 100, valueMeasuredBalance: 100, quantityMeasuredBalance: 1,
    pctSaldo: 1, pctSaldoMedido: 1, faixa, statusVerificacao: null, blockedAt: null, blockReason: null,
    ...overrides } as Extract<ManagerDashboardSummaryResponse['data']['itemBalances'], { coverage: 'AVAILABLE' }>['itens'][number];
}

function withItems(items: ReturnType<typeof item>[]): ManagerDashboardSummaryResponse {
  const data = structuredClone(base);
  data.data.itemBalances = { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 },
    resumo: { adequado: 1, atencao: 0, critico: 1, nao_verificavel: 1 },
    agregados: { totalContratado: null, saldoComprometido: null, saldoMedido: null,
      itemCount: items.length, completeValueRows: 2, contractedValueRows: 2,
      committedBalanceRows: 2, measuredBalanceRows: 2 }, itens: items };
  data.data.contractBalances = [{ contractId: 1, contractNumber: 'CT-1', contractedValue: 999,
    consumedValue: 0, balanceValue: 999, balancePct: 100 }];
  return data;
}

function mount(data: ManagerDashboardSummaryResponse) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const update = (next: ManagerDashboardSummaryResponse) => act(() => root.render(<ManagerDashboardView state={{ status: 'success', summary: next }} />));
  update(data);
  const select = (label: string, value: string) => {
    const control = [...host.querySelectorAll('.fiscal-saldos label')].find(node => node.textContent?.startsWith(label))?.querySelector('select');
    if (!control) throw new Error(`Select ausente: ${label}`);
    act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const search = (value: string) => {
    const control = host.querySelector<HTMLInputElement>('.fiscal-saldos input[type="search"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(control, value);
      control.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const section = (title: string) => [...host.querySelectorAll('section.fiscal-panel')]
    .find(node => node.querySelector('h2')?.textContent === title)?.textContent ?? '';
  const selected = (label: string) => [...host.querySelectorAll('.fiscal-saldos label')]
    .find(node => node.textContent?.startsWith(label))?.querySelector('select')?.value;
  return { host, update, select, search, section, selected,
    clear: () => act(() => host.querySelector<HTMLButtonElement>('.saldo-filter-meta button')!.click()),
    unmount: () => { act(() => root.unmount()); host.remove(); } };
}

const rows = () => [
  item(1, 1, 'Árvore', 'adequado', { specification: 'Fibra óptica', valueBalance: 80 }),
  item(2, 2, 'Zeta', 'critico', { specification: 'Roteador', valueContracted: 200, valueBalance: 5 }),
  item(3, 3, null, 'nao_verificavel', { contractNumber: null, specification: null,
    valueContracted: null, valueBalance: null, valueMeasuredBalance: null }),
];

it('preserves valid selections, invalidates missing options and resets on manager or scope change', () => {
  const data = withItems(rows());
  const view = mount(data);
  try {
    view.select('Fornecedor', 'Árvore');
    view.select('Contrato', '1');
    view.select('Faixa', 'adequado');
    view.search('FIBRA');
    view.update(structuredClone(data));
    expect(view.selected('Fornecedor')).toBe('Árvore');
    expect(view.selected('Contrato')).toBe('1');
    const changed = withItems([item(4, 4, 'Outro', 'adequado', { specification: 'Fibra nova' })]);
    view.update(changed);
    expect(view.selected('Fornecedor')).toBe('');
    expect(view.selected('Contrato')).toBe('');
    expect(view.selected('Faixa')).toBe('adequado');
    expect(view.host.querySelector<HTMLInputElement>('.fiscal-saldos input[type="search"]')?.value).toBe('FIBRA');
    view.update(data);
    expect(view.selected('Fornecedor')).toBe('');
    const other = structuredClone(data);
    other.data.manager.userId = 2;
    view.update(other);
    expect(view.selected('Faixa')).toBe('');
    expect(view.host.querySelector<HTMLInputElement>('.fiscal-saldos input[type="search"]')?.value).toBe('');
    view.select('Contrato', '1');
    const scoped = structuredClone(other);
    scoped.meta.filtersApplied.contratoId = [1];
    view.update(scoped);
    expect(view.selected('Contrato')).toBe('');
  } finally { view.unmount(); }
});

it('distinguishes unavailable, available empty and incomplete item recuts', () => {
  const view = mount(withItems(rows()));
  try {
    view.select('Contrato', '3');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratadoIndisponível');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado incompleto: 0 de 1');
    const unavailable = withItems([]);
    unavailable.meta.dataCoverage.itemBalances = 'UNAVAILABLE';
    unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
    view.update(unavailable);
    expect(view.host.querySelectorAll('.saldo-filters select')).toHaveLength(0);
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Fonte de saldos por item indisponível');
    const empty = withItems([]);
    view.update(empty);
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Nenhum item contratual cadastrado na carteira.');
  } finally { view.unmount(); }
});

it('combines matrix filters, counts visible cells and sorts critical contracts first', () => {
  const summary = structuredClone(base);
  summary.data.contractRiskMatrix = [
    { contractId: 1, contractNumber: 'A-1', supplierName: 'Alfa', saldo: { status: 'OK', partialCoverage: false, reason: null },
      vigencia: 'OK', sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' },
    { contractId: 2, contractNumber: 'B-2', supplierName: 'Beta', saldo: { status: 'CRITICAL', partialCoverage: false, reason: null },
      vigencia: 'ATTENTION', sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' },
  ];
  const view = mount(summary);
  try {
    const panel = view.host.querySelector('.manager-risk-panel')!;
    expect(panel.querySelector('tbody tr th')?.textContent).toContain('B-2');
    expect([...panel.querySelectorAll('.manager-matrix-counts span')].map(node => node.textContent)).toEqual(['2 de 2 contratos', 'Crítico 1', 'Atenção 1', 'OK 2', 'Indisponível 8']);
    const select = (index: number, value: string) => {
      const control = panel.querySelectorAll<HTMLSelectElement>('.manager-matrix-controls select')[index];
      act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    select(0, 'saldo'); select(1, 'CRITICAL');
    expect(panel.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(panel.textContent).toContain('1 de 2 contratos');
    expect([...panel.querySelectorAll('.manager-matrix-counts span')].map(node => node.textContent)).toEqual(['1 de 2 contratos', 'Crítico 1', 'Atenção 0', 'OK 0', 'Indisponível 0']);
    const search = panel.querySelector<HTMLInputElement>('.manager-matrix-controls input')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'Alfa');
      search.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(panel.textContent).toContain('Nenhum contrato encontrado com os filtros da matriz');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('0 de 0 itens encontrados');
  } finally { view.unmount(); }
});

it('selects heatmap cells accessibly and closes details with Escape', () => {
  const summary = structuredClone(base);
  summary.data.contractRiskMatrix = [{ contractId: 4, contractNumber: 'CT-4', supplierName: 'Fornecedor Alfa',
    saldo: { status: 'ATTENTION', partialCoverage: true, reason: null }, vigencia: 'UNAVAILABLE',
    sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }];
  const view = mount(summary);
  try {
    const cells = view.host.querySelectorAll<HTMLButtonElement>('.manager-risk-table tbody td button');
    expect(cells).toHaveLength(6);
    expect([...cells].map(cell => cell.textContent)).toEqual(['Atenção', 'Indisponível', 'Indisponível', 'Indisponível', 'Indisponível', 'Indisponível']);
    cells[0].focus();
    expect(document.activeElement).toBe(cells[0]);
    act(() => cells[0].click());
    const detail = view.host.querySelector('.manager-risk-detail')!;
    expect(detail.textContent).toContain('CT-4');
    expect(detail.textContent).toContain('Fornecedor Alfa');
    expect(detail.textContent).toContain('Saldo');
    expect(detail.textContent).toContain('Atenção');
    expect(detail.textContent).toContain('Cobertura parcial');
    expect(cells[0].getAttribute('aria-pressed')).toBe('true');
    act(() => cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(detail.textContent).toBe('');
    expect(cells[0].getAttribute('aria-pressed')).toBe('false');
    act(() => cells[1].click());
    expect(detail.textContent).toContain('Data de fim da vigência indisponível');
    act(() => cells[2].click());
    expect(detail.textContent).toContain('Fonte aprovada indisponível para esta dimensão');
  } finally { view.unmount(); }
});

it('formats the active portfolio as BRL with cents and preserves unavailable and zero', () => {
  const summary = structuredClone(base);
  summary.data.cards.activePortfolioValue = 1234.56;
  const card = (data: ManagerDashboardSummaryResponse) => {
    const host = document.createElement('div'); host.innerHTML = render(data);
    return host.querySelectorAll('.manager-kpis .fiscal-kpi')[2].querySelector('strong')!.textContent!.replaceAll('\u00a0', ' ');
  };
  expect(card(summary)).toBe('R$ 1.234,56');
  summary.data.cards.activePortfolioValue = 0;
  expect(card(summary)).toBe('R$ 0,00');
  summary.data.cards.activePortfolioValue = null;
  summary.meta.dataCoverage.activePortfolioValue = 'UNAVAILABLE';
  expect(card(summary)).toBe('Indisponível');
});

it('keeps a long supplier in the contract cell and full name in selectable details', () => {
  const summary = structuredClone(base);
  const supplier = 'Fornecedor de Tecnologia e Serviços de Infraestrutura Extraordinariamente Longo Sem EspaçosSuperlongos123456789';
  summary.data.contractRiskMatrix = [{ contractId: 12, contractNumber: 'CT-12', supplierName: supplier,
    saldo: { status: 'OK', partialCoverage: false, reason: null }, vigencia: 'ATTENTION',
    sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }];
  const view = mount(summary);
  try {
    const panel = view.host.querySelector('.manager-risk-panel')!;
    expect(panel.querySelector('.manager-risk-scroll')).not.toBeNull();
    expect(panel.querySelectorAll('.manager-risk-table thead th')).toHaveLength(7);
    expect(panel.querySelector('.manager-risk-table th[scope="row"] small')?.textContent).toBe(supplier);
    expect(panel.querySelector('.manager-risk-table tbody td')?.textContent).toBe('OK');
    act(() => panel.querySelector<HTMLButtonElement>('.manager-risk-table tbody td button')!.click());
    expect(panel.querySelector('.manager-risk-detail dd')?.textContent).toBe('CT-12');
    expect([...panel.querySelectorAll('.manager-risk-detail dd')].map(node => node.textContent)).toContain(supplier);
  } finally { view.unmount(); }
});
it('VIS-002 manager distribution follows local filters, including zero and unavailable', () => {
  const view = mount(withItems([item(1, 1, 'A', 'adequado'), item(2, 2, 'B', 'critico'), item(3, 2, 'B', 'nao_verificavel')]));
  const chart = () => view.host.querySelector('.manager-band-distribution')!;
  expect(chart().textContent).toContain('Adequado: 1');
  view.select('Fornecedor', 'B');
  expect(chart().textContent).toContain('Adequado: 0');
  expect(chart().textContent).toContain('Crítico: 1');
  view.select('Faixa', 'adequado');
  expect(chart().textContent).toContain('Nenhum item encontrado com os filtros atuais.');
  const unavailable = structuredClone(base); unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
  view.update(unavailable);
  expect(chart().textContent).toContain('Distribuição indisponível');
  expect(chart().textContent).not.toContain('Adequado: 0');
  view.unmount();
});

it('VIS-004 keeps long names and all fiscals in the chart and complete table with keyboard scrolling', () => {
  const name = 'Fiscal com nome completo muito extenso para a identificação integral';
  const rows = Array.from({ length: 30 }, (_, index) => inspector(index + 1, index === 0 ? name : `Fiscal ${index + 1}`, 2, index % 3));
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, load: fiscalLoad(rows) }} />);
  const panel = host.querySelector('.manager-fiscals-panel')!;
  expect(panel.querySelector('.manager-fiscal-chart-scroll')?.getAttribute('tabindex')).toBe('0');
  expect(panel.querySelectorAll('svg g[aria-label]')).toHaveLength(30);
  expect(panel.querySelectorAll('tbody tr')).toHaveLength(30);
  expect([...panel.querySelectorAll('tbody td')].some(node => node.textContent === name)).toBe(true);
  expect([...panel.querySelectorAll('svg g[aria-label]')].some(node => node.getAttribute('aria-label')?.includes(name))).toBe(true);
  expect(panel.querySelector('.manager-fiscal-chart-legend')?.getAttribute('aria-hidden')).toBeNull();
  expect(panel.querySelector('.manager-fiscal-chart-legend')?.textContent).toContain('OS pendentes na carteira');
  expect(panel.querySelectorAll('.manager-fiscal-value')).toHaveLength(60);
  expect(panel.textContent).toContain('não devem ser somadas como OS únicas');
});

it('GC-035 renders the approved Gerente sequence in one page without tabs or excluded panels', () => {
  const host = document.createElement('div');
  host.innerHTML = render(base);
  expect(host.querySelector('[role="tablist"], [role="tab"], [role="tabpanel"]')).toBeNull();
  expect([...host.querySelectorAll('.panel-heading h2')].map(node => node.textContent)).toEqual([
    'Carga, criticidade e desempenho por fiscal', 'Qualidade preventiva da gestão',
    'Matriz Contrato × Dimensão de Risco', 'Fornecedores estratégicos: valor × risco',
    'Intervenções gerenciais priorizadas', 'Curva ABC dos principais fornecedores',
    'Distribuição dos itens por faixa de saldo', 'Gestão dos Saldos dos Itens Contratuais',
    'Eficiência do Ciclo Financeiro — carteira gerenciada',
  ]);
  expect(host.querySelectorAll('.manager-kpis .fiscal-kpi')).toHaveLength(6);
  expect(host.querySelector('.manager-first-grid')?.children).toHaveLength(2);
  expect(host.querySelector('.manager-second-grid')?.children).toHaveLength(2);
  for (const title of ['Forecast 180 dias', 'Exposição financeira', 'Curva ABC de Clientes',
    'Contratos vigentes da carteira', 'Saldos da carteira', 'Detalhamento dos indicadores preventivos'])
    expect([...host.querySelectorAll('.panel-heading h2')].map(node => node.textContent)).not.toContain(title);
});

it('GC-036 renders factual alerts in the exact eight prototype columns without invented decisions', () => {
  const data = structuredClone(base);
  data.data.contractAlerts = [{ alertId: 1, contractId: 2, contractNumber: 'CT-2', type: 'vigencia',
    status: 'aberta', description: 'Alerta factual', expiryDate: '2026-10-10', createdAt: null }];
  const host = document.createElement('div'); host.innerHTML = render(data);
  const panel = host.querySelector('.manager-interventions')!;
  expect([...panel.querySelectorAll('thead th')].map(node => node.textContent)).toEqual([
    'Prior.', 'Fiscal', 'Contrato / fornecedor', 'Sinal antecipado', 'Impacto',
    'Antecedência', 'Ação gerencial', 'Prazo',
  ]);
  expect(panel.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(panel.querySelector('tbody tr')?.getAttribute('data-occurrence-id')).toBe('alerta:1');
  expect(panel.textContent).toContain('Alerta factual');
  expect(panel.textContent).toContain('Avaliar o contrato e o encaminhamento cabível');
  expect(panel.textContent).toContain('ação não formalmente atribuída');
  expect(panel.textContent).not.toContain('P1');
  const cells = [...panel.querySelectorAll('tbody tr:first-child td')].map(cell => cell.textContent);
  for (const index of [0, 1, 4, 5, 7]) expect(cells[index]).toBe('Indisponível');
  expect(panel.querySelector('input, select, button')).toBeNull();
});

it('GC-035 keeps verifiable item values, fiscal association and unavailable individual direction', () => {
  const data = withItems([item(1, 2, 'Fornecedor A', 'critico')]);
  const load = fiscalLoad([{ ...inspector(7, 'Fiscal A', 1, 0), contractIds: [2] }]);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: data, load }} />);
  const panel = host.querySelector('.fiscal-saldos')!;
  expect([...panel.querySelectorAll('.manager-saldo-kpis > div > span')].map(node => node.textContent)).toEqual([
    'Total contratado', 'Saldo disponível', 'Saldo consolidado', 'Itens críticos',
  ]);
  expect(panel.querySelector('.manager-saldo-kpis')?.textContent).toContain('Percentual agregado sem regra aprovada');
  expect(panel.querySelector('details.manager-saldo-tools > summary')?.textContent).toBe('Filtros, busca e informações da consulta');
  expect(panel.querySelector('.manager-saldo-tools .saldo-filters select')).not.toBeNull();
  expect([...panel.querySelectorAll('thead th')].map(node => node.textContent)).toEqual([
    'Status', 'Fiscal', 'Contrato / fornecedor', 'Item', 'Total', 'Executado', 'Saldo',
    '% saldo', 'Direcionamento gerencial',
  ]);
  expect(panel.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(panel.querySelector('tbody tr')?.children[1].textContent).toBe('Fiscal A');
  expect(panel.querySelector('tbody tr')?.lastElementChild?.textContent).toContain('sem direcionamento individual aprovado');
  expect(panel.querySelector('.manager-saldo-status.critico')?.textContent).toBe('Crítico');
  expect(panel.querySelector('.manager-saldo-progress')).not.toBeNull();
  expect(host.querySelector('.manager-band-distribution')).not.toBeNull();
});

it('GC-035D keeps long supplier names fully accessible in the compact eight-column ABC table', () => {
  const name = 'Fornecedor de Tecnologia e Infraestrutura com Nome Muito Extenso';
  const suppliers: ManagerSuppliersResponse = {
    meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
      source: 'SAC', merCoverage: 'PROPOSTA', pagination: { page: 1, pageSize: 25, totalItems: 1 },
      dataCoverage: { suppliers: 'AVAILABLE', vigentValue: 'AVAILABLE', abcClass: 'UNAVAILABLE',
        openFinancialAmount: 'UNAVAILABLE', openCriticalRisks: 'UNAVAILABLE' } },
    data: { suppliers: [{ supplierId: 1, name, vigentValue: 100, abcClass: null,
      openFinancialAmount: null, openCriticalRisks: null }] },
  };
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, suppliers }} />);
  const table = host.querySelector('.manager-suppliers > .fiscal-table-wrap table')!;
  expect(table.querySelectorAll('thead th')).toHaveLength(8);
  expect(table.querySelector('.manager-supplier-name summary')?.getAttribute('title')).toBe(name);
  expect(table.querySelector('.manager-supplier-name summary')?.getAttribute('aria-label')).toBe(`Fornecedor ${name}`);
  expect(table.querySelector('.manager-supplier-name span')?.textContent).toBe(name);
  expect(table.querySelector('tbody tr')?.textContent).not.toContain('R$ 100');
});

it('GC-035 preserves global manager filters and local matrix state on the single page', () => {
  const data = structuredClone(base);
  data.data.contracts = [
    { contractId: 1, contractNumber: 'CT-1', supplierName: 'Árvore', value: 100, expiryDate: '2026-10-01' },
    { contractId: 2, contractNumber: 'CT-2', supplierName: 'Beta', value: 200, expiryDate: '2027-03-24' },
  ];
  data.data.cards = { activeContracts: 2, activePortfolioValue: 300, expiringContracts: 1, renewalsWithin120Days: 1 };
  data.data.contractRiskMatrix = data.data.contracts.map((contract, index) => ({
    contractId: contract.contractId, contractNumber: contract.contractNumber, supplierName: contract.supplierName,
    saldo: { status: index ? 'OK' : 'CRITICAL', partialCoverage: false, reason: null },
    vigencia: index ? 'ATTENTION' : 'OK', sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE',
    pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE',
  }));
  const load = fiscalLoad([{ ...inspector(7, 'Fiscal A', 1, 0), contractIds: [1] },
    { ...inspector(8, 'Fiscal B', 1, 0), contractIds: [2] }]);
  const host = document.createElement('div'); const root = createRoot(host);
  const select = (label: string, value: string) => {
    const control = [...host.querySelectorAll('.manager-global-grid label')].find(node => node.textContent?.startsWith(label))?.querySelector('select')!;
    act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  try {
    act(() => root.render(<ManagerDashboardView state={{ status: 'success', summary: data, load }} globalFiltersEnabled />));
    expect(host.querySelector('.manager-global-filters')?.textContent).toContain('D+180 dias');
    expect(host.querySelector<HTMLSelectElement>('.manager-global-grid label:nth-child(2) select')?.disabled).toBe(true);
    const local = host.querySelector<HTMLInputElement>('.manager-matrix-controls input')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(local, 'CT-1');
      local.dispatchEvent(new Event('input', { bubbles: true })); });
    select('Fiscal', '7');
    expect(host.querySelector('.manager-global-filters')?.textContent).toContain('1 de 2 contratos');
    expect(host.querySelector('.manager-kpis')?.textContent).toContain('R$ 100,00');
    expect(host.querySelector<HTMLInputElement>('.manager-matrix-controls input')?.value).toBe('CT-1');
    select('Risco', 'ATTENTION');
    expect(host.querySelector('.manager-global-filters')?.textContent).toContain('0 de 2 contratos');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
  } finally { act(() => root.unmount()); }
});
