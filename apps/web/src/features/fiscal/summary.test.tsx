import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { countLabel, FiscalDashboardView, queueLabel } from './summary';

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
    expect(html).not.toContain('>0</strong>');
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
  const data = summary(1, [{ type: 'SERVICE_ORDER', severity: null, contractId: 2,
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
  const empty = render({ status: 'success', summary: data });
  expect(empty).toContain('Nenhum item contratual cadastrado na carteira.');
  expect(empty).toContain('60%');
  data.data.itemBalances = { coverage: 'UNAVAILABLE' };
  const unavailable = render({ status: 'success', summary: data });
  expect(unavailable).toContain('Fonte de saldos por item indisponível');
  expect(unavailable).not.toContain('Nenhum item contratual cadastrado na carteira.');
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
