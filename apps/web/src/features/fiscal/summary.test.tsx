// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { fixture as queueFixture } from '../../../../../scripts/test/fixtures/fiscal-queue-filters';
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

    const host = document.createElement('div'); host.innerHTML = html;

    expect(host.querySelectorAll('.fiscal-kpis .fiscal-kpi')).toHaveLength(6);
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
    expect(html).toContain('Sem percentual aprovado do Projeto de KPIs');
    expect(html).not.toContain('Consulta desabilitada');
  });

  it('keeps real zero separate from unavailable counts and queues', () => {
    expect(countLabel(0)).toBe('0');
    expect(countLabel(null)).toBe('Indisponível');
    expect(queueLabel([])).toBe('Fila apurada sem ocorrências');
    expect(queueLabel(null)).toBe('Fila indisponível');
  });
});

it('distinguishes empty portfolio from unavailable contract lists and balances', () => {
  const empty = render({ status: 'success', summary: summary(0, []) });
  expect(empty).toContain('Nenhum saldo contratual no recorte operacional');
  const unavailable = summary(1);
  unavailable.data.contracts = null;
  unavailable.data.contractBalances = null;
  unavailable.meta.dataCoverage.contracts = 'UNAVAILABLE';
  unavailable.meta.dataCoverage.contractBalances = 'UNAVAILABLE';
  const html = render({ status: 'success', summary: unavailable });
  expect(html).not.toContain('Nenhum contrato vigente na carteira');
  expect(html).not.toContain('R$ 0,00');
});

it('formats queue timestamps in the dashboard timezone', () => {
  const data = summary(1, [{ serviceOrderId: 11, pendencies: [{ pendencyId: 101, description: null, status: 'aberta' as const }], type: 'SERVICE_ORDER', severity: null, contractId: 2,
    contractNumber: '13/2025', supplierName: null, title: null, dueAt: '2026-10-21T01:00:00Z' }]);
  const html = render({ status: 'success', summary: data });
  expect(html).toContain('20/10/2026');
  expect(html).not.toContain('2026-10-21T01:00:00Z');
});

function mount(data: FiscalDashboardSummaryResponse) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const update = (summary: FiscalDashboardSummaryResponse) => act(() => root.render(<FiscalDashboardView state={{ status: 'success', summary }} includeExternal={false} onIncludeExternalChange={() => {}} />));
  update(data);
  return { host, update, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

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


it('recovers from an API 500 to an empty queue without invoking CSV download', async () => {
  const data = structuredClone(queueFixture);
  data.data.priorityQueue = [];
  data.data.cards.pendingServiceOrders = 0;
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
    expect(host.querySelector('.fiscal-saldos')).toBeNull();
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
    act(() => {
      contract.value = '205'; contract.dispatchEvent(new Event('change', { bubbles: true }));
      status.value = 'em_tratamento'; status.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'documento');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      view.refresh().click(); view.refresh().click(); view.refresh().click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(view.refresh().disabled).toBe(true);
    expect(view.host.textContent).toContain('Atualizando dados');
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toContain('1 de 4 OS');
    expect(view.host.querySelector('.fiscal-saldos')).toBeNull();
    const updated = structuredClone(initial);
    updated.meta.generatedAt = '2026-10-09T01:35:42Z';
    await act(async () => next.resolve(okResponse(updated)));
    expect(view.refresh().disabled).toBe(false);
    expect(view.host.textContent).not.toContain('Atualizando dados');
    expect(view.host.textContent).toContain('Última atualização do dashboard: 08/10/2026, 22:35:42');
    expect(view.host.querySelector('.fiscal-action-queue select')!.getAttribute('id')).toBeTruthy();
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-action-queue select')!.value).toBe('205');
    expect(status.value).toBe('em_tratamento');
    expect(search.value).toBe('documento');
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
  expect(note.closest('details')).toBe(panel.querySelector('.fiscal-queue-tools'));
  expect(panel.querySelector('.fiscal-queue-tools')?.hasAttribute('open')).toBe(false);
  expect(panel.querySelectorAll('thead th')).toHaveLength(7);
  expect(panel.querySelectorAll('.fiscal-queue-filters :is(select,input)')).toHaveLength(3);
  for (const text of ['não comprova tarefa atribuída', 'não representa prioridade',
    'Não há fonte aprovada de severidade', 'As decisões são registradas no SAC']) expect(panel.textContent).toContain(text);
});

function operationalFixture() {
  const data = summary(2);
  data.data.contracts = [
    { contractId: 1, contractNumber: 'CT-1', supplierName: 'Árvore', value: 100, expiryDate: '2026-09-24' },
    { contractId: 2, contractNumber: 'CT-2', supplierName: 'Outro', value: 200, expiryDate: '2027-09-24' },
  ];
  data.data.contractBalances = [
    { contractId: 1, contractNumber: 'CT-1', contractedValue: 100, consumedValue: 50, balanceValue: 50, balancePct: 50 },
    { contractId: 2, contractNumber: 'CT-2', contractedValue: 200, consumedValue: 200, balanceValue: 0, balancePct: 0 },
  ];
  data.data.contractAlerts = [{ alertId: 3, contractId: 1, contractNumber: 'CT-1', description: 'Alerta factual', expiryDate: '2026-09-24', createdAt: null }];
  return data;
}
function overviewControls(host: HTMLElement) {
  const filters = host.querySelector('.fiscal-overview-controls')!;
  return {
    select(index: number, value: string) { const node = filters.querySelectorAll('select')[index]; act(() => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }); },
    search(value: string) { const node = filters.querySelector('input')!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); },
    expiry: () => host.querySelector('.fiscal-operational-expiry')!,
  };
}
it('keeps six fiscal KPIs and does not fabricate health percentages', () => {
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: operationalFixture() });
  expect([...host.querySelectorAll('.fiscal-kpis .fiscal-kpi > span')].map(row => row.textContent)).toEqual([
    'Contratos sob fiscalização', 'Saldo disponível', 'Vencimentos', 'SLA', 'Medições', 'Pagamentos',
  ]);
  expect([...host.querySelectorAll('.fiscal-kpis strong')].map(row => row.textContent)).toEqual(['2', 'R$\u00a050,00', '1', 'Indisponível', 'Indisponível', 'Indisponível']);
  expect(host.querySelectorAll('.fiscal-health-row')).toHaveLength(5);
  expect(host.querySelector('.fiscal-health')?.textContent).not.toContain('%');
  expect(host.querySelector('.fiscal-health [role="progressbar"]')).toBeNull();
  expect(host.querySelectorAll('.fiscal-health-track[style]')).toHaveLength(0);
  expect(host.querySelectorAll('.fiscal-operational-grid > section')).toHaveLength(3);
  expect(host.querySelectorAll('.fiscal-contract-chart')).toHaveLength(1);
});
it('combines operational filters without changing full-portfolio KPIs or queue', () => {
  const view = mount(operationalFixture()); const controls = overviewControls(view.host);
  try {
    const kpis = view.host.querySelector('.fiscal-kpis')!.textContent;
    const queue = view.host.querySelector('.fiscal-action-queue')!.textContent;
    controls.select(0, '1'); controls.select(1, 'Árvore'); controls.select(3, '30'); controls.search('arvore');
    expect(controls.expiry().textContent).toContain('CT-1'); expect(controls.expiry().textContent).not.toContain('CT-2');
    expect(controls.expiry().textContent).toContain('Vence hoje'); expect(controls.expiry().textContent).toContain('Alerta factual');
    expect(controls.expiry().textContent).toContain('não comprovam processo ou decisão de renovação');
    expect(view.host.querySelector('.fiscal-kpis')!.textContent).toBe(kpis);
    expect(view.host.querySelector('.fiscal-action-queue')!.textContent).toBe(queue);
    controls.search('sem resultado'); expect(controls.expiry().textContent).toContain('Nenhum contrato no recorte operacional');
    expect(controls.expiry().querySelector('.fiscal-contract-expiry')).toBeNull();
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-overview-controls select:disabled')?.textContent).toContain('Indisponível');
  } finally { view.unmount(); }
});
it('keeps operational selection across unavailable sources and refresh, retains missing IDs and resets on scope change', () => {
  const data = operationalFixture(); const view = mount(data); const controls = overviewControls(view.host);
  try {
    controls.select(0, '1');
    view.update(structuredClone(data));
    expect(view.host.querySelector<HTMLSelectElement>('.fiscal-overview-controls select')?.value).toBe('1');
    const unavailable = structuredClone(data); unavailable.meta.dataCoverage.contracts = 'UNAVAILABLE'; unavailable.data.contracts = null;
    view.update(unavailable);
    expect(view.host.querySelectorAll('.fiscal-operational-grid .fiscal-contract-expiry')).toHaveLength(0);
    expect(view.host.querySelector('.fiscal-operational-balances')?.textContent).toContain('Indisponível');
    expect(view.host.querySelector('.fiscal-kpis')?.textContent).not.toContain('R$');
    view.update(data); expect(view.host.querySelector<HTMLSelectElement>('.fiscal-overview-controls select')?.value).toBe('1');
    const missing = structuredClone(data); missing.data.contracts = missing.data.contracts!.filter(row => row.contractId !== 1);
    view.update(missing); expect(controls.expiry().querySelector('.fiscal-contract-expiry')).toBeNull();
    expect(view.host.querySelector('.fiscal-overview-controls')?.textContent).toContain('não disponível na resposta');
    const next = structuredClone(data); next.data.fiscal.userId++;
    view.update(next); expect(view.host.querySelector<HTMLSelectElement>('.fiscal-overview-controls select')?.value).toBe('');
  } finally { view.unmount(); }
});
it('keeps expiry and total balance unavailable for incomplete coverage while showing known contracts', () => {
  const data = operationalFixture(); data.data.contracts![0].expiryDate = null; data.data.contractBalances!.pop();
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: data });
  expect([...host.querySelectorAll('.fiscal-kpis strong')].slice(1, 3).map(row => row.textContent)).toEqual(['Indisponível', 'Indisponível']);
  expect(host.querySelector('.fiscal-operational-expiry')?.textContent).toContain('Data de vigência indisponível');
});

it('groups generation time, reference and partial coverage without removing their explanations', () => {
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: operationalFixture() });
  const strip = host.querySelector('.fiscal-status-strip')!;
  expect(strip.getAttribute('aria-label')).toBe('Atualização, referência e cobertura');
  expect(strip.querySelector('button')?.textContent).toContain('Atualizar dados');
  expect(strip.textContent).toContain('Última atualização do dashboard:');
  expect(strip.textContent).toContain('Referência: 24/09/2026');
  expect(strip.textContent).toContain('Horário de geração da resposta, não de atualização do banco.');
  expect(strip.querySelector('.coverage-note[role="status"]')?.textContent).toContain('não foram calculados');
  expect(host.querySelectorAll('.coverage-note')).toHaveLength(1);
});
it('uses alert API fields and preserves SAC description verbatim in native accessible details', () => {
  const data = operationalFixture();
  const original = '  Contrato CT-1: prazo informado pelo SAC.\nDetalhe <original> & sem edição.  ';
  data.data.contractAlerts![0].description = original;
  data.data.contractAlerts![0].expiryDate = '2026-12-31';
  const view = mount(data);
  try {
    const alert = view.host.querySelector('[data-contract-alert-id="3"]')!;
    expect(alert.querySelector('strong')?.textContent).toBe('Alerta contratual');
    expect([...alert.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['CT-1', '31/12/2026']);
    const details = alert.querySelector('details')!;
    expect(details.querySelector('summary')?.textContent).toBe('Descrição original do SAC · alerta 3');
    expect(details.querySelector('p')?.textContent).toBe(original);
    expect(details.hasAttribute('open')).toBe(false);
    act(() => details.querySelector('summary')!.click());
    expect(details.hasAttribute('open')).toBe(true);
    expect(details.querySelector('p')?.textContent).toBe(original);
    expect(data.data.contractAlerts![0].description).toBe(original);
  } finally { view.unmount(); }
});
it('keeps missing alert dates unavailable and an empty original description distinct from null', () => {
  const data = operationalFixture(); data.data.contractAlerts![0].expiryDate = null;
  data.data.contractAlerts![0].contractNumber = null; data.data.contractAlerts![0].description = '';
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: data });
  const alert = host.querySelector('[data-contract-alert-id="3"]')!;
  expect([...alert.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['Contrato ID 1', 'Indisponível']);
  expect(alert.querySelector('details p')?.textContent).toBe('');
  data.data.contractAlerts![0].description = null;
  host.innerHTML = render({ status: 'success', summary: data });
  expect(host.querySelector('[data-contract-alert-id="3"] details p')?.textContent).toBe('Descrição indisponível');
});

it('preserves the model geometry with seven unavailable phases, five metrics and two ABC blocks', () => {
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: operationalFixture() });
  expect(host.querySelectorAll('.fiscal-model-phase')).toHaveLength(7);
  expect(host.querySelectorAll('.fiscal-model-metrics > div')).toHaveLength(5);
  expect([...host.querySelectorAll('.fiscal-model-phase strong, .fiscal-model-metrics b')].map(node => node.textContent)).toEqual(Array(12).fill('Indisponível'));
  expect(host.querySelector('.fiscal-financial-cycle .fiscal-model-alert')?.textContent).toContain('Ação: Indisponível');
  expect(host.querySelectorAll('.relevance .fiscal-model-info')).toHaveLength(2);
  expect(host.querySelector('.fiscal-health-index')?.textContent).toContain('Índice de Saúde da Carteira: Indisponível');
  expect(host.querySelectorAll('.fiscal-health-track [style]')).toHaveLength(0);
  expect(host.querySelector('.fiscal-operational-balances svg')).toBeNull();
});

it('keeps each OS compact with all original pendencies and statuses in native details', () => {
  const data = structuredClone(queueFixture);
  const original = '  Documento da fonte\ncom espaços preservados  ';
  data.data.priorityQueue![0].pendencies[0].description = original;
  const view = mount(data);
  try {
    const row = view.host.querySelector('[data-queue-order-id]')!;
    const details = row.querySelector<HTMLDetailsElement>('.fiscal-order-details')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain('pendências de decisão fiscal');
    expect(details.querySelectorAll('li')).toHaveLength(data.data.priorityQueue![0].pendencies.length);
    expect(details.querySelector('li')?.firstChild?.textContent).toBe(original);
    expect(details.querySelectorAll('.fiscal-queue-pendency-status')).toHaveLength(data.data.priorityQueue![0].pendencies.length);
    act(() => details.querySelector('summary')!.click()); expect(details.hasAttribute('open')).toBe(true);
    expect(details.querySelector('li')?.firstChild?.textContent).toBe(original);
    act(() => details.querySelector('summary')!.click()); expect(details.hasAttribute('open')).toBe(false);
    expect(view.host.querySelectorAll('[data-queue-order-id]')).toHaveLength(data.data.priorityQueue!.length);
  } finally { view.unmount(); }
});
it('preserves explicit empty and unavailable queues without manufacturing executive rows', () => {
  for (const [queue, message] of [[[], 'Fila apurada sem ocorrências'], [null, 'Fila indisponível']] as const) {
    const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: summary(0, queue === null ? null : []) });
    expect(host.querySelector('.fiscal-action-queue .table-empty')?.textContent).toBe(message);
    expect(host.querySelectorAll('[data-queue-order-id], .fiscal-order-details')).toHaveLength(0);
    expect(host.querySelector('.fiscal-health-index')?.textContent).toContain('Indisponível');
  }
});
it('keeps secondary metadata and executive interpretation available in collapsed native details', () => {
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: operationalFixture() });
  const metadata = host.querySelector('.fiscal-metadata-details')!;
  expect(metadata.hasAttribute('open')).toBe(false);
  expect(metadata.textContent).toContain('não de atualização do banco');
  expect(host.querySelector('.coverage-note[role="status"]')?.textContent).toContain('Cobertura parcial');
  expect(host.querySelector('.fiscal-health .fiscal-executive-note')?.textContent).toContain('não equivalem a um índice de saúde');
});

it.each(['available', 'unavailable'] as const)('ends after ABC with no removed UI or alternative screens: %s', coverage => {
  const data = operationalFixture();
  if (coverage === 'unavailable') { data.data.contracts = null; data.meta.dataCoverage.contracts = 'UNAVAILABLE'; }
  const host = document.createElement('div'); host.innerHTML = render({ status: 'success', summary: data });
  expect([...host.querySelectorAll('.panel-heading h2')].map(node => node.textContent)).toEqual([
    'Minha fila de ação', 'Saúde da carteira', 'Saldos por contrato', 'Vigências e renovações', 'Pagamento e medição',
    'Ciclo financeiro do contrato', 'Relevância Econômica das Partes do Contrato',
  ]);
  expect(host.querySelector('.fiscal-page')?.lastElementChild?.querySelector('h2')?.textContent).toBe('Relevância Econômica das Partes do Contrato');
  expect(host.querySelectorAll('.fiscal-saldos, .fiscal-contract-balances, .fiscal-band-distribution, .fiscal-operational-indicators, .fiscal-legacy-kpis, .fiscal-item-pagination, .fiscal-items-export, [role="tab"], [role="tablist"]')).toHaveLength(0);
  expect(host.textContent).not.toContain('Saldo consolidado por contrato');
  expect(host.textContent).not.toContain('Gestão dos Saldos dos Itens Contratuais');
  expect(host.textContent).not.toContain('Distribuição dos itens por faixa');
  expect(host.querySelectorAll('.fiscal-kpi')).toHaveLength(6);
  expect(host.querySelectorAll('.fiscal-model-phase')).toHaveLength(7);
  expect(host.querySelector('.fiscal-queue-export button')).not.toBeNull();
  expect(host.querySelector('.fiscal-operational-balances')).not.toBeNull();
});

it('rejects an invalid HTTP expiry instead of presenting it as a factual date', async () => {
  const data = structuredClone(queueFixture);
  data.data.contracts![0].expiryDate = '2026-02-31';
  const view = await mountedDashboard(vi.fn().mockResolvedValue(okResponse(data)));
  try {
    expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('Erro ao carregar o resumo');
    expect(view.host.querySelector('.fiscal-operational-expiry')).toBeNull();
    expect(view.host.querySelector('.fiscal-kpis')).toBeNull();
    expect(view.host.textContent).not.toContain('31/02/2026');
  } finally { view.cleanup(); }
});
