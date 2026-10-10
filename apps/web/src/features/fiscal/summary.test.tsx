// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { fixtures as csvItemFixtures } from '../../../../../scripts/test/fixtures/fiscal-items-csv';
import { fixture as bandFixture } from '../../../../../scripts/test/fixtures/fiscal-band-distribution';
import { fixture as paginationFixture } from '../../../../../scripts/test/fixtures/fiscal-item-pagination';
import { fixture as queueFixture } from '../../../../../scripts/test/fixtures/fiscal-queue-filters';
import { fiscalItemsCsv } from './item-balances-csv';
import { countLabel, FiscalDashboard, FiscalDashboardView, queueLabel } from './summary';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function summary(activeContracts: number, queue: FiscalDashboardSummaryResponse['data']['priorityQueue'] = null): FiscalDashboardSummaryResponse {
  return {
    meta: {
      generatedAt: '2026-09-24T12:00:00-03:00', dataReference: '2026-09-24', timezone: 'America/Fortaleza',
      dataCoverage: { activeContracts: 'AVAILABLE', pendingServiceOrders: 'UNAVAILABLE', criticalItems: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE', contracts: 'AVAILABLE', contractBalances: 'AVAILABLE', contractAlerts: 'AVAILABLE' },
      filtersApplied: { unidadeId: null, contratoId: [], includeExternal: false }, source: 'SAC', merCoverage: 'PROPOSTA',
    },
    data: {
      fiscal: { userId: 77, name: 'Fiscal Real' },
      cards: { activeContracts, pendingServiceOrders: null, criticalItems: null, overdueActions: null, externalViolations: null },
      priorityQueue: queue, contracts: [], contractBalances: [], contractAlerts: [],
    },
  };
}

function render(state: Parameters<typeof FiscalDashboardView>[0]['state'], includeExternal = false) {
  return renderToStaticMarkup(<FiscalDashboardView state={state} includeExternal={includeExternal} onIncludeExternalChange={() => {}} />);
}

describe('Fiscal summary presentation', () => {
  it('shows loading and API error without a fabricated summary', () => {
    expect(render({ status: 'loading' })).toContain('Carregando resumo');
    const error = render({ status: 'error', message: 'Resumo indisponível (HTTP 500)' });
    expect(error).toContain('Erro ao carregar o resumo');
    expect(error).not.toContain('Contratos ativos');
  });

  it('shows a real positive count and partial unavailability', () => {
    const html = render({ status: 'success', summary: summary(3) });
    expect(html).toContain('Fiscal Real');
    expect(html).toContain('24/09/2026');
    expect(html).toContain('>3</strong>');
    expect(html).toContain('Cobertura parcial');
    expect(html).toContain('Indisponível');
    expect(html).toContain('Fila indisponível');
    expect(html).toContain('Consulta desabilitada');
    expect(html.match(/>0<\/strong>/g)).toHaveLength(1); // Alertas disponíveis sem ocorrências; demais fontes seguem indisponíveis.
  });

  it('shows real zero and an available empty queue distinctly', () => {
    const html = render({ status: 'success', summary: summary(0, []) });
    expect(html).toContain('>0</strong>');
    expect(html).toContain('Nenhum contrato ativo');
    expect(html).toContain('Fila apurada sem ocorrências');
    expect(html).not.toContain('Fila indisponível');
  });

  it('shows unavailable KPI source when requested', () => {
    const base = summary(2);
    const mixed: FiscalDashboardSummaryResponse = {
      ...base,
      meta: { ...base.meta, filtersApplied: { ...base.meta.filtersApplied, includeExternal: true },
        sources: [{ system: 'SAC' }, { system: 'KPIs', status: 'UNAVAILABLE', updatedAt: null }], merCoverage: 'MIXED' },
    };
    const html = render({ status: 'success', summary: mixed }, true);
    expect(html).toContain('Fonte KPI: Indisponível');
    expect(html).not.toContain('Consulta desabilitada');
  });

  it('keeps real zero separate from unavailable counts and queues', () => {
    expect(countLabel(0)).toBe('0');
    expect(countLabel(null)).toBe('Indisponível');
    expect(queueLabel([])).toBe('Fila apurada sem ocorrências');
    expect(queueLabel(null)).toBe('Fila indisponível');
  });
});

it('renders contracts and view balances while keeping unsupported panels unavailable', () => {
  const data = summary(1, []);
  data.data.contracts = [{ contractId: 23, contractNumber: '13/2025', supplierName: 'Fornecedor de teste', value: 300000, expiryDate: '2026-10-20' }];
  data.data.contractBalances = [{ contractId: 23, contractNumber: '13/2025', contractedValue: 300000, consumedValue: 0, balanceValue: 300000, balancePct: 100 }];
  const html = render({ status: 'success', summary: data });
  expect(html).toContain('13/2025');
  expect(html).toContain('Fornecedor de teste');
  expect(html.replaceAll('\u00a0', ' ')).toContain('R$ 300.000,00');
  expect(html.replaceAll('\u00a0', ' ')).toContain('R$ 0,00');
  expect(html).toContain('100%');
  expect(html).toContain('20/10/2026');
  for (const title of ['Saúde da carteira', 'Distribuição dos itens por faixa']) {
    expect(html).toMatch(new RegExp(`${title}[\\s\\S]*?Indisponível[\\s\\S]*?</section>`));
  }
  expect(html).toContain('Itens críticos');
  expect(html).toContain('Ações vencidas');
});

it('distinguishes empty portfolio from unavailable contract lists and balances', () => {
  const empty = render({ status: 'success', summary: summary(0, []) });
  expect(empty).toContain('Nenhum contrato vigente na carteira');
  const unavailable = summary(1);
  unavailable.data.contracts = null;
  unavailable.data.contractBalances = null;
  unavailable.meta.dataCoverage.contracts = 'UNAVAILABLE';
  unavailable.meta.dataCoverage.contractBalances = 'UNAVAILABLE';
  const html = render({ status: 'success', summary: unavailable });
  expect(html).not.toContain('Nenhum contrato vigente na carteira');
  expect(html).not.toContain('R$ 0,00');
});

it('renders contractual alerts separately from the fiscal queue and overdue actions', () => {
  const data = summary(1, []);
  data.data.contractAlerts = [{ alertId: 126, contractId: 2, contractNumber: 'CT-2', description: 'Vigência próxima do fim', expiryDate: '2026-10-20', createdAt: '2026-10-01T12:00:00Z' }];
  const html = render({ status: 'success', summary: data });
  expect(html).toMatch(/Alertas contratuais[\s\S]*CT-2[\s\S]*Vigência próxima do fim[\s\S]*20\/10\/2026/);
  expect(html).toContain('Fila apurada sem ocorrências');
  expect(data.data.cards.overdueActions).toBeNull();
});

it('distinguishes empty alerts from unavailable coverage', () => {
  const data = summary(0, []);
  expect(render({ status: 'success', summary: data })).toContain('Nenhum alerta contratual no recorte');
  data.data.contractAlerts = null;
  data.meta.dataCoverage.contractAlerts = 'UNAVAILABLE';
  const html = render({ status: 'success', summary: data });
  expect(html).toMatch(/Alertas contratuais[\s\S]*?Indisponível[\s\S]*?<\/section>/);
  expect(html).not.toContain('Nenhum alerta contratual no recorte');
});

it('formats queue timestamps in the dashboard timezone', () => {
  const data = summary(1, [{ serviceOrderId: 11, pendencies: [{ pendencyId: 101, description: null, status: 'aberta' as const }], type: 'SERVICE_ORDER', severity: null, contractId: 2,
    contractNumber: '13/2025', supplierName: null, title: null, dueAt: '2026-10-21T01:00:00Z' }]);
  const html = render({ status: 'success', summary: data });
  expect(html).toContain('20/10/2026');
  expect(html).not.toContain('2026-10-21T01:00:00Z');
});

it('distinguishes a valid empty item portfolio from an unavailable source', () => {
  const data = summary(1);
  data.data.itemBalances = { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: 0.6, limiar_critico: 0.1 },
    resumo: { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 },
    agregados: { totalContratado: 0, saldoComprometido: 0, saldoMedido: 0, itemCount: 0, completeValueRows: 0,
      contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 }, itens: [] };
  data.data.contractBalances = [{ contractId: 2, contractNumber: '13/2025',
    contractedValue: 300000, consumedValue: 0, balanceValue: 300000, balancePct: 100 }];
  const original = structuredClone(data);
  const empty = render({ status: 'success', summary: data });
  expect(empty).toContain('Nenhum item contratual cadastrado na carteira.');
  const host = document.createElement('div');
  host.innerHTML = empty;
  const financialTotals = [...host.querySelectorAll('.saldo-summary strong')].slice(0, 3);
  expect(financialTotals.map(node => node.textContent)).toEqual(Array(3).fill('Sem itens cadastrados'));
  expect(host.querySelector('.fiscal-saldos')?.textContent).toContain('Não há dados de itens cadastrados na carteira para avaliar o saldo');
  expect(host.querySelector('.fiscal-saldos')?.textContent).not.toContain('R$');
  const consolidated = [...host.querySelectorAll('.fiscal-panel')].find(panel => panel.querySelector('h2')?.textContent === 'Saldo consolidado por contrato');
  expect(consolidated?.textContent).toContain('13/2025');
  expect(consolidated?.textContent).toContain('300.000,00');
  expect(data).toEqual(original);
  expect(empty).toContain('60%');
  data.data.itemBalances = { coverage: 'UNAVAILABLE' };
  const unavailable = render({ status: 'success', summary: data });
  expect(unavailable).toContain('Fonte de saldos por item indisponível');
  expect(unavailable).not.toContain('Nenhum item contratual cadastrado na carteira.');
  expect(unavailable).not.toContain('Sem itens cadastrados');
});

it('shows item critical count separately from the legacy criticalItems card', () => {
  const data = summary(1);
  data.data.itemBalances = { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: 0.6, limiar_critico: 0.1 },
    resumo: { adequado: 0, atencao: 0, critico: 1, nao_verificavel: 0 },
    agregados: { totalContratado: 100, saldoComprometido: -1, saldoMedido: 100, itemCount: 1, completeValueRows: 1,
      contractedValueRows: 1, committedBalanceRows: 1, measuredBalanceRows: 1 },
    itens: [{ contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor', itemId: 10, sequence: 1,
      specification: 'Serviço', unit: 'un', quantityContracted: 1, quantityConsumed: 0, quantityMeasured: 0,
      quantityBalance: 1, valueContracted: 100, valueConsumed: 101, valueMeasured: 0, valueBalance: -1,
      valueMeasuredBalance: 100, quantityMeasuredBalance: 1,
      pctSaldo: -0.01, pctSaldoMedido: 1, faixa: 'critico', statusVerificacao: 'ok', blockedAt: null, blockReason: null }] };
  const html = render({ status: 'success', summary: data });
  expect(html).toContain('Saldo negativo');
  expect(html).toContain('Verificação: ok');
  expect(html).toContain('Itens críticos</span><strong>1</strong>');
  expect(html).toContain('Itens críticos (legado)</span><strong class="unavailable-value">Indisponível</strong>');
});

it('uses backend measured balances and shows coverage per aggregate', () => {
  const data = summary(1);
  data.data.itemBalances = { coverage: 'AVAILABLE', criterio: { base: 'medido', dimensao: 'valor', limiar_atencao: 0.6, limiar_critico: 0.1 },
    resumo: { adequado: 0, atencao: 1, critico: 0, nao_verificavel: 0 },
    agregados: { totalContratado: 100, saldoComprometido: null, saldoMedido: 30, itemCount: 1,
      completeValueRows: 0, contractedValueRows: 1, committedBalanceRows: 0, measuredBalanceRows: 1 },
    itens: [{ contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor', itemId: 10, sequence: 1,
      specification: 'Serviço', unit: 'un', quantityContracted: 1, quantityConsumed: 0, quantityMeasured: 0,
      quantityBalance: 1, valueContracted: 100, valueConsumed: 0, valueMeasured: 70, valueBalance: null,
      valueMeasuredBalance: 30.01, quantityMeasuredBalance: 1, pctSaldo: null, pctSaldoMedido: 0.3001,
      faixa: 'atencao', statusVerificacao: null, blockedAt: null, blockReason: null }] };
  const html = render({ status: 'success', summary: data }).replaceAll('\u00a0', ' ');
  expect(html).toContain('Saldo comprometido incompleto: 0 de 1');
  expect(html).not.toContain('Total contratado incompleto');
  expect(html).not.toContain('Saldo medido incompleto');
  expect(html).toContain('R$ 30,01');
  expect(html).toContain('Saldo comprometido dos itens</span><strong>Indisponível</strong>');
});

function item(itemId: number, contractId: number, supplierName: string | null, faixa: 'adequado' | 'atencao' | 'critico' | 'nao_verificavel', overrides: Record<string, unknown> = {}) {
  return { contractId, contractNumber: `CT-${contractId}`, supplierName, itemId, sequence: itemId,
    specification: `Item ${itemId}`, unit: 'un', quantityContracted: 1, quantityConsumed: 0,
    quantityMeasured: 0, quantityBalance: 1, valueContracted: 100, valueConsumed: 0,
    valueMeasured: 0, valueBalance: 100, valueMeasuredBalance: 100, quantityMeasuredBalance: 1,
    pctSaldo: 1, pctSaldoMedido: 1, faixa, statusVerificacao: null, blockedAt: null, blockReason: null,
    ...overrides } as NonNullable<FiscalDashboardSummaryResponse['data']['itemBalances']> extends infer B
      ? B extends { coverage: 'AVAILABLE'; itens: (infer I)[] } ? I : never : never;
}

function withItems(items: ReturnType<typeof item>[]): FiscalDashboardSummaryResponse {
  const data = summary(2, []);
  data.data.itemBalances = { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 },
    resumo: { adequado: 2, atencao: 0, critico: 1, nao_verificavel: 1 },
    agregados: { totalContratado: null, saldoComprometido: null, saldoMedido: null, itemCount: items.length,
      completeValueRows: 2, contractedValueRows: items.filter(i => i.valueContracted !== null).length,
      committedBalanceRows: items.filter(i => i.valueBalance !== null).length,
      measuredBalanceRows: items.filter(i => i.valueMeasuredBalance !== null).length }, itens: items };
  data.data.contractBalances = [{ contractId: 1, contractNumber: 'CT-1', contractedValue: 999, consumedValue: 0, balanceValue: 999, balancePct: 100 }];
  return data;
}

function mount(data: FiscalDashboardSummaryResponse) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const update = (next: FiscalDashboardSummaryResponse) => act(() => root.render(<FiscalDashboardView state={{ status: 'success', summary: next }} includeExternal={false} onIncludeExternalChange={() => {}} />));
  update(data);
  const select = (label: string, value: string) => {
    const control = [...host.querySelectorAll('.saldo-filters label')].find(node => node.textContent?.startsWith(label))?.querySelector('select');
    if (!control) throw new Error(`Select ausente: ${label}`);
    act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const search = (value: string) => {
    const control = host.querySelector<HTMLInputElement>('.saldo-filters input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(control, value);
      control.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const clear = () => act(() => { host.querySelector<HTMLButtonElement>('.saldo-filter-meta button')!.click(); });
  const section = (title: string) => [...host.querySelectorAll('section.fiscal-panel')].find(node => node.querySelector('h2')?.textContent === title)?.textContent ?? '';
  const selected = (label: string) => [...host.querySelectorAll('.saldo-filters label')].find(node => node.textContent?.startsWith(label))?.querySelector('select')?.value;
  const query = () => host.querySelector<HTMLInputElement>('.saldo-filters input[type="search"]')?.value;
  return { host, update, select, search, clear, section, selected, query, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

const sampleItems = () => [
  item(1, 1, 'Árvore', 'adequado', { specification: 'Serviço de rede', valueContracted: 100, valueBalance: 70, valueMeasuredBalance: 80 }),
  item(2, 2, 'Zeta', 'critico', { specification: 'Fibra óptica', valueContracted: 200, valueBalance: 10, valueMeasuredBalance: 30 }),
  item(3, 3, 'Árvore', 'nao_verificavel', { contractNumber: 'CT-2', specification: null, valueContracted: null, valueBalance: null, valueMeasuredBalance: null }),
  item(4, 4, null, 'adequado', { contractNumber: null, specification: null, valueContracted: 50, valueBalance: 40, valueMeasuredBalance: 45 }),
];

describe('filtros interativos dos saldos', () => {
  it('mostra quatro controles, fornecedores distintos e contratos separados por ID', () => {
    const view = mount(withItems(sampleItems()));
    try {
      for (const label of ['Fornecedor', 'Contrato', 'Faixa', 'Busca textual']) expect(view.host.textContent).toContain(label);
      const selects = view.host.querySelectorAll<HTMLSelectElement>('.saldo-filters select');
      expect([...selects[0].options].map(o => o.textContent)).toEqual(['Todos os fornecedores', 'Árvore', 'Zeta']);
      expect([...selects[1].options].map(o => o.value)).toEqual(['', '1', '2', '3', '4']);
      expect(selects[1].options[2].textContent).toContain('ID 2');
      expect(selects[1].options[3].textContent).toContain('ID 3');
      expect(selects[1].options[4].textContent).toContain('Contrato ID 4');
    } finally { view.unmount(); }
  });

  it('filtra fornecedor, contrato e faixa isoladamente e limpa cada um', () => {
    const view = mount(withItems(sampleItems()));
    try {
      view.select('Fornecedor', 'Zeta');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 4 itens encontrados');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Fibra óptica');
      view.select('Fornecedor', '');
      view.select('Contrato', '3');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 4 itens encontrados');
      view.select('Contrato', '');
      view.select('Faixa', 'critico');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 4 itens encontrados');
      view.select('Faixa', '');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('4 de 4 itens encontrados');
    } finally { view.unmount(); }
  });

  it('combina filtros, busca sem caixa ou acento e recompõe totais e distribuição', () => {
    const view = mount(withItems(sampleItems()));
    try {
      view.search('FIBRA OPTICA');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 4 itens encontrados');
      view.search('');
      view.search('CT-2');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('2 de 4 itens encontrados');
      view.search('ARVORE');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('2 de 4 itens encontrados');
      view.search('1');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 4 itens encontrados');
      view.search('');
      view.select('Fornecedor', 'Árvore');
      view.select('Contrato', '1');
      view.select('Faixa', 'adequado');
      const filtered = view.section('Gestão dos Saldos dos Itens Contratuais');
      expect(filtered).toContain('1 de 4 itens encontrados');
      expect(filtered).toContain('R$ 100,00');
      expect(filtered).toContain('R$ 70,00');
      expect(filtered).toContain('R$ 80,00');
      expect([...view.host.querySelectorAll('.fiscal-band-buttons button span')].map(span => span.textContent)).toEqual(['Adequado: 1', 'Atenção: 0', 'Crítico: 0', 'Não verificável: 0']);
      expect(view.section('Saldo consolidado por contrato')).toContain('R$ 999,00');
      expect(view.host.textContent).toContain('Contratos sob fiscalização');
      view.clear();
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('4 de 4 itens encontrados');
    } finally { view.unmount(); }
  });

  it('distingue ausência de resultados, fonte indisponível e carteira sem itens', () => {
    const view = mount(withItems(sampleItems()));
    try {
      view.select('Fornecedor', 'Zeta');
      view.select('Faixa', 'adequado');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Nenhum item encontrado com os filtros atuais.');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('R$ 0,00');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Os totais dos itens representam um recorte sem resultados');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).not.toContain('Sem itens cadastrados');
      const unavailable = withItems([]);
      unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
      view.update(unavailable);
      expect(view.host.querySelectorAll('.saldo-filters select')).toHaveLength(0);
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Fonte de saldos por item indisponível');
      view.update(withItems([]));
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Nenhum item contratual cadastrado na carteira.');
      expect([...view.host.querySelectorAll('.saldo-summary strong')].slice(0, 3).map(node => node.textContent)).toEqual(Array(3).fill('Sem itens cadastrados'));
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).not.toContain('recorte sem resultados');
      expect(view.host.querySelector<HTMLSelectElement>('.saldo-filters select')!.value).toBe('Zeta');
    } finally { view.unmount(); }
  });

  it('preserva nulos e informa cobertura incompleta no recorte', () => {
    const view = mount(withItems(sampleItems()));
    try {
      view.select('Fornecedor', 'Árvore');
      const section = view.section('Gestão dos Saldos dos Itens Contratuais');
      expect(section).toContain('2 de 4 itens encontrados');
      expect(section).toContain('Total contratado dos itensIndisponível');
      expect(section).toContain('Saldo comprometido incompleto: 1 de 2');
      expect(section).toContain('Saldo medido incompleto: 1 de 2');
      expect(view.section('Distribuição dos itens por faixa')).toContain('Não verificável: 1');
      view.search('SEM ESPECIFICACAO');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Nenhum item encontrado');
    } finally { view.unmount(); }
  });
});

describe('atualizações dos filtros e agregados', () => {
  it('usa os agregados da API quando um filtro ativo seleciona a lista inteira, sem descartar duplicatas', () => {
    const data = withItems([
      item(1, 1, 'Árvore', 'adequado', { valueContracted: 10.005 }),
      item(2, 1, 'Árvore', 'adequado', { valueContracted: 20.005 }),
    ]);
    if (data.data.itemBalances?.coverage !== 'AVAILABLE') throw new Error('fixture inválida');
    data.data.itemBalances.agregados = { ...data.data.itemBalances.agregados,
      totalContratado: 30.01, saldoComprometido: 200, saldoMedido: 200,
      contractedValueRows: 2, committedBalanceRows: 2, measuredBalanceRows: 2 };
    const view = mount(data);
    try {
      view.select('Fornecedor', 'Árvore');
      view.select('Contrato', '1');
      view.search('ARVORE');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('2 de 2 itens encontrados');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado dos itensR$ 30,01');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Saldo comprometido dos itensR$ 200,00');
      expect(view.section('Distribuição dos itens por faixa')).toContain('Adequado: 2');
    } finally { view.unmount(); }
  });

  it('recalcula apenas o subconjunto e mantém nulos; o recorte vazio vale zero', () => {
    const data = withItems(sampleItems());
    if (data.data.itemBalances?.coverage !== 'AVAILABLE') throw new Error('fixture inválida');
    data.data.itemBalances.agregados = { ...data.data.itemBalances.agregados,
      totalContratado: 999, saldoComprometido: 999, saldoMedido: 999 };
    const view = mount(data);
    try {
      view.select('Contrato', '1');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado dos itensR$ 100,00');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Saldo comprometido dos itensR$ 70,00');
      view.select('Contrato', '3');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado dos itensIndisponível');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Total contratado incompleto: 0 de 1');
      view.select('Faixa', 'adequado');
      const empty = view.section('Gestão dos Saldos dos Itens Contratuais');
      expect(empty).toContain('0 de 4 itens encontrados');
      expect(empty).toContain('Total contratado dos itensR$ 0,00');
      expect(empty).toContain('Saldo comprometido dos itensR$ 0,00');
      expect(empty).toContain('Saldo medido dos itensR$ 0,00');
    } finally { view.unmount(); }
  });

  it('preserva filtros com novos objetos equivalentes e novos itens na mesma carteira', () => {
    const base = withItems(sampleItems());
    const view = mount(base);
    try {
      view.select('Fornecedor', 'Árvore');
      view.select('Contrato', '1');
      view.select('Faixa', 'adequado');
      view.search('SERVICO');
      view.update(structuredClone(base));
      expect(view.selected('Fornecedor')).toBe('Árvore');
      expect(view.selected('Contrato')).toBe('1');
      expect(view.selected('Faixa')).toBe('adequado');
      expect(view.query()).toBe('SERVICO');
      const more = withItems([...sampleItems(), item(5, 1, 'Árvore', 'adequado', { specification: 'Serviço novo' })]);
      view.update(more);
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('2 de 5 itens encontrados');
      expect(view.selected('Fornecedor')).toBe('Árvore');
      expect(view.selected('Contrato')).toBe('1');
      expect(view.selected('Faixa')).toBe('adequado');
      expect(view.query()).toBe('SERVICO');
    } finally { view.unmount(); }
  });

  it('mantém fornecedor e contrato ausentes sem ampliar o recorte ou apagar faixa e busca', () => {
    const view = mount(withItems(sampleItems()));
    try {
      view.select('Fornecedor', 'Zeta');
      view.select('Contrato', '2');
      view.select('Faixa', 'critico');
      view.search('FIBRA');
      view.update(withItems([item(8, 8, 'Outro', 'critico', { specification: 'Fibra nova' })]));
      expect(view.selected('Fornecedor')).toBe('Zeta');
      expect(view.selected('Contrato')).toBe('2');
      expect(view.selected('Faixa')).toBe('critico');
      expect(view.query()).toBe('FIBRA');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('0 de 1 itens encontrados');
      view.update(withItems(sampleItems()));
      expect(view.selected('Fornecedor')).toBe('Zeta');
      expect(view.selected('Contrato')).toBe('2');
    } finally { view.unmount(); }
  });

  it('limpa filtros ao trocar fiscal ou recorte autorizado, sem limpar ao alternar fonte externa', () => {
    const base = withItems(sampleItems());
    const view = mount(base);
    try {
      view.select('Fornecedor', 'Árvore');
      view.search('SERVICO');
      const external = structuredClone(base);
      external.meta.filtersApplied.includeExternal = true;
      view.update(external);
      expect(view.selected('Fornecedor')).toBe('Árvore');
      expect(view.query()).toBe('SERVICO');
      const otherFiscal = structuredClone(base);
      otherFiscal.data.fiscal.userId = 88;
      view.update(otherFiscal);
      expect(view.selected('Fornecedor')).toBe('');
      expect(view.query()).toBe('');
      view.select('Contrato', '1');
      const otherScope = structuredClone(otherFiscal);
      otherScope.meta.filtersApplied.contratoId = [1];
      view.update(otherScope);
      expect(view.selected('Contrato')).toBe('');
    } finally { view.unmount(); }
  });

  it('esconde dados e controles durante UNAVAILABLE e restaura seleções válidas no retorno', () => {
    const base = withItems(sampleItems());
    const view = mount(base);
    try {
      view.select('Fornecedor', 'Árvore');
      view.select('Faixa', 'adequado');
      view.search('SERVICO');
      const unavailable = structuredClone(base);
      unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
      view.update(unavailable);
      expect(view.host.querySelectorAll('.saldo-filters select')).toHaveLength(0);
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).not.toContain('Serviço de rede');
      expect(view.section('Distribuição dos itens por faixa')).toContain('Indisponível');
      view.update(structuredClone(base));
      expect(view.selected('Fornecedor')).toBe('Árvore');
      expect(view.selected('Faixa')).toBe('adequado');
      expect(view.query()).toBe('SERVICO');
      expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('1 de 4 itens encontrados');
    } finally { view.unmount(); }
  });
});

function queuePanel(queue: FiscalDashboardSummaryResponse['data']['priorityQueue']) {
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: summary(1, queue) });
  return host.querySelector('.fiscal-action-queue')!;
}
const pendingOrder = {
  serviceOrderId: 11, pendencies: [{ pendencyId: 101, description: null, status: 'aberta' as const }], type: 'SERVICE_ORDER' as const, severity: null, contractId: 184, contractNumber: 'CT-184',
  supplierName: null, title: null, dueAt: null,
};
it('explains portfolio eligibility and each missing queue field without personal attribution or financial guesses', () => {
  const data = summary(1, [pendingOrder]);
  data.data.contractBalances = [{ contractId: 184, contractNumber: 'CT-184',
    contractedValue: 20000, consumedValue: 2060, balanceValue: 17940, balancePct: 89.7 }];
  data.data.contracts = [{ contractId: 184, contractNumber: 'CT-184', supplierName: 'Empresa do contrato',
    value: 20000, expiryDate: '2026-10-01' }];
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: data });
  const panel = host.querySelector('.fiscal-action-queue')!;
  const row = panel.querySelector('tbody tr')!;
  expect(panel.textContent).toContain('OS com decisão fiscal pendente na carteira');
  expect(panel.textContent).toContain('não comprova tarefa atribuída diretamente a você');
  expect(panel.textContent).toContain('A ordem das linhas não representa prioridade');
  expect(panel.textContent).toContain('Valor e saldo do contrato não medem impacto');
  expect(panel.textContent).toContain('competência e vigência não são prazo para decidir');
  expect(row.textContent).toContain('Severidade não definida');
  expect(row.textContent).toContain('Fornecedor não identificado na fila');
  expect(row.textContent).toContain('Decisão fiscal pendente no Processo 1');
  expect(row.textContent).toContain('Impacto não apurado');
  expect(row.textContent).toContain('Prazo de decisão não disponível');
  expect(row.textContent).toContain('Recomendação não definida para esta OS');
  for (const inferred of ['17.940', '01/10/2026', 'Empresa do contrato', 'Indisponível', 'P1'])
    expect(row.textContent).not.toContain(inferred);
  expect(panel.querySelectorAll('a')).toHaveLength(0);
  expect(panel.querySelectorAll('button')).toHaveLength(2);
  expect(panel.querySelector('button')?.disabled).toBe(true);
});
it('preserves supplied queue fields and source order without inventing a priority ranking', () => {
  const panel = queuePanel([
    { ...pendingOrder, contractNumber: 'CT-184', severity: 'BAIXA', title: 'Título da fonte',
      pendencies: [{ pendencyId: 101, description: 'Descrição da fonte', status: 'aberta' }],
      supplierName: 'Fornecedor da fonte', dueAt: '2026-09-25T01:00:00Z' },
    { ...pendingOrder, serviceOrderId: 12, contractId: 205, contractNumber: 'CT-205', severity: 'ALTA' },
  ]);
  const rows = panel.querySelectorAll('tbody tr');
  expect(rows[0].textContent).toContain('BAIXA');
  expect(rows[0].textContent).toContain('Descrição da fonte');
  expect(rows[0].textContent).toContain('Fornecedor da fonte');
  expect(rows[0].textContent).toContain('24/09/2026');
  expect(rows[1].textContent).toContain('CT-205');
  expect(rows[1].textContent).toContain('ALTA');
  expect(panel.querySelector('thead')?.textContent).toContain('Severidade');
  expect(panel.querySelector('thead')?.textContent).not.toContain('Prior.');
});
it('keeps queue availability independent from the pending orders card', () => {
  expect(queuePanel([]).textContent).toContain('Fila apurada sem ocorrências');
  expect(queuePanel(null).textContent).toContain('Fila indisponível');
  expect(queuePanel(null).textContent).not.toContain('Fila apurada sem ocorrências');
  const data = summary(1, null);
  data.data.cards.pendingServiceOrders = 2;
  data.meta.dataCoverage.pendingServiceOrders = 'AVAILABLE';
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: data });
  expect(host.querySelector('.fiscal-action-queue')?.textContent).toContain('Fila indisponível');
});

it('renders all P1 pendency descriptions within one row per OS and falls back only for missing descriptions', () => {
  const panel = queuePanel([
    { ...pendingOrder, pendencies: [
      { pendencyId: 101, description: 'Documento divergente', status: 'aberta' },
      { pendencyId: 102, description: 'Valor precisa ser conferido', status: 'em_tratamento' },
      { pendencyId: 103, description: null, status: 'aberta' },
      { pendencyId: 104, description: '   ', status: 'aberta' },
      { pendencyId: 105, description: '<script>conteúdo da fonte</script>', status: 'aberta' },
    ] },
    { ...pendingOrder, serviceOrderId: 12, pendencies: [
      { pendencyId: 106, description: 'Motivo da segunda OS', status: 'em_tratamento' },
    ] },
  ]);
  const rows = panel.querySelectorAll('tbody tr');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('th')?.textContent).toBe('OS ID 11');
  expect([...rows[0].querySelectorAll('li')].map(li => li.firstChild?.textContent)).toEqual([
    'Documento divergente', 'Valor precisa ser conferido',
    'Decisão fiscal pendente no Processo 1', 'Decisão fiscal pendente no Processo 1',
    '<script>conteúdo da fonte</script>',
  ]);
  expect(panel.querySelector('script')).toBeNull();
  expect(rows[0].textContent).not.toContain('Motivo da segunda OS');
  expect(rows[1].textContent).not.toContain('Documento divergente');
  expect(rows[1].querySelector('th')?.textContent).toBe('OS ID 12');
  expect(rows[1].textContent).toContain('Motivo da segunda OS');
});

it('keeps real zero balances monetary and distinct from a filter with no results', () => {
  const data = withItems([item(1, 2, 'Fornecedor', 'critico', {
    contractNumber: '13/2025', valueContracted: 100, valueConsumed: 100, valueMeasured: 100,
    valueBalance: 0, valueMeasuredBalance: 0, pctSaldo: 0, pctSaldoMedido: 0,
  })]);
  if (data.data.itemBalances?.coverage !== 'AVAILABLE') throw new Error('Expected available items');
  data.data.itemBalances.agregados = { ...data.data.itemBalances.agregados,
    totalContratado: 100, saldoComprometido: 0, saldoMedido: 0 };
  const view = mount(data);
  try {
    const totals = () => [...view.host.querySelectorAll('.saldo-summary strong')].slice(0, 3).map(node => node.textContent);
    expect(totals()).toEqual(['R$ 100,00', 'R$ 0,00', 'R$ 0,00']);
    const section = () => view.section('Gestão dos Saldos dos Itens Contratuais');
    expect(section()).toContain('1 de 1 itens encontrados');
    expect(section()).not.toContain('Sem itens cadastrados');
    expect(section()).not.toContain('recorte sem resultados');
    view.search('item inexistente');
    expect(section()).toContain('0 de 1 itens encontrados');
    expect(section()).toContain('recorte sem resultados');
    expect(section()).not.toContain('Sem itens cadastrados');
    expect(totals()).toEqual(Array(3).fill('R$ 0,00'));
    view.clear();
    expect(totals()).toEqual(['R$ 100,00', 'R$ 0,00', 'R$ 0,00']);
    expect(section()).not.toContain('recorte sem resultados');
  } finally { view.unmount(); }
});

it('expands item details without changing filters, totals, portfolio balances or empty states', () => {
  const data = withItems(sampleItems());
  const original = structuredClone(data);
  const view = mount(data);
  try {
    view.select('Fornecedor', 'Árvore');
    const before = view.host.querySelector('.saldo-summary')!.textContent;
    const balances = view.section('Saldo consolidado por contrato');
    const expand = view.host.querySelector<HTMLButtonElement>('.fiscal-item-details button')!;
    act(() => expand.click());
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    expect(view.selected('Fornecedor')).toBe('Árvore');
    expect(view.host.querySelector('.saldo-summary')!.textContent).toBe(before);
    expect(view.section('Saldo consolidado por contrato')).toBe(balances);
    expect(data).toEqual(original);
    view.search('inexistente');
    expect(view.host.querySelector('.fiscal-item-details')).toBeNull();
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('recorte sem resultados');
    view.clear();
    expect(view.host.querySelector('.fiscal-item-details button')?.getAttribute('aria-expanded')).toBe('false');
    const unavailable = structuredClone(data);
    unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
    view.update(unavailable);
    expect(view.host.querySelector('.fiscal-item-details')).toBeNull();
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Fonte de saldos por item indisponível');
    view.update(withItems([]));
    expect(view.host.querySelector('.fiscal-item-details')).toBeNull();
    expect(view.section('Gestão dos Saldos dos Itens Contratuais')).toContain('Sem itens cadastrados');
  } finally { view.unmount(); }
});

it('shows calendar-relative expiry in existing alert and contract rows without changing their inclusion or queue deadlines', () => {
  const data = summary(4, [{ ...pendingOrder, dueAt: '2026-10-09T01:00:00Z' }]);
  data.meta.dataReference = '2026-10-08';
  const dates = ['2026-10-07', '2026-10-08', '2026-10-09', null];
  data.data.contracts = dates.map((expiryDate, index) => ({ contractId: index + 1, contractNumber: `CT-${index + 1}`,
    supplierName: 'Fornecedor', value: 100, expiryDate }));
  data.data.contractAlerts = dates.map((expiryDate, index) => ({ alertId: index + 1, contractId: index + 1,
    contractNumber: `CT-${index + 1}`, description: 'Pendência já retornada pela API', expiryDate, createdAt: null }));
  const original = structuredClone(data);
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: data });
  for (const title of ['Alertas contratuais', 'Contratos fiscalizados']) {
    const panel = [...host.querySelectorAll('.fiscal-panel')].find(panel => panel.querySelector('h2')?.textContent === title)!;
    expect(panel.querySelectorAll('tbody tr')).toHaveLength(4);
    expect([...panel.querySelectorAll('.fiscal-contract-expiry small')].map(node => node.textContent)).toEqual([
      'Vencido há 1 dia', 'Vence hoje', 'Vence em 1 dia', 'Data de vigência indisponível',
    ]);
    expect(panel.textContent).toContain('07/10/2026');
    expect(panel.textContent).toContain('08/10/2026');
    expect(panel.textContent).toContain('09/10/2026');
    expect(panel.textContent).toContain('vigência contratual, não ao prazo de decisão fiscal');
    expect(panel.textContent).toContain('referência 08/10/2026');
  }
  expect(host.querySelector('.fiscal-action-queue')?.textContent).not.toContain('Vence em');
  expect(data).toEqual(original);
});

it('keeps unavailable historical contract and alert lists without manufacturing expiry rows', () => {
  const data = summary(1, null);
  data.meta.dataReference = '2024-02-28';
  data.data.contracts = null;
  data.data.contractAlerts = null;
  data.meta.dataCoverage.contracts = 'UNAVAILABLE';
  data.meta.dataCoverage.contractAlerts = 'UNAVAILABLE';
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: data });
  expect(host.querySelectorAll('.fiscal-contract-expiry')).toHaveLength(0);
  expect(host.textContent).not.toContain('Vence hoje');
  expect(host.textContent).not.toContain('Vencido há');
});

function queueControls(view: ReturnType<typeof mount>) {
  const panel = () => view.host.querySelector('.fiscal-action-queue')!;
  const select = (index: number, value: string) => {
    const control = panel().querySelectorAll<HTMLSelectElement>('.fiscal-queue-filters select')[index];
    act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const search = (value: string) => {
    const control = panel().querySelector<HTMLInputElement>('.fiscal-queue-filters input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(control, value);
      control.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const clear = () => act(() => panel().querySelector<HTMLButtonElement>('.fiscal-queue-filter-meta button')!.click());
  return { panel, select, search, clear };
}
it('filters OS and their pendencies locally, counts OS and preserves the global card and every other panel', () => {
  const data = structuredClone(queueFixture);
  const original = structuredClone(data);
  const view = mount(data);
  const controls = queueControls(view);
  try {
    const otherPanels = [...view.host.querySelectorAll('.fiscal-panel:not(.fiscal-action-queue)')].map(panel => panel.textContent);
    const cards = view.host.querySelector('.fiscal-kpis')!.textContent;
    controls.select(1, 'em_tratamento');
    controls.search('DÓCUMENTO');
    expect(controls.panel().textContent).toContain('1 de 4 OS');
    expect(controls.panel().querySelectorAll('tbody tr')).toHaveLength(1);
    expect(controls.panel().textContent).toContain('OS ID 12');
    expect(controls.panel().textContent).toContain('Documento em revisão');
    expect(controls.panel().textContent).not.toContain('Documento ausente');
    expect(controls.panel().textContent).not.toContain('Conferir valor');
    expect(controls.panel().textContent).toContain('1 pendência oculta pelos filtros');
    expect(view.host.querySelector('.fiscal-kpis')!.textContent).toBe(cards);
    expect([...view.host.querySelectorAll('.fiscal-panel:not(.fiscal-action-queue)')].map(panel => panel.textContent)).toEqual(otherPanels);
    expect(data).toEqual(original);
    controls.clear();
    expect(controls.panel().textContent).toContain('4 de 4 OS');
    expect(controls.panel().querySelectorAll('tbody tr')).toHaveLength(4);
    expect(controls.panel().textContent).not.toContain('pendência oculta pelos filtros');
    expect(controls.panel().querySelector('.fiscal-queue-filter-meta button')?.getAttribute('disabled')).not.toBeNull();
  } finally { view.unmount(); }
});
it('keeps contract IDs distinct even when numbers repeat and combines all three queue filters', () => {
  const view = mount(structuredClone(queueFixture));
  const controls = queueControls(view);
  try {
    const options = controls.panel().querySelectorAll('.fiscal-queue-filters select')[0].querySelectorAll('option');
    expect([...options].map(option => option.value)).toEqual(['', '184', '205', '317']);
    expect(options[1].textContent).toContain('13/2025 (ID 184)');
    expect(options[2].textContent).toContain('13/2025 (ID 205)');
    controls.select(0, '184');
    controls.select(1, 'aberta');
    controls.search('documento');
    expect(controls.panel().textContent).toContain('1 de 4 OS');
    expect(controls.panel().textContent).toContain('OS ID 11');
    expect(controls.panel().textContent).toContain('2 pendências ocultas pelos filtros');
    expect(controls.panel().textContent).not.toContain('Conferir valor');
    expect(controls.panel().textContent).not.toContain('Decisão fiscal pendente no Processo 1');
  } finally { view.unmount(); }
});
it('distinguishes empty queue, filters with no matches and unavailable source', () => {
  const view = mount(structuredClone(queueFixture));
  const controls = queueControls(view);
  try {
    controls.search('sem-correspondencia');
    expect(controls.panel().textContent).toContain('0 de 4 OS');
    expect([...controls.panel().querySelectorAll('button')].find(b => b.textContent === 'Exportar CSV')?.disabled).toBe(true);
    expect(controls.panel().textContent).toContain('Nenhuma OS encontrada com os filtros atuais.');
    expect(controls.panel().textContent).not.toContain('Fila apurada sem ocorrências');
    const empty = structuredClone(queueFixture);
    empty.data.priorityQueue = [];
    view.update(empty);
    expect(controls.panel().textContent).toContain('0 de 0 OS');
    expect([...controls.panel().querySelectorAll('button')].find(b => b.textContent === 'Exportar CSV')?.disabled).toBe(true);
    expect(controls.panel().textContent).toContain('Fila apurada sem ocorrências');
    const unavailable = structuredClone(empty);
    unavailable.data.priorityQueue = null;
    view.update(unavailable);
    expect(controls.panel().textContent).toContain('Fila indisponível');
    expect(controls.panel().textContent).not.toContain('0 de 0 OS');
    expect(controls.panel().querySelector('.fiscal-queue-filters')).toBeNull();
    expect([...controls.panel().querySelectorAll('button')].find(b => b.textContent === 'Exportar CSV')?.disabled).toBe(true);
  } finally { view.unmount(); }
});
it.each(['user', 'unit', 'contracts', 'reference'] as const)('resets queue filters on a change to %s', change => {
  const view = mount(structuredClone(queueFixture));
  const controls = queueControls(view);
  try {
    controls.select(0, '184'); controls.select(1, 'aberta'); controls.search('Documento');
    const next = structuredClone(queueFixture);
    if (change === 'user') next.data.fiscal.userId = 88;
    if (change === 'unit') next.meta.filtersApplied.unidadeId = 2;
    if (change === 'contracts') {
      next.meta.filtersApplied.contratoId = [184];
      next.data.priorityQueue = next.data.priorityQueue!.filter(item => item.contractId === 184);
      next.data.cards.pendingServiceOrders = 2;
    }
    if (change === 'reference') next.meta.dataReference = '2026-10-09';
    view.update(next);
    expect([...controls.panel().querySelectorAll('select')].map(select => select.value)).toEqual(['', '']);
    expect(controls.panel().querySelector<HTMLInputElement>('input')!.value).toBe('');
    expect(controls.panel().textContent).toContain(change === 'contracts' ? '2 de 2 OS' : '4 de 4 OS');
    if (change === 'contracts') {
      controls.search('documento'); controls.clear();
      expect(controls.panel().textContent).not.toContain('OS ID 12');
      expect(controls.panel().textContent).not.toContain('OS ID 14');
    }
  } finally { view.unmount(); }
});
it('preserves queue filters across unavailable coverage with the same scope and retains vanished contract options without broadening the selection', () => {
  const view = mount(structuredClone(queueFixture));
  const controls = queueControls(view);
  try {
    controls.select(0, '205'); controls.select(1, 'em_tratamento'); controls.search('documento');
    const unavailable = structuredClone(queueFixture);
    unavailable.data.priorityQueue = null;
    view.update(unavailable);
    view.update(structuredClone(queueFixture));
    expect([...controls.panel().querySelectorAll('select')].map(select => select.value)).toEqual(['205', 'em_tratamento']);
    expect(controls.panel().querySelector<HTMLInputElement>('input')!.value).toBe('documento');
    const changed = structuredClone(queueFixture);
    changed.data.priorityQueue = changed.data.priorityQueue!.filter(item => item.contractId !== 205);
    view.update(changed);
    expect(controls.panel().querySelector('select')!.value).toBe('205');
    expect(controls.panel().textContent).toContain('O contrato selecionado não está disponível nesta fila.');
    expect(controls.panel().querySelector<HTMLInputElement>('input')!.value).toBe('documento');
    expect(controls.panel().textContent).toContain('0 de 3 OS');
  } finally { view.unmount(); }
});


it('recovers from an API 500 to an empty queue and item portfolio without invoking CSV download', async () => {
  const data = structuredClone(queueFixture);
  data.data.priorityQueue = [];
  data.data.cards.pendingServiceOrders = 0;
  if (data.data.itemBalances?.coverage === 'AVAILABLE') {
    data.data.itemBalances.itens = [];
    data.data.itemBalances.resumo = { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 };
    data.data.itemBalances.agregados = { totalContratado: 0, saldoComprometido: 0, saldoMedido: 0,
      itemCount: 0, completeValueRows: 0, contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 };
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 500 })
    .mockResolvedValueOnce({ ok: true, json: async () => data });
  vi.stubGlobal('fetch', fetchMock);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<FiscalDashboard />); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('HTTP 500');
    expect(host.querySelector('.fiscal-action-queue')).toBeNull();
    // Remount after the dependency is restored, as a browser reload would do.
    await act(async () => { root.render(<FiscalDashboard key="restored" />); });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.fiscal-action-queue')?.textContent).toContain('0 de 0 OS');
    expect(host.querySelector('.fiscal-action-queue')?.textContent).toContain('Fila apurada sem ocorrências');
    expect(host.textContent).toContain('Sem itens cadastrados');
    expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Exportar CSV')?.disabled).toBe(true);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/v1/fiscais/me/dashboard/resumo?includeExternal=false',
      '/api/v1/fiscais/me/dashboard/resumo?includeExternal=false',
    ]);
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

function pendingResponse() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function mountedDashboard(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<FiscalDashboard />));
  const refresh = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Atualizar dados')!;
  return { host, refresh, cleanup: () => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); } };
}
const okResponse = (data: FiscalDashboardSummaryResponse) => ({ ok: true, json: async () => data });

it('refreshes without hiding the previous data, preserves filters and synchronously blocks repeated clicks', async () => {
  const next = pendingResponse();
  const initial = structuredClone(queueFixture);
  const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(initial)).mockReturnValueOnce(next.promise);
  const view = await mountedDashboard(fetchMock);
  try {
    const panel = view.host.querySelector('.fiscal-action-queue')!;
    const contract = panel.querySelector('select')!;
    const status = panel.querySelectorAll('select')[1];
    const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!;
    const band = [...view.host.querySelectorAll('.saldo-filters label')].find(label => label.textContent?.startsWith('Faixa'))!.querySelector('select')!;
    const sort = view.host.querySelector<HTMLSelectElement>('.fiscal-item-sort select')!;
    // Existing helper scopes the item controls, independently from queue controls.
    const itemSelect = [...view.host.querySelectorAll('.saldo-filters label')].find(label => label.textContent?.startsWith('Contrato'))!.querySelector('select')!;
    act(() => {
      contract.value = '205'; contract.dispatchEvent(new Event('change', { bubbles: true }));
      itemSelect.value = '2'; itemSelect.dispatchEvent(new Event('change', { bubbles: true }));
      status.value = 'em_tratamento'; status.dispatchEvent(new Event('change', { bubbles: true }));
      band.value = 'adequado'; band.dispatchEvent(new Event('change', { bubbles: true }));
      sort.value = 'balance'; sort.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'documento');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      view.refresh().click(); view.refresh().click(); view.refresh().click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(view.refresh().disabled).toBe(true);
    expect(view.host.textContent).toContain('Atualizando dados');
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toContain('1 de 4 OS');
    expect(view.host.querySelector('.fiscal-saldos')).not.toBeNull();
    const updated = structuredClone(initial);
    updated.meta.generatedAt = '2026-10-09T01:35:42Z';
    await act(async () => next.resolve(okResponse(updated)));
    expect(view.refresh().disabled).toBe(false);
    expect(view.host.textContent).not.toContain('Atualizando dados');
    expect(view.host.textContent).toContain('Última atualização do dashboard: 08/10/2026, 22:35:42');
    expect(view.host.querySelector('.fiscal-action-queue select')!.getAttribute('id')).toBeTruthy();
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-action-queue select')!.value).toBe('205');
    expect(itemSelect.value).toBe('2');
    expect(status.value).toBe('em_tratamento');
    expect(search.value).toBe('documento');
    expect(band.value).toBe('adequado');
    expect(sort.value).toBe('balance');
  } finally { view.cleanup(); }
});
it('preserves data, timestamp and filters on refresh failure and recovers on retry', async () => {
  const failed = pendingResponse();
  const recovered = structuredClone(queueFixture);
  recovered.meta.generatedAt = '2026-10-09T02:35:42Z';
  const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(queueFixture))
    .mockReturnValueOnce(failed.promise).mockResolvedValueOnce(okResponse(recovered));
  const view = await mountedDashboard(fetchMock);
  try {
    const contract = view.host.querySelector<HTMLSelectElement>('.fiscal-action-queue select')!;
    act(() => { contract.value = '184'; contract.dispatchEvent(new Event('change', { bubbles: true })); });
    const timestamp = view.host.querySelector('.fiscal-refresh span')!.textContent;
    act(() => view.refresh().click());
    await act(async () => failed.resolve({ ok: false, status: 500 }));
    expect(view.host.querySelector('[role="alert"]')!.textContent).toContain('Os dados não foram atualizados');
    expect(view.host.textContent).toContain('HTTP 500');
    expect(view.host.querySelector('.fiscal-refresh span')!.textContent).toBe(timestamp);
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toContain('2 de 4 OS');
    expect(view.refresh().disabled).toBe(false);
    await act(async () => view.refresh().click());
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    expect(view.host.querySelector('.fiscal-refresh span')!.textContent).not.toBe(timestamp);
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-action-queue select')!.value).toBe('184');
  } finally { view.cleanup(); }
});
it('allows retry after an initial failure without presenting a previous-data refresh warning', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce(okResponse(queueFixture));
  const view = await mountedDashboard(fetchMock);
  try {
    expect(view.host.textContent).toContain('Erro ao carregar o resumo');
    expect(view.host.textContent).not.toContain('Os dados não foram atualizados');
    expect(view.host.querySelector('.fiscal-refresh span')).toBeNull();
    expect(view.refresh().disabled).toBe(false);
    await act(async () => view.refresh().click());
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    expect(view.host.querySelector('.fiscal-action-queue')).not.toBeNull();
  } finally { view.cleanup(); }
});
it.each(['success', 'failure'] as const)('ignores a stale %s after a newer request returns a different authorized scope', async outcome => {
  const oldRequest = pendingResponse();
  const newest = pendingResponse();
  const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(queueFixture))
    .mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newest.promise);
  const view = await mountedDashboard(fetchMock);
  try {
    const contract = view.host.querySelector<HTMLSelectElement>('.fiscal-action-queue select')!;
    act(() => { contract.value = '205'; contract.dispatchEvent(new Event('change', { bubbles: true })); view.refresh().click(); });
    act(() => view.host.querySelector<HTMLInputElement>('.external-switch input')!.click());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const changed = structuredClone(queueFixture);
    changed.data.fiscal.userId = 88;
    changed.meta.filtersApplied.unidadeId = 2;
    changed.meta.filtersApplied.contratoId = [184];
    changed.data.priorityQueue = changed.data.priorityQueue!.filter(row => row.contractId === 184);
    changed.data.cards.pendingServiceOrders = 2;
    // Valid external response uses the existing HTTP schema.
    const { responseForRequest } = await import('../../../../../scripts/test/fixtures/fiscal-queue-filters');
    await act(async () => newest.resolve(okResponse(responseForRequest(changed, true))));
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toContain('2 de 2 OS');
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-action-queue select')!.value).toBe('');
    await act(async () => {
      if (outcome === 'success') oldRequest.resolve(okResponse(queueFixture));
      else oldRequest.reject(new Error('stale failure'));
    });
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toContain('2 de 2 OS');
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).not.toContain('OS ID 12');
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    expect(view.refresh().disabled).toBe(false);
  } finally { view.cleanup(); }
});

it('exports only the combined local item selection and disables item export for no matches, no items or unavailable source', () => {
  const data = withItems(sampleItems());
  const view = mount(data);
  let content = '';
  let filename = '';
  const createUrl = vi.fn().mockReturnValue('blob:items-fixture');
  const revokeUrl = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  vi.stubGlobal('Blob', class { constructor(parts: string[]) { content = parts.join(''); } });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
  vi.useFakeTimers();
  const button = () => view.host.querySelector<HTMLButtonElement>('.fiscal-items-export button')!;
  try {
    expect(button().disabled).toBe(false);
    const card = view.host.querySelector('.fiscal-kpis')!.textContent;
    const queue = view.host.querySelector('.fiscal-action-queue')!.textContent;
    view.select('Fornecedor', 'Zeta'); view.select('Contrato', '2'); view.select('Faixa', 'critico'); view.search('FIBRA');
    act(() => button().click());
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(filename).toBe(`itens-fiscal-${data.meta.dataReference}.csv`);
    const balances = data.data.itemBalances;
    if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing test source');
    const { itens, criterio } = balances;
    const selected = itens.filter(item => item.supplierName === 'Zeta' && item.contractId === 2 && item.faixa === 'critico');
    expect(selected).toHaveLength(1);
    expect(content).toBe(fiscalItemsCsv(selected, data.meta.dataReference, criterio));
    expect(view.selected('Contrato')).toBe('2'); expect(view.query()).toBe('FIBRA');
    expect(view.host.querySelector('.fiscal-kpis')!.textContent).toBe(card);
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toBe(queue);
    expect(view.host.querySelector('a[download]')).toBeNull();
    vi.runAllTimers(); expect(revokeUrl).toHaveBeenCalledWith('blob:items-fixture');
    view.search('sem-correspondencia'); expect(button().disabled).toBe(true);
    act(() => button().click()); expect(createUrl).toHaveBeenCalledTimes(1);
    view.update(withItems([])); expect(button().disabled).toBe(true);
    const unavailable = withItems([]); unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
    view.update(unavailable); expect(button().disabled).toBe(true);
    expect(view.host.querySelector('.fiscal-saldos')!.textContent).toContain('Fonte de saldos por item indisponível');
  } finally { view.unmount(); click.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});

function itemSortControls(view: ReturnType<typeof mount>) {
  const select = (index: number, value: string) => {
    const control = view.host.querySelectorAll<HTMLSelectElement>('.fiscal-item-sort select')[index];
    act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const ids = () => [...view.host.querySelectorAll('.fiscal-saldos tbody tr')].map(row => Number(row.querySelector('button')?.getAttribute('aria-label')?.match(/ID (\d+)/)?.[1]));
  return { select, ids };
}
it('sorts displayed items only, retains expanded details on the correct item and composes local filters without changing aggregates', () => {
  const data = structuredClone(csvItemFixtures.committedValue);
  const original = structuredClone(data);
  const view = mount(data);
  const sort = itemSortControls(view);
  try {
    expect(sort.ids()).toEqual([101, 102, 103, 104, 105]);
    const totals = view.host.querySelector('.saldo-summary')!.textContent;
    const distribution = view.section('Distribuição dos itens por faixa');
    const card = view.host.querySelector('.fiscal-kpis')!.textContent;
    const queue = view.host.querySelector('.fiscal-action-queue')!.textContent;
    const details = view.host.querySelector<HTMLButtonElement>('[aria-label="Expandir detalhes do item ID 101"]')!;
    act(() => details.click());
    sort.select(0, 'balance');
    expect(sort.ids()).toEqual([105, 103, 102, 101, 104]);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(details.closest('tr')!.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Detalhes do item ID 101');
    expect(view.host.querySelector('.saldo-summary')!.textContent).toBe(totals);
    expect(view.section('Distribuição dos itens por faixa')).toBe(distribution);
    expect(view.host.querySelector('.fiscal-kpis')!.textContent).toBe(card);
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toBe(queue);
    sort.select(1, 'desc');
    expect(sort.ids()).toEqual([101, 102, 103, 105, 104]);
    expect(details.closest('tr')).toBe(view.host.querySelector('.fiscal-saldos tbody tr'));
    expect(details.getAttribute('aria-expanded')).toBe('true');
    view.select('Fornecedor', 'Fornecedor de teste'); view.select('Contrato', '2'); view.select('Faixa', 'critico'); view.search('ITEM');
    expect(sort.ids()).toEqual([103]);
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-item-sort select')!.value).toBe('balance');
    view.clear(); expect(sort.ids()).toEqual([101, 102, 103, 105, 104]);
    sort.select(0, 'source'); expect(sort.ids()).toEqual([101, 102, 103, 104, 105]);
    expect(view.host.querySelectorAll<HTMLSelectElement>('.fiscal-item-sort select')[1].disabled).toBe(true);
    expect(data).toEqual(original);
  } finally { view.unmount(); }
});
it.each(['user', 'unit', 'contracts', 'reference'] as const)('resets item sorting on %s change while retaining it on equivalent refreshes and unavailable coverage', change => {
  const data = structuredClone(csvItemFixtures.committedValue);
  const view = mount(data);
  const sort = itemSortControls(view);
  try {
    sort.select(0, 'ratio'); sort.select(1, 'desc');
    view.update(structuredClone(data));
    expect([...view.host.querySelectorAll<HTMLSelectElement>('.fiscal-item-sort select')].map(control => control.value)).toEqual(['ratio', 'desc']);
    const unavailable = structuredClone(data); unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
    view.update(unavailable); view.update(structuredClone(data));
    expect([...view.host.querySelectorAll<HTMLSelectElement>('.fiscal-item-sort select')].map(control => control.value)).toEqual(['ratio', 'desc']);
    const changed = structuredClone(data);
    if (change === 'user') changed.data.fiscal.userId = 88;
    if (change === 'unit') changed.meta.filtersApplied.unidadeId = 2;
    if (change === 'contracts') changed.meta.filtersApplied.contratoId = [2];
    if (change === 'reference') changed.meta.dataReference = '2026-10-09';
    view.update(changed);
    expect([...view.host.querySelectorAll<HTMLSelectElement>('.fiscal-item-sort select')].map(control => control.value)).toEqual(['source', 'asc']);
    expect(sort.ids()).toEqual([101, 102, 103, 104, 105]);
  } finally { view.unmount(); }
});
it('downloads item CSV in exactly the displayed sort order, including after filtering', () => {
  const data = structuredClone(csvItemFixtures.committedValue);
  const view = mount(data);
  const sort = itemSortControls(view);
  let content = '';
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn().mockReturnValue('blob:sorted'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('Blob', class { constructor(parts: string[]) { content = parts.join(''); } });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.useFakeTimers();
  try {
    const balances = data.data.itemBalances;
    if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing fixture');
    sort.select(0, 'balance'); sort.select(1, 'desc');
    act(() => view.host.querySelector<HTMLButtonElement>('.fiscal-items-export button')!.click());
    expect(content).toBe(fiscalItemsCsv(sort.ids().map(id => balances.itens.find(item => item.itemId === id)!), data.meta.dataReference, balances.criterio));
    view.select('Fornecedor', 'Fornecedor de teste'); view.select('Contrato', '2'); view.select('Faixa', 'critico');
    act(() => view.host.querySelector<HTMLButtonElement>('.fiscal-items-export button')!.click());
    expect(content).toBe(fiscalItemsCsv([balances.itens[2]], data.meta.dataReference, balances.criterio));
  } finally { vi.runAllTimers(); view.unmount(); click.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});

function paginationControls(view: ReturnType<typeof mount>) {
  const nav = () => view.host.querySelector('.fiscal-item-pagination')!;
  const size = (value: string) => {
    const control = nav().querySelector('select')!;
    act(() => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const next = () => act(() => nav().querySelectorAll<HTMLButtonElement>('button')[1].click());
  const previous = () => act(() => nav().querySelector<HTMLButtonElement>('button')!.click());
  return { nav, size, next, previous };
}
it('paginates after filters/sorting and keeps totals, distribution, correct details and complete sorted CSV independent of the page', () => {
  const data = structuredClone(paginationFixture);
  const view = mount(data);
  const pages = paginationControls(view);
  const sort = itemSortControls(view);
  let content = '';
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn().mockReturnValue('blob:pagination'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('Blob', class { constructor(parts: string[]) { content = parts.join(''); } });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.useFakeTimers();
  try {
    expect(pages.nav().querySelector('select')!.value).toBe('25');
    expect(pages.nav().textContent).toContain('Exibindo 1–25 de 51 itens filtrados · Página 1 de 3');
    expect(sort.ids()).toHaveLength(25);
    expect(pages.nav().querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    const totals = view.host.querySelector('.saldo-summary')!.textContent;
    const distribution = view.section('Distribuição dos itens por faixa');
    pages.next(); expect(pages.nav().textContent).toContain('26–50');
    const details = view.host.querySelector<HTMLButtonElement>('[aria-label="Expandir detalhes do item ID 1026"]')!;
    act(() => details.click());
    expect(details.closest('tr')!.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Detalhes do item ID 1026');
    pages.next(); pages.next(); expect(sort.ids()).toEqual([1051]);
    expect(pages.nav().textContent).toContain('Exibindo 51–51 de 51 itens filtrados · Página 3 de 3');
    expect(pages.nav().querySelectorAll<HTMLButtonElement>('button')[1].disabled).toBe(true);
    pages.previous(); expect(sort.ids()[0]).toBe(1026);
    expect(view.host.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0); // No state transferred to another item.
    expect(view.host.querySelector('.saldo-summary')!.textContent).toBe(totals);
    expect(view.section('Distribuição dos itens por faixa')).toBe(distribution);
    sort.select(0, 'identity'); sort.select(1, 'desc');
    expect(pages.nav().textContent).toContain('Página 1 de 3'); expect(sort.ids()[0]).toBe(1051);
    pages.next();
    act(() => view.host.querySelector<HTMLButtonElement>('.fiscal-items-export button')!.click());
    const balances = data.data.itemBalances;
    if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing fixture');
    expect(content).toBe(fiscalItemsCsv([...balances.itens].reverse(), data.meta.dataReference, balances.criterio));
    expect(content.match(/"2026-10-08";/g)).toHaveLength(51);
    pages.size('10'); expect(sort.ids()).toHaveLength(10); expect(pages.nav().textContent).toContain('Página 1 de 6');
    pages.next(); view.select('Fornecedor', 'Fornecedor A');
    expect(pages.nav().textContent).toContain('Exibindo 1–10 de 30 itens filtrados · Página 1 de 3');
    pages.next(); view.select('Contrato', '2'); expect(pages.nav().textContent).toContain('Página 1 de 3');
    pages.next(); view.select('Faixa', 'adequado'); expect(pages.nav().textContent).toContain('Página 1 de 3');
    pages.next(); view.search('Serviço 01'); expect(sort.ids()).toEqual([1001]); expect(pages.nav().textContent).toContain('Página 1 de 1');
    view.clear(); expect(pages.nav().textContent).toContain('Página 1 de 6');
    pages.size('50'); expect(sort.ids()).toHaveLength(50); pages.next(); expect(sort.ids()).toEqual([1001]);
    expect(pages.nav().textContent).toContain('Exibindo 51–51 de 51 itens filtrados · Página 2 de 2');
  } finally { vi.runAllTimers(); view.unmount(); click.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
it('preserves valid pages on refresh, clamps to the last available page after reduction and retains page/size across temporary unavailable coverage', () => {
  const data = structuredClone(paginationFixture);
  const view = mount(data); const pages = paginationControls(view);
  try {
    pages.size('10'); pages.next(); pages.next();
    view.update(structuredClone(data)); expect(pages.nav().textContent).toContain('Página 3 de 6');
    const fewer = structuredClone(data);
    if (fewer.data.itemBalances?.coverage === 'AVAILABLE') fewer.data.itemBalances.itens = fewer.data.itemBalances.itens.slice(0, 21);
    view.update(fewer); expect(pages.nav().textContent).toContain('Exibindo 21–21 de 21 itens filtrados · Página 3 de 3');
    if (fewer.data.itemBalances?.coverage === 'AVAILABLE') fewer.data.itemBalances.itens = fewer.data.itemBalances.itens.slice(0, 11);
    view.update(structuredClone(fewer)); expect(pages.nav().textContent).toContain('Exibindo 11–11 de 11 itens filtrados · Página 2 de 2');
    const unavailable = structuredClone(fewer); unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
    view.update(unavailable); expect(view.host.querySelector('.fiscal-item-pagination')).toBeNull();
    view.update(structuredClone(data)); expect(pages.nav().textContent).toContain('Página 2 de 6');
    if (fewer.data.itemBalances?.coverage === 'AVAILABLE') fewer.data.itemBalances.itens = [];
    view.update(fewer); expect(pages.nav().textContent).toContain('Exibindo 0–0 de 0 itens filtrados · Página 0 de 0');
    expect([...pages.nav().querySelectorAll<HTMLButtonElement>('button')].every(button => button.disabled)).toBe(true);
    expect(view.host.textContent).toContain('Nenhum item contratual cadastrado na carteira.');
    view.update(data); expect(pages.nav().textContent).toContain('Página 1 de 6');
    view.search('sem-correspondencia'); expect(pages.nav().textContent).toContain('0–0 de 0');
    expect(view.host.textContent).toContain('Nenhum item encontrado com os filtros atuais.');
  } finally { view.unmount(); }
});
it.each(['user', 'unit', 'contracts', 'reference'] as const)('resets paging and default size after %s changes', change => {
  const data = structuredClone(paginationFixture);
  const view = mount(data); const pages = paginationControls(view);
  try {
    pages.size('10'); pages.next();
    const changed = structuredClone(data);
    if (change === 'user') changed.data.fiscal.userId = 88;
    if (change === 'unit') changed.meta.filtersApplied.unidadeId = 2;
    if (change === 'contracts') changed.meta.filtersApplied.contratoId = [2, 184];
    if (change === 'reference') changed.meta.dataReference = '2026-10-09';
    view.update(changed);
    expect(pages.nav().querySelector('select')!.value).toBe('25');
    expect(pages.nav().textContent).toContain('Exibindo 1–25 de 51 itens filtrados · Página 1 de 3');
  } finally { view.unmount(); }
});
it('keeps a valid page during and after the real manual-refresh flow', async () => {
  const response = pendingResponse();
  const view = await mountedDashboard(vi.fn().mockResolvedValueOnce(okResponse(paginationFixture)).mockReturnValueOnce(response.promise));
  try {
    const next = () => view.host.querySelectorAll<HTMLButtonElement>('.fiscal-item-pagination button')[1];
    act(() => next().click());
    const previousPage = view.host.querySelector('.fiscal-item-pagination')!.textContent;
    act(() => view.refresh().click()); expect(view.host.querySelector('.fiscal-item-pagination')!.textContent).toBe(previousPage);
    await act(async () => response.resolve(okResponse(structuredClone(paginationFixture))));
    expect(view.host.querySelector('.fiscal-item-pagination')!.textContent).toBe(previousPage);
  } finally { view.cleanup(); }
});

function bandControls(view: ReturnType<typeof mount>) {
  const button = (band: string) => view.host.querySelector<HTMLButtonElement>(`.fiscal-band-buttons button[data-band="${band}"]`)!;
  const click = (band: string) => act(() => button(band).click());
  const counts = () => [...view.host.querySelectorAll('.fiscal-band-buttons button span')].map(span => Number(span.textContent?.split(': ')[1]));
  return { button, click, counts };
}
it('selects, removes and switches bands while retaining pre-band counts, other filters and ordering, resetting the page and exporting the applied filter', () => {
  const data = structuredClone(bandFixture); const original = structuredClone(data);
  const view = mount(data); const bands = bandControls(view); const pages = paginationControls(view); const sort = itemSortControls(view);
  let content = '';
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn().mockReturnValue('blob:bands'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('Blob', class { constructor(parts: string[]) { content = parts.join(''); } });
  const downloadClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); vi.useFakeTimers();
  try {
    expect(bands.counts()).toEqual([24, 24, 24, 24]);
    const cards = view.host.querySelector('.fiscal-kpis')!.textContent;
    const queue = view.host.querySelector('.fiscal-action-queue')!.textContent;
    view.select('Fornecedor', 'Fornecedor A'); view.select('Contrato', '2'); view.search('SERVIÇO GRUPO A');
    expect(bands.counts()).toEqual([12, 12, 12, 12]);
    expect(view.host.querySelector('.fiscal-band-distribution')!.textContent).toContain('antes da faixa e da paginação');
    sort.select(0, 'identity'); sort.select(1, 'desc'); pages.size('10'); pages.next();
    expect(pages.nav().textContent).toContain('Página 2 de 5');
    bands.click('adequado');
    expect(view.selected('Faixa')).toBe('adequado'); expect(bands.button('adequado').getAttribute('aria-pressed')).toBe('true');
    expect(bands.button('adequado').textContent).toContain('✓ Selecionada');
    expect(bands.counts()).toEqual([12, 12, 12, 12]); expect(pages.nav().textContent).toContain('Página 1 de 2');
    expect(view.host.querySelector('.saldo-summary')!.textContent).toContain('R$ 12.000,00');
    pages.next(); bands.click('adequado');
    expect(view.selected('Faixa')).toBe(''); expect(bands.button('adequado').getAttribute('aria-pressed')).toBe('false');
    expect(pages.nav().textContent).toContain('Página 1 de 5');
    bands.click('atencao'); pages.next(); bands.click('critico');
    expect(view.selected('Faixa')).toBe('critico'); expect(bands.button('atencao').getAttribute('aria-pressed')).toBe('false');
    expect(bands.button('critico').getAttribute('aria-pressed')).toBe('true'); expect(pages.nav().textContent).toContain('Página 1 de 2');
    expect(bands.counts()).toEqual([12, 12, 12, 12]);
    expect(view.selected('Fornecedor')).toBe('Fornecedor A'); expect(view.selected('Contrato')).toBe('2'); expect(view.query()).toBe('SERVIÇO GRUPO A');
    expect([...view.host.querySelectorAll<HTMLSelectElement>('.fiscal-item-sort select')].map(control => control.value)).toEqual(['identity', 'desc']);
    expect(view.host.querySelector('.fiscal-kpis')!.textContent).toBe(cards); expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toBe(queue);
    pages.next(); act(() => view.host.querySelector<HTMLButtonElement>('.fiscal-items-export button')!.click());
    const balances = data.data.itemBalances;
    if (balances?.coverage !== 'AVAILABLE') throw new Error('Missing fixture');
    const selected = balances.itens.filter(item => item.contractId === 2 && item.faixa === 'critico').reverse();
    expect(content).toBe(fiscalItemsCsv(selected, data.meta.dataReference, balances.criterio));
    expect(content.match(/"2026-10-08";/g)).toHaveLength(12);
    view.select('Faixa', 'nao_verificavel');
    expect(bands.button('nao_verificavel').getAttribute('aria-pressed')).toBe('true'); expect(bands.button('critico').getAttribute('aria-pressed')).toBe('false');
    view.search('sem correspondencia'); expect(bands.counts()).toEqual([0, 0, 0, 0]);
    expect(bands.button('nao_verificavel').disabled).toBe(false); bands.click('nao_verificavel');
    expect(view.selected('Faixa')).toBe(''); expect(view.query()).toBe('sem correspondencia');
    expect(data).toEqual(original);
  } finally { vi.runAllTimers(); view.unmount(); downloadClick.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
it('keeps zero pre-band buttons on an empty portfolio distinct from unavailable source and reapplies the stored selection after refresh', () => {
  const view = mount(structuredClone(bandFixture)); const bands = bandControls(view);
  try {
    bands.click('atencao'); view.update(structuredClone(bandFixture));
    expect(bands.button('atencao').getAttribute('aria-pressed')).toBe('true'); expect(bands.counts()).toEqual([24, 24, 24, 24]);
    const unavailable = structuredClone(bandFixture); unavailable.data.itemBalances = { coverage: 'UNAVAILABLE' };
    view.update(unavailable);
    expect(view.host.querySelectorAll('.fiscal-band-buttons button')).toHaveLength(0);
    expect(view.host.querySelector('.fiscal-band-distribution')!.textContent).toContain('Indisponível');
    view.update(structuredClone(bandFixture)); expect(bands.button('atencao').getAttribute('aria-pressed')).toBe('true');
    const empty = structuredClone(bandFixture);
    if (empty.data.itemBalances?.coverage === 'AVAILABLE') empty.data.itemBalances.itens = [];
    view.update(empty); expect(bands.counts()).toEqual([0, 0, 0, 0]);
    expect([...view.host.querySelectorAll<HTMLButtonElement>('.fiscal-band-buttons button')].every(button => button.disabled)).toBe(true);
    expect(view.host.querySelector('.fiscal-band-distribution')!.textContent).toContain('Sem itens cadastrados na carteira.');
    expect(view.host.textContent).toContain('Sem itens cadastrados');
  } finally { view.unmount(); }
});

it('VIS-003 keeps the principal fiscal sequence in the DOM and preserves complementary content', () => {
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: bandFixture });
  const titles = [...host.querySelectorAll('.panel-heading h2')].map(node => node.textContent);
  expect(titles.slice(0, 7)).toEqual([
    'Minha fila de ação', 'Saúde da carteira', 'Saldo consolidado por contrato',
    'Distribuição dos itens por faixa', 'Gestão dos Saldos dos Itens Contratuais',
    'Ciclo financeiro do contrato', 'Relevância Econômica das Partes do Contrato / ABC',
  ]);
  const complement = host.querySelector('.fiscal-complementary')!;
  expect(complement.getAttribute('aria-labelledby')).toBe('fiscal-complementary-title');
  expect([...complement.querySelectorAll('.panel-heading h2')].map(node => node.textContent)).toEqual([
    'Vigências e renovações', 'Pagamento e medição', 'Alertas contratuais', 'Contratos fiscalizados',
  ]);
  expect(complement.textContent).toContain('Alerta independente dos filtros da fila');
  expect(complement.querySelectorAll('.fiscal-contract-expiry').length).toBeGreaterThan(0);
  const balanceRow = host.querySelector('.fiscal-balances-grid')!;
  expect([...balanceRow.children].map(node => node.querySelector('h2')?.textContent)).toEqual([
    'Saldo consolidado por contrato', 'Distribuição dos itens por faixa',
  ]);
  expect(host.querySelectorAll('.fiscal-band-buttons button')).toHaveLength(4);
  expect(host.querySelector('.fiscal-saldos')?.textContent).toContain('Exportar itens CSV');
});

it('VIS-003 keeps unavailable and empty complementary fiscal panels distinct', () => {
  const empty = summary(0, []);
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: empty });
  expect(host.querySelector('.fiscal-complementary')?.textContent).toContain('Nenhum alerta contratual no recorte');
  expect(host.querySelector('.fiscal-complementary')?.textContent).toContain('Nenhum contrato vigente na carteira');
  const unavailable = structuredClone(empty);
  unavailable.data.contractAlerts = null; unavailable.meta.dataCoverage.contractAlerts = 'UNAVAILABLE';
  unavailable.data.contracts = null; unavailable.meta.dataCoverage.contracts = 'UNAVAILABLE';
  host.innerHTML = render({ status: 'success', summary: unavailable });
  expect(host.querySelector('.fiscal-complementary')?.textContent).toContain('Indisponível');
  expect(host.querySelector('.fiscal-complementary')?.textContent).not.toContain('Nenhum alerta contratual no recorte');
  expect(host.querySelector('.fiscal-complementary')?.textContent).not.toContain('Nenhum contrato vigente na carteira');
});

it('VIS-004 groups queue counts and actions without changing keyboard order or visible export guidance', () => {
  const host = document.createElement('div');
  host.innerHTML = render({ status: 'success', summary: queueFixture });
  const panel = host.querySelector('.fiscal-action-queue')!;
  const actions = panel.querySelector('.fiscal-queue-actions')!;
  expect(actions.textContent).toContain('4 de 4 OS');
  expect([...actions.querySelectorAll('button')].map(node => node.textContent)).toEqual([
    'Limpar filtros da fila', 'Exportar CSV',
  ]);
  const exportButton = actions.querySelector('.fiscal-queue-export button')!;
  const note = host.querySelector(`[id="${exportButton.getAttribute('aria-describedby')}"]`)!;
  expect(note.textContent).toContain('Cada linha representa uma pendência');
  expect(note.parentElement).toBe(panel);
  expect(panel.querySelectorAll('thead th')).toHaveLength(7);
  expect(panel.querySelectorAll('.fiscal-queue-filters :is(select,input)')).toHaveLength(3);
  for (const text of ['não comprova tarefa atribuída', 'não representa prioridade',
    'Não há fonte aprovada de severidade', 'As decisões são registradas no SAC']) expect(panel.textContent).toContain(text);
});
