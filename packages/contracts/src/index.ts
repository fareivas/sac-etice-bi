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
    }),
  }),
  data: z.strictObject({
    manager: z.strictObject({ userId: z.number().int().positive(), name: z.string().nullable() }),
    cards: z.strictObject({
      activeContracts: z.number().int().nonnegative().nullable(),
      activePortfolioValue: z.number().finite().nullable(),
      expiringContracts: z.number().int().nonnegative().nullable(),
    }),
    contracts: z.array(managerContractSchema).nullable(),
    expiringContractList: z.array(managerContractSchema).nullable(),
  }),
}).superRefine((response, context) => {
  const pairs = [
    ['portfolio', response.data.contracts],
    ['activeContracts', response.data.cards.activeContracts],
    ['activePortfolioValue', response.data.cards.activePortfolioValue],
    ['expiringContracts', response.data.cards.expiringContracts],
    ['expiringContracts', response.data.expiringContractList],
  ] as const;
  for (const [key, value] of pairs) {
    if ((value === null) !== (response.meta.dataCoverage[key] === 'UNAVAILABLE')) {
      context.addIssue({ code: 'custom', path: ['meta', 'dataCoverage', key], message: 'Cobertura inconsistente' });
    }
  }
});
export type ManagerDashboardSummaryResponse = z.infer<typeof managerDashboardSummaryResponseSchema>;
