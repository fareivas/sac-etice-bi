import { describe, expect, it } from 'vitest';
import { apiMessageSchema, fiscalDashboardSummaryResponseSchema } from './index';

describe('apiMessageSchema', () => {
  it('aceita uma mensagem textual', () => {
    expect(apiMessageSchema.parse({ message: 'Olá' })).toEqual({ message: 'Olá' });
  });

  it('rejeita uma mensagem que não é texto', () => {
    expect(apiMessageSchema.safeParse({ message: 123 }).success).toBe(false);
  });
});

const mixedResponse = {
  meta: {
    generatedAt: '2026-09-21T14:30:00-03:00',
    dataReference: '2026-09-21',
    timezone: 'America/Fortaleza',
    sources: [
      { system: 'SAC', updatedAt: '2026-09-21T14:29:40-03:00' },
      { system: 'KPIs', updatedAt: '2026-09-21T14:25:00-03:00', status: 'AVAILABLE' },
    ],
    merCoverage: 'MIXED',
    dataCoverage: {
      activeContracts: 'AVAILABLE',
      pendingServiceOrders: 'AVAILABLE',
      criticalItems: 'AVAILABLE',
      overdueActions: 'AVAILABLE',
    },
    filtersApplied: { unidadeId: 4, contratoId: [184, 205], includeExternal: true },
  },
  data: {
    fiscal: { userId: 77, name: 'Fiscal Exemplo' },
    cards: {
      activeContracts: 2,
      pendingServiceOrders: 1,
      criticalItems: 0,
      overdueActions: 0,
      externalViolations: 3,
    },
    priorityQueue: [{
      type: 'SERVICE_ORDER',
      severity: 'ALTA',
      contractId: 184,
      contractNumber: 'CT-2025-0184',
      supplierName: 'Fornecedor Alfa',
      title: 'Autorizar OS-2026-0881',
      dueAt: '2026-09-22T12:00:00-03:00',
    }],
  },
};

const sacResponse = {
  meta: {
    generatedAt: '2026-09-21T14:30:00-03:00',
    dataReference: '2026-09-21',
    timezone: 'America/Fortaleza',
    source: 'SAC',
    merCoverage: 'PROPOSTA',
    dataCoverage: {
      activeContracts: 'AVAILABLE',
      pendingServiceOrders: 'AVAILABLE',
      criticalItems: 'AVAILABLE',
      overdueActions: 'AVAILABLE',
    },
    filtersApplied: { unidadeId: null, contratoId: [], includeExternal: false },
  },
  data: {
    fiscal: { userId: 77, name: 'Fiscal Exemplo' },
    cards: {
      activeContracts: 0,
      pendingServiceOrders: 0,
      criticalItems: 0,
      overdueActions: 0,
      externalViolations: null,
    },
    priorityQueue: [],
  },
};

const clone = <T>(value: T): T => structuredClone(value);

describe('fiscalDashboardSummaryResponseSchema', () => {
  it('valida o exemplo misto da DEC-023', () => {
    expect(fiscalDashboardSummaryResponseSchema.safeParse(mixedResponse).success).toBe(true);
  });

  it('exige pelo menos duas fontes em meta.sources', () => {
    const empty = clone(mixedResponse);
    const single = clone(mixedResponse);
    empty.meta.sources = [];
    single.meta.sources = [single.meta.sources[0]];
    expect(fiscalDashboardSummaryResponseSchema.safeParse(empty).success).toBe(false);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(single).success).toBe(false);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(mixedResponse).success).toBe(true);
  });

  it('valida o exemplo SAC com carteira vazia da DEC-023', () => {
    expect(fiscalDashboardSummaryResponseSchema.safeParse(sacResponse).success).toBe(true);
  });

  it('exige exatamente uma forma de identificar as fontes', () => {
    const both = clone(mixedResponse);
    const neither = clone(mixedResponse);
    const bothMeta = both.meta as Record<string, unknown>;
    const neitherMeta = neither.meta as Record<string, unknown>;
    bothMeta.source = 'SAC';
    delete neitherMeta.sources;
    expect(fiscalDashboardSummaryResponseSchema.safeParse(both).success).toBe(false);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(neither).success).toBe(false);
  });

  it('rejeita PARTIAL e merCoverage fora do contrato', () => {
    const partial = clone(mixedResponse);
    const otherCoverage = clone(mixedResponse);
    partial.meta.dataCoverage.activeContracts = 'PARTIAL';
    otherCoverage.meta.merCoverage = 'CURRENT_WITH_ADJUSTMENT';
    expect(fiscalDashboardSummaryResponseSchema.safeParse(partial).success).toBe(false);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(otherCoverage).success).toBe(false);
  });

  it('rejeita propriedades obrigatórias ausentes', () => {
    const missingMeta = clone(mixedResponse);
    const missingCard = clone(mixedResponse);
    const missingFiscal = clone(sacResponse);
    const missingQueue = clone(mixedResponse);
    delete (missingMeta.meta as Record<string, unknown>).generatedAt;
    delete (missingCard.data.cards as Record<string, unknown>).criticalItems;
    delete (missingFiscal.data as Record<string, unknown>).fiscal;
    delete (missingQueue.data.priorityQueue[0] as Record<string, unknown>).title;
    for (const candidate of [missingMeta, missingCard, missingFiscal, missingQueue]) {
      expect(fiscalDashboardSummaryResponseSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('aceita as nulabilidades aprovadas', () => {
    const response = clone(mixedResponse);
    const item = response.data.priorityQueue[0] as Record<string, unknown>;
    for (const key of ['severity', 'contractId', 'contractNumber', 'supplierName', 'title', 'dueAt']) {
      item[key] = null;
    }
    response.data.fiscal.name = null as never;
    response.data.cards.activeContracts = null as never;
    response.meta.dataCoverage.activeContracts = 'UNAVAILABLE';
    expect(fiscalDashboardSummaryResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejeita tipo de ocorrência diferente de SERVICE_ORDER', () => {
    const response = clone(mixedResponse);
    response.data.priorityQueue[0].type = 'RISK';
    expect(fiscalDashboardSummaryResponseSchema.safeParse(response).success).toBe(false);
  });

  it('mantém valores dos cards SAC coerentes com dataCoverage', () => {
    const missingValue = clone(mixedResponse);
    const falseAvailable = clone(mixedResponse);
    missingValue.data.cards.activeContracts = null as never;
    falseAvailable.meta.dataCoverage.activeContracts = 'UNAVAILABLE';
    expect(fiscalDashboardSummaryResponseSchema.safeParse(missingValue).success).toBe(false);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(falseAvailable).success).toBe(false);
  });

  it('exige externalViolations null quando includeExternal é false', () => {
    const response = clone(sacResponse);
    response.data.cards.externalViolations = 0 as never;
    expect(fiscalDashboardSummaryResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejeita IDs repetidos ou inválidos em filtersApplied e timezone inválido', () => {
    const duplicated = clone(mixedResponse);
    const invalidId = clone(mixedResponse);
    const invalidTimezone = clone(mixedResponse);
    duplicated.meta.filtersApplied.contratoId = [184, 184];
    invalidId.meta.filtersApplied.unidadeId = 0;
    invalidTimezone.meta.timezone = 'Fuso/Inexistente';
    for (const candidate of [duplicated, invalidId, invalidTimezone]) {
      expect(fiscalDashboardSummaryResponseSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('rejeita propriedades extras em objetos fechados e mantém descritores abertos', () => {
    const extraFilters = clone(mixedResponse);
    const extraCoverage = clone(mixedResponse);
    const extraItem = clone(mixedResponse);
    (extraFilters.meta.filtersApplied as Record<string, unknown>).timezone = 'America/Fortaleza';
    (extraCoverage.meta.dataCoverage as Record<string, unknown>).externalViolations = 'AVAILABLE';
    (extraItem.data.priorityQueue[0] as Record<string, unknown>).ipa = 80;
    for (const candidate of [extraFilters, extraCoverage, extraItem]) {
      expect(fiscalDashboardSummaryResponseSchema.safeParse(candidate).success).toBe(false);
    }
    const openDescriptor = clone(mixedResponse);
    (openDescriptor.meta.sources[1] as Record<string, unknown>).providerDetail = 'externo';
    expect(fiscalDashboardSummaryResponseSchema.safeParse(openDescriptor).success).toBe(true);
  });
});
