import { describe, expect, it } from 'vitest';
import {
  managerDashboardSummaryResponseSchema,
  apiErrorResponseSchema,
  apiMessageSchema,
  fiscalDashboardSummaryResponseSchema,
} from './index';

describe('apiMessageSchema', () => {
  it('aceita uma mensagem textual', () => {
    expect(apiMessageSchema.parse({ message: 'Olá' })).toEqual({ message: 'Olá' });
  });

  it('rejeita uma mensagem que não é texto', () => {
    expect(apiMessageSchema.safeParse({ message: 123 }).success).toBe(false);
  });
});

describe('apiErrorResponseSchema', () => {
  const validError = {
    meta: { generatedAt: '2026-09-21T14:30:00-03:00', correlationId: 'req-123' },
    error: { code: 'INVALID_FILTER', message: 'Filtros inválidos.', details: [] },
  };

  it('aceita envelope válido e details como array de objetos abertos', () => {
    expect(apiErrorResponseSchema.safeParse(validError).success).toBe(true);
    expect(apiErrorResponseSchema.safeParse({
      ...validError,
      error: { ...validError.error, details: [{ field: 'dataReferencia', rejected: 'ontem' }] },
    }).success).toBe(true);
  });

  it('aceita todos os códigos DEC-008 e rejeita código desconhecido', () => {
    const codes = [
      'INVALID_FILTER', 'UNAUTHENTICATED', 'FORBIDDEN_SCOPE', 'RESOURCE_NOT_FOUND',
      'DATA_VERSION_CONFLICT', 'EXTERNAL_SOURCE_UNAVAILABLE', 'INTERNAL_ERROR',
    ];
    for (const code of codes) {
      expect(apiErrorResponseSchema.safeParse({
        ...validError,
        error: { ...validError.error, code },
      }).success).toBe(true);
    }
    expect(apiErrorResponseSchema.safeParse({
      ...validError,
      error: { ...validError.error, code: 'OTHER_ERROR' },
    }).success).toBe(false);
  });

  it('exige correlationId, message não vazia e details como array', () => {
    for (const candidate of [
      { ...validError, meta: { generatedAt: validError.meta.generatedAt } },
      { ...validError, error: { ...validError.error, details: {} } },
      { ...validError, error: { ...validError.error, message: '' } },
    ]) {
      expect(apiErrorResponseSchema.safeParse(candidate).success).toBe(false);
    }
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
      contracts: 'AVAILABLE', contractBalances: 'AVAILABLE', contractAlerts: 'AVAILABLE',
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
    contracts: [], contractBalances: [], contractAlerts: [],
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
      contracts: 'AVAILABLE', contractBalances: 'AVAILABLE', contractAlerts: 'AVAILABLE',
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
    priorityQueue: [], contracts: [], contractBalances: [], contractAlerts: [],
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

  it('distingue fila com itens, vazia e indisponível, exigindo a propriedade', () => {
    const empty = clone(mixedResponse);
    const unavailable = clone(mixedResponse);
    const absent = clone(mixedResponse);
    empty.data.priorityQueue = [];
    unavailable.data.priorityQueue = null as never;
    delete (absent.data as Record<string, unknown>).priorityQueue;
    expect(fiscalDashboardSummaryResponseSchema.safeParse(mixedResponse).success).toBe(true);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(empty).success).toBe(true);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(unavailable).success).toBe(true);
    expect(fiscalDashboardSummaryResponseSchema.safeParse(absent).success).toBe(false);
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

it('validates Fiscal contracts and balances, including nullable supplier and undefined percentage', () => {
  const input = {
    ...sacResponse,
    data: { ...sacResponse.data,
      contracts: [{ contractId: 23, contractNumber: 'CT-EXEMPLO', supplierName: null, value: 75000, expiryDate: null }],
      contractBalances: [{ contractId: 23, contractNumber: null, contractedValue: 0, consumedValue: 0, balanceValue: 0, balancePct: null }],
    },
  };
  expect(fiscalDashboardSummaryResponseSchema.safeParse(input).success).toBe(true);
  const invalid = structuredClone(input);
  invalid.data.contractBalances[0].balanceValue = Infinity;
  expect(fiscalDashboardSummaryResponseSchema.safeParse(invalid).success).toBe(false);
  const badDate = structuredClone(input);
  badDate.data.contracts[0].expiryDate = 'not-a-date' as never;
  expect(fiscalDashboardSummaryResponseSchema.safeParse(badDate).success).toBe(false);
});

it('requires Fiscal lists and matching coverage for null versus available arrays', () => {
  const input = structuredClone(sacResponse) as Record<string, any>;
  input.data.contractBalances = null;
  expect(fiscalDashboardSummaryResponseSchema.safeParse(input).success).toBe(false);
  input.meta.dataCoverage.contractBalances = 'UNAVAILABLE';
  expect(fiscalDashboardSummaryResponseSchema.safeParse(input).success).toBe(true);
  input.data.contracts = null;
  expect(fiscalDashboardSummaryResponseSchema.safeParse(input).success).toBe(false);
  input.meta.dataCoverage.contracts = 'UNAVAILABLE';
  expect(fiscalDashboardSummaryResponseSchema.safeParse(input).success).toBe(true);
  delete input.data.contracts;
  expect(fiscalDashboardSummaryResponseSchema.safeParse(input).success).toBe(false);
});

it('validates contractual alerts and their coverage consistently', () => {
  const response = structuredClone(sacResponse);
  const alert = { alertId: 126, contractId: 2, contractNumber: 'CT-2', description: null, expiryDate: '2026-10-20', createdAt: '2026-10-01T12:00:00Z' };
  const withAlerts = { ...response, data: { ...response.data, contractAlerts: [alert] } };
  expect(fiscalDashboardSummaryResponseSchema.safeParse(withAlerts).success).toBe(true);
  for (const invalid of [{ ...alert, alertId: 0 }, { ...alert, expiryDate: '20/10/2026' }, { ...alert, createdAt: 'ontem' }, { ...alert, severity: 'ALTA' }]) {
    expect(fiscalDashboardSummaryResponseSchema.safeParse({ ...withAlerts, data: { ...withAlerts.data, contractAlerts: [invalid] } }).success).toBe(false);
  }
  expect(fiscalDashboardSummaryResponseSchema.safeParse({ ...response, data: { ...response.data, contractAlerts: null } }).success).toBe(false);
  expect(fiscalDashboardSummaryResponseSchema.safeParse({ ...response, meta: { ...response.meta, dataCoverage: { ...response.meta.dataCoverage, contractAlerts: 'UNAVAILABLE' } }, data: { ...response.data, contractAlerts: null } }).success).toBe(true);
});

describe('manager contractual alerts and balances', () => {
  const alert = { alertId: 206, contractId: 41, contractNumber: null, type: 'outro_tipo', status: 'em_tratamento', description: null, expiryDate: null, createdAt: '2026-10-01T12:00:00Z' };
  const balance = { contractId: 41, contractNumber: null, contractedValue: 200, consumedValue: 50, balanceValue: 150, balancePct: 75 };
  const response = {
    meta: { generatedAt: '2026-10-08T12:00:00Z', dataReference: '2026-10-08', timezone: 'America/Fortaleza', source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [] }, dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE', expiringContracts: 'AVAILABLE', renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE', itemBalances: 'AVAILABLE', renewalDecisionsD90: 'AVAILABLE', registrationCompleteness: 'AVAILABLE', contractRiskMatrix: 'AVAILABLE' } },
    data: { manager: { userId: 17, name: null }, cards: { activeContracts: 0, activePortfolioValue: 0, expiringContracts: 0, renewalsWithin120Days: 0 }, contracts: [], expiringContractList: [], contractAlerts: [alert], contractBalances: [balance], contractRiskMatrix: [], preventiveQuality: { renewalDecisionsD90: { eligibleContracts: 0, decidedContracts: 0, extendContracts: 0, nonRenewalContracts: 0, undecidedContracts: 0, percentage: null }, registrationCompleteness: { activeContracts: 0, completeContracts: 0, percentage: null, missingByField: { objeto: 0, valor_total: 0, data_assinatura: 0, vigencia_inicio: 0, vigencia_fim: 0 } } }, itemBalances: { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 }, resumo: { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 }, agregados: { totalContratado: 0, saldoComprometido: 0, saldoMedido: 0, itemCount: 0, completeValueRows: 0, contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 }, itens: [] } },
  };
  it('accepts approved shapes and rejects invalid dates, resolved status, unsafe IDs and financial values', () => {
    expect(managerDashboardSummaryResponseSchema.safeParse(response).success).toBe(true);
    for (const invalid of [{ ...alert, alertId: 0 }, { ...alert, alertId: Number.MAX_SAFE_INTEGER + 1 }, { ...alert, status: 'resolvida' }, { ...alert, expiryDate: '20/10/2026' }, { ...alert, createdAt: 'ontem' }, { ...alert, severity: 'ALTA' }]) {
      expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, data: { ...response.data, contractAlerts: [invalid] } }).success).toBe(false);
    }
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, data: { ...response.data, contractBalances: [{ ...balance, consumedValue: null }] } }).success).toBe(false);
  });
  it('enforces null/UNAVAILABLE and array/AVAILABLE independently', () => {
    for (const key of ['contractAlerts', 'contractBalances'] as const) {
      expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, data: { ...response.data, [key]: null } }).success).toBe(false);
      expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, meta: { ...response.meta, dataCoverage: { ...response.meta.dataCoverage, [key]: 'UNAVAILABLE' } }, data: { ...response.data, [key]: null } }).success).toBe(true);
    }
  });
  it('requires item balances and matching coverage while preserving previous fields', () => {
    expect(managerDashboardSummaryResponseSchema.safeParse(response).success).toBe(true);
    const unavailable = { ...response, meta: { ...response.meta, dataCoverage: { ...response.meta.dataCoverage, itemBalances: 'UNAVAILABLE' } }, data: { ...response.data, itemBalances: { coverage: 'UNAVAILABLE' } } };
    expect(managerDashboardSummaryResponseSchema.safeParse(unavailable).success).toBe(true);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, data: { ...response.data, itemBalances: { coverage: 'UNAVAILABLE' } } }).success).toBe(false);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, meta: { ...response.meta, dataCoverage: { ...response.meta.dataCoverage, itemBalances: 'UNAVAILABLE' } } }).success).toBe(false);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, data: { ...response.data, itemBalances: undefined } }).success).toBe(false);
    const withItem = clone(response);
    (withItem.data.itemBalances.itens as unknown[]).push({
      contractId: 41, contractNumber: 'CT-41', supplierName: 'Fornecedor', itemId: 5,
      sequence: 1, specification: 'Serviço', unit: 'un', quantityContracted: 1,
      quantityConsumed: 0, quantityMeasured: 0, quantityBalance: 1,
      valueContracted: 100, valueConsumed: 0, valueMeasured: 0, valueBalance: 100,
      valueMeasuredBalance: 100, quantityMeasuredBalance: 1, pctSaldo: 1, pctSaldoMedido: 1,
      faixa: 'adequado', statusVerificacao: null, blockedAt: null, blockReason: null,
    });
    withItem.data.itemBalances.agregados.itemCount = 1;
    withItem.data.itemBalances.resumo.adequado = 1;
    expect(managerDashboardSummaryResponseSchema.safeParse(withItem).success).toBe(true);
  });
  it('validates preventive counts, percentages, zero denominators and independent coverage', () => {
    const available = { ...response, data: { ...response.data, preventiveQuality: {
      renewalDecisionsD90: { eligibleContracts: 3, decidedContracts: 2, extendContracts: 1,
        nonRenewalContracts: 1, undecidedContracts: 1, percentage: 2 / 3 * 100 },
      registrationCompleteness: { activeContracts: 3, completeContracts: 1, percentage: 1 / 3 * 100,
        missingByField: { objeto: 1, valor_total: 1, data_assinatura: 0, vigencia_inicio: 0, vigencia_fim: 0 } },
    } } };
    expect(managerDashboardSummaryResponseSchema.safeParse(available).success).toBe(true);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...available, data: { ...available.data,
      preventiveQuality: { ...available.data.preventiveQuality, renewalDecisionsD90: null } } }).success).toBe(false);
    const oneUnavailable = { ...available, meta: { ...available.meta, dataCoverage: {
      ...available.meta.dataCoverage, renewalDecisionsD90: 'UNAVAILABLE' } }, data: { ...available.data,
      preventiveQuality: { ...available.data.preventiveQuality, renewalDecisionsD90: null } } };
    expect(managerDashboardSummaryResponseSchema.safeParse(oneUnavailable).success).toBe(true);
    for (const invalid of [
      { ...available.data.preventiveQuality.renewalDecisionsD90, decidedContracts: 3 },
      { ...available.data.preventiveQuality.renewalDecisionsD90, undecidedContracts: 0 },
      { ...available.data.preventiveQuality.renewalDecisionsD90, percentage: 67 },
      { ...available.data.preventiveQuality.renewalDecisionsD90, percentage: 101 },
      { ...available.data.preventiveQuality.renewalDecisionsD90, eligibleContracts: 0, decidedContracts: 0,
        extendContracts: 0, nonRenewalContracts: 0, undecidedContracts: 0, percentage: 0 },
    ]) expect(managerDashboardSummaryResponseSchema.safeParse({ ...available, data: { ...available.data,
      preventiveQuality: { ...available.data.preventiveQuality, renewalDecisionsD90: invalid } } }).success).toBe(false);
    for (const invalid of [
      { ...available.data.preventiveQuality.registrationCompleteness, completeContracts: 4 },
      { ...available.data.preventiveQuality.registrationCompleteness, percentage: 33 },
      { ...available.data.preventiveQuality.registrationCompleteness,
        missingByField: { ...available.data.preventiveQuality.registrationCompleteness.missingByField, objeto: 3 } },
      { ...available.data.preventiveQuality.registrationCompleteness, activeContracts: 0,
        completeContracts: 0, percentage: 0, missingByField: { objeto: 0, valor_total: 0,
          data_assinatura: 0, vigencia_inicio: 0, vigencia_fim: 0 } },
    ]) expect(managerDashboardSummaryResponseSchema.safeParse({ ...available, data: { ...available.data,
      preventiveQuality: { ...available.data.preventiveQuality, registrationCompleteness: invalid } } }).success).toBe(false);
  });
  it('requires a strict risk row per current contract and matching matrix coverage', () => {
    const contract = { contractId: 41, contractNumber: 'CT-41', supplierName: 'Fornecedor', value: 100, expiryDate: '2026-10-25' };
    const row = { contractId: 41, contractNumber: 'CT-41', supplierName: 'Fornecedor',
      saldo: { status: 'UNAVAILABLE', partialCoverage: false, reason: 'NO_ITEMS' }, vigencia: 'CRITICAL',
      sla: 'UNAVAILABLE', medicao: 'UNAVAILABLE', pagamento: 'UNAVAILABLE', indice: 'UNAVAILABLE' };
    const current = { ...response, data: { ...response.data, contracts: [contract], contractRiskMatrix: [row] } };
    const parseSaldo = (saldo: unknown) => managerDashboardSummaryResponseSchema.safeParse({
      ...current, data: { ...current.data, contractRiskMatrix: [{ ...row, saldo }] },
    }).success;
    for (const saldo of [
      { status: 'UNAVAILABLE', partialCoverage: false },
      { status: 'UNAVAILABLE', partialCoverage: false, reason: null },
      { status: 'OK', partialCoverage: false, reason: 'NO_ITEMS' },
      { status: 'UNAVAILABLE', partialCoverage: true, reason: 'NO_ITEMS' },
      { status: 'UNAVAILABLE', partialCoverage: false, reason: 'ALL_ITEMS_UNVERIFIABLE' },
      { status: 'UNAVAILABLE', partialCoverage: false, reason: 'UNKNOWN' },
      { status: 'UNAVAILABLE', partialCoverage: false, reason: 'ITEM_SOURCE_UNAVAILABLE' },
    ]) expect(parseSaldo(saldo)).toBe(false);
    expect(parseSaldo({ status: 'UNAVAILABLE', partialCoverage: true, reason: 'ALL_ITEMS_UNVERIFIABLE' })).toBe(true);
    const sourceUnavailable = { ...current, meta: { ...current.meta, dataCoverage: {
      ...current.meta.dataCoverage, itemBalances: 'UNAVAILABLE' } }, data: { ...current.data,
      itemBalances: { coverage: 'UNAVAILABLE' }, contractRiskMatrix: [{ ...row, saldo: {
        status: 'UNAVAILABLE', partialCoverage: false, reason: 'ITEM_SOURCE_UNAVAILABLE' } }] } };
    expect(managerDashboardSummaryResponseSchema.safeParse(sourceUnavailable).success).toBe(true);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...sourceUnavailable, data: {
      ...sourceUnavailable.data, contractRiskMatrix: [row] } }).success).toBe(false);

    expect(managerDashboardSummaryResponseSchema.safeParse(current).success).toBe(true);
    for (const invalid of [
      { ...row, contractId: 42 }, { ...row, supplierName: 'Outro' },
      { ...row, sla: 'OK' }, { ...row, indice: 58 },
      { ...row, saldo: { status: 'UNKNOWN', partialCoverage: false } },
      { ...row, extra: 'inventado' },
    ]) expect(managerDashboardSummaryResponseSchema.safeParse({ ...current, data: {
      ...current.data, contractRiskMatrix: [invalid] } }).success).toBe(false);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...current, data: {
      ...current.data, contractRiskMatrix: [] } }).success).toBe(false);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...current, data: {
      ...current.data, contractRiskMatrix: [row, row] } }).success).toBe(false);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...current, data: {
      ...current.data, contractRiskMatrix: null } }).success).toBe(false);
    expect(managerDashboardSummaryResponseSchema.safeParse({ ...response, meta: { ...response.meta,
      dataCoverage: { ...response.meta.dataCoverage, portfolio: 'UNAVAILABLE', contractRiskMatrix: 'UNAVAILABLE' } },
    data: { ...response.data, contracts: null, contractRiskMatrix: null } }).success).toBe(true);
  });
});
