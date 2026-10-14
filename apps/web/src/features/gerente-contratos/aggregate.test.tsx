// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { ManagerDashboardSummaryResponse, ManagerFiscalLoadResponse } from '@sac-etice-bi/contracts';
import { AggregateView } from './aggregate';

const manager: ManagerDashboardSummaryResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
    filtersApplied: { contratoId: [] }, dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE', expiringContracts: 'AVAILABLE',
      renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE', itemBalances: 'UNAVAILABLE', renewalDecisionsD90: 'UNAVAILABLE',
      registrationCompleteness: 'UNAVAILABLE', contractRiskMatrix: 'AVAILABLE' } },
  data: { manager: { userId: 1, name: 'Gestora' },
    cards: { activeContracts: 1, activePortfolioValue: 1000, expiringContracts: 1, renewalsWithin120Days: 1 },
    contracts: [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X', value: 1000, expiryDate: '2026-10-25' }],
    expiringContractList: [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X', value: 1000, expiryDate: '2026-10-25' }],
    contractAlerts: [], contractBalances: [], itemBalances: { coverage: 'UNAVAILABLE' },
    preventiveQuality: { renewalDecisionsD90: null, registrationCompleteness: null },
    contractRiskMatrix: [{ contractId: 7, contractNumber: 'CT-7', supplierName: 'Fornecedor X', saldo: { status: 'CRITICAL', partialCoverage: false, reason: null },
      vigencia: 'OK', sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' }],
  },
};
const load: ManagerFiscalLoadResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA',
    dataCoverage: { inspectors: 'AVAILABLE', activeContracts: 'AVAILABLE', pendingOrders: 'AVAILABLE', capacity: 'UNAVAILABLE', weightedLoad: 'UNAVAILABLE',
      criticality: 'UNAVAILABLE', ranking: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' } },
  data: { inspectors: [{ userId: 3, name: 'Fiscal A', contractIds: [7], activeContracts: 1, pendingOrders: 0,
    capacity: null, weightedLoad: null, criticality: null, ranking: null, overdueActions: null }] },
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function mount() {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<AggregateView state={{ status: 'success', summary: manager, load, loadError: null }} />));
  return { host, unmount: () => act(() => root.unmount()) };
}

it('keeps the nine Autocontido panels in their original groups and seven intervention columns', () => {
  const view = mount();
  try {
    expect([...view.host.querySelectorAll('.aggregate-card h2')].map(node => node.textContent)).toEqual([
      'Matriz Contrato × Dimensão de Risco', 'Carga e risco por fiscal', 'Intervenções gerenciais priorizadas',
      'Forecast 180 dias', 'Exposição financeira', 'Qualidade da gestão',
      'Eficiência do Ciclo Financeiro — carteira gerenciada', 'Curva ABC de Fornecedores', 'Curva ABC de Clientes',
    ]);
    const headers = (panel: Element) => [...panel.querySelectorAll('thead th')].map(node => node.textContent);
    const blocks = view.host.querySelectorAll('.aggregate-block');
    expect(headers(blocks[0])).toEqual([
      'Prior.', 'Fiscal', 'Contrato / Empresa', 'Risco', 'Impacto', 'Ação gerencial', 'Prazo',
    ]);
    expect(headers(blocks[1])).toEqual(['Fase', 'Valor parado', 'Qtd.', 'Tempo médio', 'P90', 'Responsável típico', 'Situação']);
    expect(headers(view.host.querySelectorAll('.aggregate-abc-grid .aggregate-card')[0])).toEqual(
      ['Classe', 'Fornecedor', 'Valor 12m', '%', '% acum.', 'Contratos', 'Risco atual']);
    expect(headers(view.host.querySelectorAll('.aggregate-abc-grid .aggregate-card')[1])).toEqual(
      ['Classe', 'Cliente', 'Recebido 12m', '%', '% acum.', 'Contratos', 'Situação']);
    expect(view.host.querySelectorAll('.aggregate-grid-two .aggregate-card')).toHaveLength(2);
    expect(view.host.querySelectorAll('.aggregate-grid-three .aggregate-card')).toHaveLength(3);
    expect(view.host.querySelectorAll('.aggregate-abc-grid .aggregate-card')).toHaveLength(2);
    expect(view.host.querySelectorAll('.aggregate-phase')).toHaveLength(7);
  } finally { view.unmount(); }
});

it('uses authorized data, keeps unsupported measures unavailable and applies global filters', () => {
  const view = mount();
  try {
    expect(view.host.querySelectorAll('.aggregate-kpi')).toHaveLength(6);
    expect(view.host.textContent).toContain('Fonte e regra aprovadas indisponíveis');
    expect(view.host.querySelector('.aggregate-block tbody tr')?.getAttribute('data-occurrence-id')).toBe('matriz:7:Saldo');
    expect(view.host.querySelector('.aggregate-block')?.textContent).toContain('Avaliar o contrato e o encaminhamento cabível');
    const cells = [...view.host.querySelectorAll('.aggregate-block tbody tr:first-child td')].map(cell => cell.textContent);
    for (const index of [0, 1, 4, 6]) expect(cells[index]).toBe('Indisponível');
    expect(view.host.textContent).not.toContain('Autorizar plano de contingência');
    const search = view.host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(search, 'sem resultado'); search.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(view.host.textContent).toContain('0 de');
    expect(view.host.textContent).toContain('Nenhum contrato no recorte selecionado');
    expect(view.host.querySelector<HTMLSelectElement>('select:disabled')).toBeTruthy();
  } finally { view.unmount(); }
});

it('distinguishes load failure, unavailable scope and summary error', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() => root.render(<AggregateView state={{ status: 'success', summary: manager, load: null, loadError: 'Falha sintética' }} />));
    expect(host.textContent).toContain('Falha sintética');
    const noInspectors = structuredClone(load);
    noInspectors.data.inspectors = [];
    act(() => root.render(<AggregateView state={{ status: 'success', summary: manager, load: noInspectors, loadError: null }} />));
    expect(host.textContent).toContain('Contratos no recorte sem fiscais com designação ativa');
    const empty = structuredClone(manager);
    empty.data.contracts = [];
    empty.data.contractRiskMatrix = [];
    empty.data.cards.activeContracts = 0;
    empty.data.cards.activePortfolioValue = 0;
    act(() => root.render(<AggregateView state={{ status: 'success', summary: empty, load, loadError: null }} />));
    expect(host.textContent).toContain('Carteira autorizada sem contratos');
    const unavailableScope = structuredClone(manager);
    unavailableScope.data.contracts = null;
    unavailableScope.data.contractRiskMatrix = null;
    unavailableScope.meta.dataCoverage.portfolio = 'UNAVAILABLE';
    unavailableScope.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE';
    act(() => root.render(<AggregateView state={{ status: 'success', summary: unavailableScope, load, loadError: null }} />));
    expect(host.querySelectorAll('.aggregate-card h2')).toHaveLength(9);
    expect(host.textContent).toContain('Recorte indisponível');
    expect(host.textContent).toContain('Matriz indisponível');
    expect(host.querySelector('.aggregate-block tbody [data-occurrence-id]')).toBeNull();
    act(() => root.render(<AggregateView state={{ status: 'error', message: 'Erro sintético' }} />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Erro sintético');
  } finally { act(() => root.unmount()); }
});
