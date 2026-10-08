import { z } from 'zod';

const dateTimeSchema = z.iso.datetime({ offset: true, local: true });

export const apiMessageSchema = z.object({ message: z.string() });
export type ApiMessage = z.infer<typeof apiMessageSchema>;

export const apiErrorCodeSchema = z.enum([
  'INVALID_FILTER',
  'UNAUTHENTICATED',
  'FORBIDDEN_SCOPE',
  'RESOURCE_NOT_FOUND',
  'DATA_VERSION_CONFLICT',
  'EXTERNAL_SOURCE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

// details objects stay open because DEC-008 does not define a closed schema.
export const apiErrorDetailsSchema = z.array(z.record(z.string(), z.unknown()));

export const apiErrorResponseSchema = z.strictObject({
  meta: z.strictObject({
    generatedAt: dateTimeSchema,
    correlationId: z.string().min(1),
  }),
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    details: apiErrorDetailsSchema,
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

const sourceDateTimeSchema = z.iso.datetime({ offset: true });

const fiscalDataCoverageSchema = z.strictObject({
  activeContracts: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  pendingServiceOrders: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  criticalItems: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  overdueActions: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  contracts: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  contractBalances: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  contractAlerts: z.enum(['AVAILABLE', 'UNAVAILABLE']),
});

const fiscalFiltersAppliedSchema = z.strictObject({
  unidadeId: z.number().int().positive().nullable(),
  contratoId: z.array(z.number().int().positive()).refine(
    (ids) => new Set(ids).size === ids.length,
    'contratoId deve conter IDs únicos',
  ),
  includeExternal: z.boolean(),
});

const fiscalMetaFields = {
  generatedAt: dateTimeSchema,
  dataReference: z.iso.date(),
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'timezone IANA inválido'),
  dataCoverage: fiscalDataCoverageSchema,
  filtersApplied: fiscalFiltersAppliedSchema,
};

// O contrato documenta esses campos, mas não fecha os descritores de sources.
const fiscalSourceDescriptorSchema = z.object({
  system: z.string().optional(),
  updatedAt: sourceDateTimeSchema.nullable().optional(),
  status: z.enum(['AVAILABLE', 'STALE', 'UNAVAILABLE']).optional(),
}).passthrough();

const fiscalSacMetaSchema = z.strictObject({
  ...fiscalMetaFields,
  source: z.literal('SAC'),
  merCoverage: z.literal('PROPOSTA'),
  filtersApplied: fiscalFiltersAppliedSchema.extend({ includeExternal: z.literal(false) }),
});

const fiscalMixedMetaSchema = z.strictObject({
  ...fiscalMetaFields,
  sources: z.array(fiscalSourceDescriptorSchema).min(2),
  merCoverage: z.literal('MIXED'),
  filtersApplied: fiscalFiltersAppliedSchema.extend({ includeExternal: z.literal(true) }),
});

const fiscalPriorityQueueItemSchema = z.strictObject({
  type: z.literal('SERVICE_ORDER'),
  severity: z.string().nullable(),
  contractId: z.number().int().nullable(),
  contractNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  title: z.string().nullable(),
  dueAt: sourceDateTimeSchema.nullable(),
});

export const fiscalContractSchema = z.strictObject({
  contractId: z.number().int().positive().safe(),
  contractNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  value: z.number().finite().nullable(),
  expiryDate: z.iso.date().nullable(),
});

export const fiscalContractBalanceSchema = z.strictObject({
  contractId: z.number().int().positive().safe(),
  contractNumber: z.string().nullable(),
  contractedValue: z.number().finite(),
  consumedValue: z.number().finite(),
  balanceValue: z.number().finite(),
  balancePct: z.number().finite().nullable(),
});
export type FiscalContract = z.infer<typeof fiscalContractSchema>;
export type FiscalContractBalance = z.infer<typeof fiscalContractBalanceSchema>;

export const fiscalContractAlertSchema = z.strictObject({
  alertId: z.number().int().positive().safe(),
  contractId: z.number().int().positive().safe(),
  contractNumber: z.string().nullable(),
  description: z.string().nullable(),
  expiryDate: z.iso.date().nullable(),
  createdAt: sourceDateTimeSchema.nullable(),
});
export type FiscalContractAlert = z.infer<typeof fiscalContractAlertSchema>;

const fiscalItemBalanceSchema = z.strictObject({
  contractId: z.number().int().positive().safe(), contractNumber: z.string().nullable(),
  supplierName: z.string().nullable(), itemId: z.number().int().positive().safe(),
  sequence: z.number().int().nullable(), specification: z.string().nullable(), unit: z.string().nullable(),
  quantityContracted: z.number().finite().nullable(), quantityConsumed: z.number().finite().nullable(),
  quantityMeasured: z.number().finite().nullable(), quantityBalance: z.number().finite().nullable(),
  valueContracted: z.number().finite().nullable(), valueConsumed: z.number().finite().nullable(),
  valueMeasured: z.number().finite().nullable(), valueBalance: z.number().finite().nullable(),
  valueMeasuredBalance: z.number().finite().nullable(), quantityMeasuredBalance: z.number().finite().nullable(),
  pctSaldo: z.number().finite().nullable(), pctSaldoMedido: z.number().finite().nullable(),
  faixa: z.enum(['adequado', 'atencao', 'critico', 'nao_verificavel']),
  statusVerificacao: z.string().nullable(), blockedAt: sourceDateTimeSchema.nullable(),
  blockReason: z.string().nullable(),
});
export type FiscalItemBalance = z.infer<typeof fiscalItemBalanceSchema>;

export const fiscalItemBalancesSchema = z.discriminatedUnion('coverage', [
  z.strictObject({ coverage: z.literal('UNAVAILABLE') }),
  z.strictObject({
    coverage: z.literal('AVAILABLE'),
    criterio: z.strictObject({
      base: z.enum(['comprometido', 'medido']), dimensao: z.enum(['valor', 'quantidade']),
      limiar_atencao: z.number().min(0).max(1), limiar_critico: z.number().min(0).max(1),
    }),
    resumo: z.strictObject({ adequado: z.number().int().nonnegative(), atencao: z.number().int().nonnegative(),
      critico: z.number().int().nonnegative(), nao_verificavel: z.number().int().nonnegative() }),
    agregados: z.strictObject({ totalContratado: z.number().finite().nullable(),
      saldoComprometido: z.number().finite().nullable(), saldoMedido: z.number().finite().nullable(),
      itemCount: z.number().int().nonnegative(), completeValueRows: z.number().int().nonnegative(),
      contractedValueRows: z.number().int().nonnegative(), committedBalanceRows: z.number().int().nonnegative(),
      measuredBalanceRows: z.number().int().nonnegative() }),
    itens: z.array(fiscalItemBalanceSchema),
  }),
]);
export type FiscalItemBalances = z.infer<typeof fiscalItemBalancesSchema>;

const fiscalDataSchema = z.strictObject({
  fiscal: z.strictObject({
    userId: z.number().int(),
    name: z.string().nullable(),
  }),
  cards: z.strictObject({
    activeContracts: z.number().int().nullable(),
    pendingServiceOrders: z.number().int().nullable(),
    criticalItems: z.number().int().nullable(),
    overdueActions: z.number().int().nullable(),
    externalViolations: z.number().int().nullable(),
  }),
  priorityQueue: z.array(fiscalPriorityQueueItemSchema).nullable(),
  contracts: z.array(fiscalContractSchema).nullable(),
  contractBalances: z.array(fiscalContractBalanceSchema).nullable(),
  contractAlerts: z.array(fiscalContractAlertSchema).nullable(),
  itemBalances: fiscalItemBalancesSchema.optional(),
});

export const fiscalDashboardSummaryResponseSchema = z.union([
  z.strictObject({ meta: fiscalSacMetaSchema, data: fiscalDataSchema }),
  z.strictObject({ meta: fiscalMixedMetaSchema, data: fiscalDataSchema }),
]).superRefine((response, context) => {
  const sacCards = [
    'activeContracts',
    'pendingServiceOrders',
    'criticalItems',
    'overdueActions',
  ] as const;

  for (const card of sacCards) {
    const unavailable = response.meta.dataCoverage[card] === 'UNAVAILABLE';
    if ((response.data.cards[card] === null) !== unavailable) {
      context.addIssue({
        code: 'custom',
        path: ['data', 'cards', card],
        message: 'Card e dataCoverage inconsistentes',
      });
    }
  }

  for (const key of ['contracts', 'contractBalances', 'contractAlerts'] as const) {
    if ((response.data[key] === null) !== (response.meta.dataCoverage[key] === 'UNAVAILABLE')) {
      context.addIssue({ code: 'custom', path: ['data', key], message: 'Lista e dataCoverage inconsistentes' });
    }
  }

  if (response.meta.filtersApplied.includeExternal === false &&
      response.data.cards.externalViolations !== null) {
    context.addIssue({
      code: 'custom',
      path: ['data', 'cards', 'externalViolations'],
      message: 'externalViolations deve ser null sem consulta aos KPIs',
    });
  }
});

export type FiscalDashboardSummaryResponse = z.infer<typeof fiscalDashboardSummaryResponseSchema>;

export const managerCoverageSchema = z.enum(["AVAILABLE", "UNAVAILABLE"]);

const managerContractSchema = z.strictObject({
  contractId: z.number().int().positive(),
  contractNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  value: z.number().finite().nullable(),
  expiryDate: z.iso.date().nullable(),
});
export const managerContractAlertSchema = fiscalContractAlertSchema.extend({
  type: z.string().nullable(),
  status: z.enum(['aberta', 'em_tratamento']),
});
// Same financial shape as Fiscal; authorization remains in each domain.
export const managerContractBalanceSchema = fiscalContractBalanceSchema;
export const managerDashboardSummaryResponseSchema = z.strictObject({
  meta: z.strictObject({
    generatedAt: dateTimeSchema,
    dataReference: z.iso.date(),
    timezone: z.string().min(1),
    source: z.literal('SAC'),
    merCoverage: z.literal('PROPOSTA'),
    filtersApplied: z.strictObject({ contratoId: z.array(z.number().int().positive()) }),
    dataCoverage: z.strictObject({
      portfolio: managerCoverageSchema,
      activeContracts: managerCoverageSchema,
      activePortfolioValue: managerCoverageSchema,
      expiringContracts: managerCoverageSchema,
      renewalsWithin120Days: managerCoverageSchema,
      contractAlerts: managerCoverageSchema,
      contractBalances: managerCoverageSchema,
    }),
  }),
  data: z.strictObject({
    manager: z.strictObject({ userId: z.number().int().positive(), name: z.string().nullable() }),
    cards: z.strictObject({
      activeContracts: z.number().int().nonnegative().nullable(),
      activePortfolioValue: z.number().finite().nullable(),
      expiringContracts: z.number().int().nonnegative().nullable(),
      renewalsWithin120Days: z.number().int().nonnegative().nullable(),
    }),
    contracts: z.array(managerContractSchema).nullable(),
    expiringContractList: z.array(managerContractSchema).nullable(),
    contractAlerts: z.array(managerContractAlertSchema).nullable(),
    contractBalances: z.array(managerContractBalanceSchema).nullable(),
  }),
}).superRefine((response, context) => {
  const pairs = [
    ['contractAlerts', response.data.contractAlerts],
    ['contractBalances', response.data.contractBalances],
    ['portfolio', response.data.contracts],
    ['activeContracts', response.data.cards.activeContracts],
    ['activePortfolioValue', response.data.cards.activePortfolioValue],
    ['expiringContracts', response.data.cards.expiringContracts],
    ['renewalsWithin120Days', response.data.cards.renewalsWithin120Days],
    ['expiringContracts', response.data.expiringContractList],
  ] as const;
  if (response.data.cards.expiringContracts !== response.data.cards.renewalsWithin120Days ||
      response.meta.dataCoverage.expiringContracts !== response.meta.dataCoverage.renewalsWithin120Days) {
    context.addIssue({ code: 'custom', path: ['data', 'cards', 'renewalsWithin120Days'], message: 'Indicadores de vencimento inconsistentes' });
  }
  for (const [key, value] of pairs) {
    if ((value === null) !== (response.meta.dataCoverage[key] === 'UNAVAILABLE')) {
      context.addIssue({ code: 'custom', path: ['meta', 'dataCoverage', key], message: 'Cobertura inconsistente' });
    }
  }
});
export type ManagerDashboardSummaryResponse = z.infer<typeof managerDashboardSummaryResponseSchema>;


// Partial 7.2 contract: only measures backed by current physical sources are available.
export const managerFiscalLoadResponseSchema = z.strictObject({
  meta: z.strictObject({
    generatedAt: dateTimeSchema,
    dataReference: z.iso.date(),
    timezone: z.string().min(1),
    source: z.literal('SAC'),
    merCoverage: z.literal('PROPOSTA'),
    dataCoverage: z.strictObject({
      inspectors: managerCoverageSchema,
      activeContracts: managerCoverageSchema,
      pendingOrders: managerCoverageSchema,
      capacity: z.literal('UNAVAILABLE'),
      weightedLoad: z.literal('UNAVAILABLE'),
      criticality: z.literal('UNAVAILABLE'),
      ranking: z.literal('UNAVAILABLE'),
      overdueActions: z.literal('UNAVAILABLE'),
    }),
  }),
  data: z.strictObject({
    inspectors: z.array(z.strictObject({
      userId: z.number().int().positive(),
      name: z.string().nullable(),
      activeContracts: z.number().int().nonnegative(),
      pendingOrders: z.number().int().nonnegative(),
      capacity: z.null(),
      weightedLoad: z.null(),
      criticality: z.null(),
      ranking: z.null(),
      overdueActions: z.null(),
    })).nullable(),
  }),
}).superRefine((response, context) => {
  if ((response.data.inspectors === null) !== (response.meta.dataCoverage.inspectors === 'UNAVAILABLE'))
    context.addIssue({ code: 'custom', path: ['data', 'inspectors'], message: 'Cobertura inconsistente' });
  const available = response.data.inspectors !== null;
  for (const key of ['activeContracts', 'pendingOrders'] as const)
    if ((response.meta.dataCoverage[key] === 'AVAILABLE') !== available)
      context.addIssue({ code: 'custom', path: ['meta', 'dataCoverage', key], message: 'Cobertura inconsistente' });
});
export type ManagerFiscalLoadResponse = z.infer<typeof managerFiscalLoadResponseSchema>;


export const managerSuppliersResponseSchema = z.strictObject({
  meta: z.strictObject({
    generatedAt: dateTimeSchema,
    dataReference: z.iso.date(),
    timezone: z.string().min(1),
    source: z.literal('SAC'),
    merCoverage: z.literal('PROPOSTA'),
    pagination: z.strictObject({ page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
      totalItems: z.number().int().nonnegative().nullable() }),
    dataCoverage: z.strictObject({ suppliers: managerCoverageSchema, vigentValue: managerCoverageSchema,
      abcClass: z.literal('UNAVAILABLE'), openFinancialAmount: z.literal('UNAVAILABLE'),
      openCriticalRisks: z.literal('UNAVAILABLE') }),
  }),
  data: z.strictObject({ suppliers: z.array(z.strictObject({
    supplierId: z.number().int().positive(), name: z.string(), vigentValue: z.number().finite().nullable(),
    abcClass: z.null(), openFinancialAmount: z.null(), openCriticalRisks: z.null(),
  })).nullable() }),
}).superRefine((response, context) => {
  const current = response.data.suppliers !== null;
  if (current !== (response.meta.dataCoverage.suppliers === 'AVAILABLE') ||
      current !== (response.meta.pagination.totalItems !== null))
    context.addIssue({ code: 'custom', path: ['meta', 'dataCoverage', 'suppliers'], message: 'Cobertura inconsistente' });
  const complete = current && response.data.suppliers!.every((item) => item.vigentValue !== null);
  // Coverage is global; an unavailable total may be on another page.
  if (!current && response.meta.dataCoverage.vigentValue !== 'UNAVAILABLE')
    context.addIssue({ code: 'custom', path: ['meta', 'dataCoverage', 'vigentValue'], message: 'Histórico indisponível' });
  if (response.meta.dataCoverage.vigentValue === 'AVAILABLE' && !complete)
    context.addIssue({ code: 'custom', path: ['meta', 'dataCoverage', 'vigentValue'], message: 'Valor indisponível' });
});
export type ManagerSuppliersResponse = z.infer<typeof managerSuppliersResponseSchema>;
