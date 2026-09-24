import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { countLabel, FiscalDashboardView, queueLabel } from './summary';

function summary(activeContracts: number, queue: FiscalDashboardSummaryResponse['data']['priorityQueue'] = null): FiscalDashboardSummaryResponse {
  return {
    meta: {
      generatedAt: '2026-09-24T12:00:00-03:00', dataReference: '2026-09-24', timezone: 'America/Fortaleza',
      dataCoverage: { activeContracts: 'AVAILABLE', pendingServiceOrders: 'UNAVAILABLE', criticalItems: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' },
      filtersApplied: { unidadeId: null, contratoId: [], includeExternal: false }, source: 'SAC', merCoverage: 'PROPOSTA',
    },
    data: {
      fiscal: { userId: 77, name: 'Fiscal Real' },
      cards: { activeContracts, pendingServiceOrders: null, criticalItems: null, overdueActions: null, externalViolations: null },
      priorityQueue: queue,
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
    expect(html).toContain('2026-09-24');
    expect(html).toContain('>3</p>');
    expect(html).toContain('Cobertura parcial');
    expect(html).toContain('Indisponível');
    expect(html).toContain('Fila indisponível');
    expect(html).toContain('Desabilitada');
    expect(html).not.toContain('>0</p>');
  });

  it('shows real zero and an available empty queue distinctly', () => {
    const html = render({ status: 'success', summary: summary(0, []) });
    expect(html).toContain('>0</p>');
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
    expect(html).not.toContain('Desabilitada');
  });

  it('keeps real zero separate from unavailable counts and queues', () => {
    expect(countLabel(0)).toBe('0');
    expect(countLabel(null)).toBe('Indisponível');
    expect(queueLabel([])).toBe('Fila apurada sem ocorrências');
    expect(queueLabel(null)).toBe('Fila indisponível');
  });
});
