// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
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

it('renders available zero and an empty expiry list', () => {
  const html = render(base);
  expect(html).toContain('Gestora');
  expect(html).toContain('25/09/2026');
  expect(html).toContain('Vencimento nos próximos 120 dias');
  expect(html).toContain('Nenhum contrato na janela');
  expect(html).toContain('>0</strong>');
});
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
  expect(host.innerHTML.indexOf('Matriz Contrato × Dimensão de Risco')).toBeLessThan(host.innerHTML.indexOf('Intervenções gerenciais'));
  const unavailable = structuredClone(base);
  unavailable.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE';
  unavailable.data.contractRiskMatrix = null;
  expect(render(unavailable)).toContain('Matriz indisponível para esta referência.');
  expect(render(unavailable)).not.toContain('Risco por contrato e dimensão');
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
it('renders the actual count and summary list without renewal claims', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base,
    data: { ...base.data,
      cards: { ...base.data.cards, activeContracts: 1, expiringContracts: 1, renewalsWithin120Days: 1 },
      expiringContractList: [{ contractId: 17, contractNumber: 'CT-17', supplierName: 'Fornecedor X', value: 100, expiryDate: '2027-01-23' }] } };
  const html = render(summary);
  expect(html).toContain('CT-17');
  expect(html).toContain('Fornecedor X');
  expect(html).toContain('23/01/2027');
  expect(html).not.toContain('Renovação iniciada');
});

it('formats contract and alert expiry dates while keeping unavailable values distinct', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base, data: { ...base.data,
    contracts: [{ contractId: 2, contractNumber: 'CT-2', supplierName: null, value: 100, expiryDate: '2026-12-31' }],
    contractAlerts: [{ alertId: 1, contractId: 2, contractNumber: 'CT-2', type: null, status: 'aberta',
      description: null, expiryDate: null, createdAt: null }] } };
  const html = render(summary);
  expect(html).toContain('31/12/2026');
  expect(html).toMatch(/Alertas contratuais[\s\S]*?Indisponível[\s\S]*?<\/section>/);
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

it('compares multiple fiscals on one zero-based scale and sorts chart and table identically', () => {
  const load = fiscalLoad([inspector(9, 'Zeca', 4, 4), inspector(8, 'Álvaro', 4, 1),
    inspector(7, 'Álvaro', 4, 3), inspector(5, 'Bruna', 0, 0)]);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, load }} />);
  const panel = [...host.querySelectorAll('section.fiscal-panel')].find(node => node.querySelector('h2')?.textContent === 'Carga e risco por fiscal')!;
  const chart = panel.querySelector('svg[aria-label="Comparativo de contratos vigentes e OS pendentes por fiscal"]')!;
  const chartNames = [...chart.querySelectorAll('g > text.manager-fiscal-name')].map(node => node.textContent);
  const tableNames = [...panel.querySelectorAll('tbody tr')].map(node => node.querySelector('td')?.textContent);
  expect(chartNames).toEqual(['Álvaro', 'Álvaro', 'Zeca', 'Bruna']);
  expect(tableNames).toEqual(chartNames);
  expect([...panel.querySelectorAll('tbody tr')].map(node => node.querySelectorAll('td')[1].textContent)).toEqual(['4', '4', '4', '0']);
  expect([...chart.querySelectorAll('g[aria-label]')].map(node => node.getAttribute('aria-label'))[0]).toContain('3 OS pendentes');
  expect([...chart.querySelectorAll('g[aria-label]')].map(node => node.getAttribute('aria-label'))[1]).toContain('1 OS pendente');
  const firstBars = chart.querySelectorAll('g[aria-label]')[0].querySelectorAll('rect');
  expect(firstBars[0].getAttribute('width')).toBe('450');
  expect(firstBars[1].getAttribute('width')).toBe('337.5');
  expect(panel.textContent).toContain('OS pendentes são vinculadas aos contratos da carteira do fiscal');
  expect(panel.textContent).toContain('não devem ser somadas como OS únicas');
  expect([...panel.querySelectorAll('tbody tr')].every(node => node.querySelectorAll('td')[3].textContent === 'Indisponível')).toBe(true);
  expect(host.textContent).toContain('Fornecedores da carteira');
  expect(host.textContent).not.toContain('Total de OS pendentes');
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
    expect(host.textContent).toContain('Contratos ativos');
    expect(host.textContent).toContain('Erro ao carregar distribuição dos fiscais');
    expect(host.textContent).not.toContain('Distribuição dos fiscais indisponível para esta referência');
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it('renders factual supplier value and unavailable supplier indicators', () => {
  const suppliers = {
    meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
      source: 'SAC' as const, merCoverage: 'PROPOSTA' as const,
      pagination: { page: 1, pageSize: 25, totalItems: 1 },
      dataCoverage: { suppliers: 'AVAILABLE' as const, vigentValue: 'AVAILABLE' as const,
        abcClass: 'UNAVAILABLE' as const, openFinancialAmount: 'UNAVAILABLE' as const,
        openCriticalRisks: 'UNAVAILABLE' as const } },
    data: { suppliers: [{ supplierId: 7, name: 'Fornecedor Real', vigentValue: 100,
      abcClass: null, openFinancialAmount: null, openCriticalRisks: null }] },
  };
  const html = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'success', summary: base, suppliers }} />);
  expect(html).toContain('Fornecedores da carteira');
  expect(html).toContain('<td>Fornecedor Real</td><td>100</td><td>Indisponível</td><td>Indisponível</td><td>Indisponível</td>');
  expect(html).toContain('Curva ABC de Clientes');
  expect(html).toContain('Classificação ABC indisponível');
});

it('renders real alerts, balance amounts and the financial chart while preserving existing sections', () => {
  const summary: ManagerDashboardSummaryResponse = { ...base, data: { ...base.data,
    contractAlerts: [{ alertId: 206, contractId: 41, contractNumber: 'CT-41', type: 'designacao_ausente', status: 'em_tratamento', description: 'Pendência de teste', expiryDate: '2026-10-20', createdAt: '2026-10-01T12:00:00Z' }],
    contractBalances: [{ contractId: 41, contractNumber: 'CT-41', contractedValue: 200, consumedValue: 50, balanceValue: 150, balancePct: 75 }] } };
  const html = render(summary).replaceAll('\u00a0', ' ');
  for (const label of ['Alertas contratuais', 'designacao_ausente', 'em_tratamento', 'Pendência de teste', '20/10/2026', 'Saldos da carteira', 'R$ 200,00', 'R$ 50,00', 'R$ 150,00', '75%', 'Fiscais e distribuição da carteira', 'Fornecedores da carteira', 'Contratos vigentes da carteira']) expect(html).toContain(label);
  expect(html).toContain('aria-label="Distribuição financeira por contrato"');
  expect(html).toContain('<rect');
  expect(html).not.toContain('Classificação de risco');
});

it('distinguishes empty lists from unavailable coverage and omits the chart in both cases', () => {
  const empty = render(base);
  expect(empty).toContain('Nenhum alerta contratual no recorte');
  expect(empty).toContain('Nenhum saldo contratual no recorte');
  expect(empty.match(/Distribuição financeira por contrato[\s\S]*?<\/section>/)?.[0]).not.toContain('<svg');
  const unavailable: ManagerDashboardSummaryResponse = { ...base,
    meta: { ...base.meta, dataCoverage: { ...base.meta.dataCoverage, contractAlerts: 'UNAVAILABLE', contractBalances: 'UNAVAILABLE' } },
    data: { ...base.data, contractAlerts: null, contractBalances: null } };
  const html = render(unavailable);
  expect(html).toMatch(/Alertas contratuais[\s\S]*?Indisponível[\s\S]*?<\/section>/);
  expect(html).toMatch(/Saldos da carteira[\s\S]*?Indisponível[\s\S]*?<\/section>/);
  expect(html).not.toContain('Nenhum alerta contratual');
  expect(html).not.toContain('Nenhum saldo contratual');
  expect(html.match(/Distribuição financeira por contrato[\s\S]*?<\/section>/)?.[0]).not.toContain('<svg');
});

it('renders preventive quality values without rounding the API counts or treating intention as completion', () => {
  const summary = structuredClone(base);
  summary.data.preventiveQuality = {
    renewalDecisionsD90: { eligibleContracts: 3, decidedContracts: 2, extendContracts: 1,
      nonRenewalContracts: 1, undecidedContracts: 1, percentage: 2 / 3 * 100 },
    registrationCompleteness: { activeContracts: 3, completeContracts: 1, percentage: 1 / 3 * 100,
      missingByField: { objeto: 1, valor_total: 1, data_assinatura: 1, vigencia_inicio: 0, vigencia_fim: 0 } },
  };
  const html = render(summary).replaceAll('\u00a0', ' ');
  const section = html.match(/Qualidade preventiva da gestão[\s\S]*?<\/section>/)?.[0] ?? '';
  const details = html.match(/Detalhamento dos indicadores preventivos[\s\S]*?<\/section>/)?.[0] ?? '';
  expect(section).toContain('66,67%');
  expect(section).toContain('33,33%');
  expect(details).toContain('Mede a disciplina operacional antes da materialização dos riscos.');
  expect(section).toContain('data-quality-ring="Dados completos"');
  expect(section).toContain('data-quality-ring="Decisões D-90"');
  expect(section.indexOf('data-quality-ring="Dados completos"')).toBeLessThan(section.indexOf('data-quality-ring="Decisões D-90"'));
  const detailCards = details.match(/<div class="manager-quality-grid">([\s\S]*?)<\/div><p class="source-note">/)?.[1] ?? '';
  expect(detailCards.indexOf('<h3>Dados completos</h3>')).toBeLessThan(detailCards.indexOf('<h3>Decisões D-90</h3>'));
  expect(detailCards).not.toMatch(/\d+(?:,\d+)?%/);
  expect(section.match(/66,67%/g)).toHaveLength(1);
  expect(section.match(/33,33%/g)).toHaveLength(1);
  expect(section.match(/manager-quality-ring-progress/g)).toHaveLength(2);
  const arcs = [...section.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)];
  expect(arcs).toHaveLength(2);
  expect(Number(arcs[0][1]) / Number(arcs[0][2])).toBeCloseTo(1 / 3);
  expect(Number(arcs[1][1]) / Number(arcs[1][2])).toBeCloseTo(2 / 3);
  for (const label of ['Contratos elegíveis', 'Contratos decididos', 'Intenções de prorrogar', 'Intenções de não renovar', 'Contratos sem decisão',
    'Contratos completos', 'Contratos vigentes', 'Sem objeto', 'Sem valor total', 'Sem data de assinatura',
    'Sem início da vigência', 'Sem fim da vigência']) expect(details).toContain(label);
  for (const value of ['>3</dd>', '>2</dd>', '>1</dd>', '>0</dd>']) expect(details).toContain(value);
  expect(details).toContain('intenção de prorrogar não significa prorrogação concluída');
  expect(html.indexOf('Qualidade preventiva da gestão')).toBeLessThan(html.indexOf('Intervenções gerenciais'));
  expect(html).toContain('Gestão dos Saldos dos Itens Contratuais');
});

it('distinguishes empty populations, independent unavailable coverage and main loading error', () => {
  const empty = render(base);
  expect(empty).toContain('Sem população elegível');
  expect(empty).toContain('Sem contratos vigentes');
  expect(empty).not.toContain('manager-quality-ring-progress');
  expect(empty).not.toContain('>0%</strong>');
  const unavailable = structuredClone(base);
  unavailable.meta.dataCoverage.renewalDecisionsD90 = 'UNAVAILABLE';
  unavailable.data.preventiveQuality.renewalDecisionsD90 = null;
  const html = render(unavailable);
  const section = html.match(/Qualidade preventiva da gestão[\s\S]*?<\/section>/)?.[0] ?? '';
  const details = html.match(/Detalhamento dos indicadores preventivos[\s\S]*?<\/section>/)?.[0] ?? '';
  expect(details).toContain('Fonte indisponível para esta referência');
  expect(details).toContain('Sem contratos vigentes');
  expect(details).not.toContain('Sem população elegível');
  expect(section).not.toContain('manager-quality-ring-progress');
  expect(section).not.toContain('0%');
  const loadingError = renderToStaticMarkup(<ManagerDashboardView state={{ status: 'error', message: 'HTTP 500' }} />);
  expect(loadingError).toContain('Erro ao carregar o resumo');
  expect(loadingError).not.toContain('Qualidade preventiva da gestão');
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

it('renders manager item indicators, distribution and the four interactive filters', () => {
  const view = mount(withItems(rows()));
  try {
    const text = view.section('Gestão dos Saldos dos Itens Contratuais');
    for (const label of ['Total contratado dos itens', 'Saldo comprometido dos itens', 'Saldo medido dos itens',
      'Itens críticos', 'Não verificáveis', 'Adequado: 1', 'Atenção: 0', 'Crítico: 1', 'Não verificável: 1',
      'Total contratado incompleto: 2 de 3', 'Orientação ao gerente']) expect(text).toContain(label);
    expect(view.host.querySelectorAll('.saldo-filters select')).toHaveLength(3);
    expect(view.host.querySelector('input[type="search"]')).not.toBeNull();
    expect(view.section('Saldos da carteira')).toContain('R$ 999,00');
    expect(view.section('Distribuição financeira por contrato')).toContain('R$ 999,00');
  } finally { view.unmount(); }
});

it('combines filters, searches item/contract/supplier without accents, and keeps contract balances independent', () => {
  const view = mount(withItems(rows()));
  try {
    view.search('FIBRA OPTICA');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 3 itens encontrados');
    view.search('CT-2');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Roteador');
    view.search('ARVORE');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Fibra óptica');
    view.search('');
    view.select('Fornecedor', 'Árvore');
    view.select('Contrato', '1');
    view.select('Faixa', 'adequado');
    const filtered = view.section('Gestão dos Saldos dos Itens Contratuais');
    expect(filtered).toContain('1 de 3 itens encontrados');
    expect(filtered).toContain('Total contratado dos itensR$ 100,00');
    expect(filtered).toContain('Saldo comprometido dos itensR$ 80,00');
    expect(filtered).toContain('Crítico: 0');
    expect(view.section('Saldos da carteira')).toContain('R$ 999,00');
    view.select('Faixa', 'critico');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Nenhum item encontrado com os filtros atuais.');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado dos itensR$ 0,00');
    view.clear();
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('3 de 3 itens encontrados');
  } finally { view.unmount(); }
});

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
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado dos itensIndisponível');
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

it('shows absent measurement as unavailable while retaining calculable measured balance coverage', () => {
  const data = withItems([
    item(1, 1, 'Árvore', 'adequado', { valueMeasured: null, quantityMeasured: null,
      valueMeasuredBalance: 100, quantityMeasuredBalance: 1 }),
    item(2, 1, 'Árvore', 'adequado', { valueMeasured: 0, quantityMeasured: 0,
      valueMeasuredBalance: 100, quantityMeasuredBalance: 1 }),
    item(3, 1, 'Árvore', 'nao_verificavel', { valueContracted: null, quantityContracted: null,
      valueMeasured: null, quantityMeasured: null, valueMeasuredBalance: null, quantityMeasuredBalance: null }),
  ]);
  if (data.data.itemBalances.coverage !== 'AVAILABLE') throw new Error('fixture inválida');
  data.data.itemBalances.criterio.base = 'medido';
  const view = mount(data);
  try {
    view.select('Fornecedor', 'Árvore');
    view.select('Contrato', '1');
    const cells = [...view.host.querySelectorAll('.fiscal-saldos tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    expect(cells[0][4]).toBe('Indisponível');
    expect(cells[0][5]).toBe('R$ 100,00');
    expect(cells[1][4]).toBe('R$ 0,00');
    expect(cells[2][4]).toBe('Indisponível');
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Saldo medido incompleto: 2 de 3');
    data.data.itemBalances.criterio.dimensao = 'quantidade';
    view.update(structuredClone(data));
    const quantityCells = [...view.host.querySelectorAll('.fiscal-saldos tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    expect(quantityCells[0][4]).toBe('Não calculável');
    expect(quantityCells[1][4]).toBe('0 un');
  } finally { view.unmount(); }
});

it('shows six factual executive cards and explicit gaps without prototype values', () => {
  const summary = structuredClone(base);
  summary.data.cards.activeContracts = 1;
  summary.data.cards.activePortfolioValue = 1250;
  summary.data.cards.renewalsWithin120Days = 1;
  summary.data.contractRiskMatrix = [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X',
    saldo: { status: 'CRITICAL', partialCoverage: false, reason: null }, vigencia: 'OK',
    sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }];
  const host = document.createElement('div'); host.innerHTML = render(summary);
  const cards = host.querySelectorAll('.manager-kpis .fiscal-kpi');
  expect(cards).toHaveLength(6);
  expect(cards[1].textContent).toContain('Contratos com dimensão crítica1');
  expect(cards[3].textContent).toContain('Vencimento nos próximos 120 dias1');
  expect(cards[5].textContent).toContain('SLA abaixo da metaIndisponível');
  expect(host.textContent).toContain('Forecast 180 dias');
  expect(host.textContent).toContain('Saldo contratual não representa exposição');
  expect(host.textContent).toContain('Classificação ABC indisponível');
  expect(host.textContent).not.toContain('R$ 214 mi');
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

it('VIS-002 preserves the principal panel sequence and distinguishes complements', () => {
  const host = document.createElement('div'); host.innerHTML = render(base);
  const titles = [...host.querySelectorAll('.panel-heading h2')].map(node => node.textContent);
  expect(titles.slice(0, 9)).toEqual(['Carga e risco por fiscal', 'Qualidade preventiva da gestão',
    'Matriz Contrato × Dimensão de Risco', 'Fornecedores estratégicos: valor × risco', 'Intervenções gerenciais',
    'Curva ABC de Fornecedores', 'Distribuição dos itens por faixa de saldo',
    'Gestão dos Saldos dos Itens Contratuais', 'Eficiência do Ciclo Financeiro — carteira gerenciada']);
  expect(host.querySelector('.manager-complementary')?.textContent).toContain('Curva ABC de Clientes');
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

it('VIS-003 retains contract and expiry lists in the accessible complementary area', () => {
  const host = document.createElement('div'); host.innerHTML = render(base);
  const complement = host.querySelector('.manager-complementary')!;
  expect(complement.getAttribute('aria-labelledby')).toBe('manager-complementary-title');
  const titles = [...complement.querySelectorAll('.panel-heading h2')].map(node => node.textContent);
  expect(titles).toContain('Contratos vigentes da carteira');
  expect(titles).toContain('Contratos vigentes com vencimento nos próximos 120 dias');
  expect(titles).toContain('Detalhamento dos indicadores preventivos');
  expect(host.querySelectorAll('[data-quality-ring]')).toHaveLength(2);
});
