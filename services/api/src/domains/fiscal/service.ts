import { z } from 'zod';
import {
  fiscalDashboardSummaryResponseSchema,
  type FiscalDashboardSummaryResponse,
} from '@sac-etice-bi/contracts';
import type { FiscalDashboardFilters } from './schemas';
import type {
  FiscalIndicatorResult,
  FiscalRepositoryContext,
  FiscalScopedRepositoryQuery,
  FiscalSummaryRepository,
} from './repository';

const kpiResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('AVAILABLE'),
    externalViolations: z.number().int(),
    updatedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('STALE'),
    externalViolations: z.number().int(),
    updatedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('UNAVAILABLE'),
    externalViolations: z.null(),
    updatedAt: z.null(),
  }),
]);

export type FiscalKpiResult = z.infer<typeof kpiResultSchema>;

/** Receives only SAC-provided external UUIDs, never local filters or IDs. */
export interface FiscalKpiSource {
  getExternalViolations(
    authorizedContractUuids: readonly string[],
  ): Promise<FiscalKpiResult>;
}

export interface FiscalSummaryServiceDependencies {
  repository: FiscalSummaryRepository;
  kpiSource: FiscalKpiSource;
  now?: () => Date;
}

export interface FiscalSummaryServiceInput {
  /** Identity is injected from authentication by a future caller; this service implements no auth. */
  authenticatedUserId: number;
  filters: FiscalDashboardFilters;
}

const indicatorResultSchema = z.discriminatedUnion('coverage', [
  z.strictObject({ coverage: z.literal('AVAILABLE'), value: z.number().int() }),
  z.strictObject({ coverage: z.literal('UNAVAILABLE') }),
]);

function checkedIndicator(result: FiscalIndicatorResult): FiscalIndicatorResult {
  return indicatorResultSchema.parse(result);
}

function cardValue(result: FiscalIndicatorResult): number | null {
  return result.coverage === 'AVAILABLE' ? result.value : null;
}

function cardCoverage(result: FiscalIndicatorResult): 'AVAILABLE' | 'UNAVAILABLE' {
  return result.coverage;
}

export async function composeFiscalDashboardSummary(
  input: FiscalSummaryServiceInput,
  dependencies: FiscalSummaryServiceDependencies,
): Promise<FiscalDashboardSummaryResponse> {
  const context: FiscalRepositoryContext = {
    authenticatedUserId: input.authenticatedUserId,
    filters: input.filters,
  };

  const [fiscal, scope] = await Promise.all([
    dependencies.repository.getFiscalIdentity(input.authenticatedUserId),
    dependencies.repository.getAuthorizedContractScope(context),
  ]);
  if (fiscal.userId !== input.authenticatedUserId) {
    throw new Error('Repository identity does not match authenticated user.');
  }

  const query: FiscalScopedRepositoryQuery = { context, scope };
  const [active, pending, critical, overdue, priorityQueue, external] = await Promise.all([
    dependencies.repository.getActiveContracts(query).then(checkedIndicator),
    dependencies.repository.getPendingServiceOrders(query).then(checkedIndicator),
    dependencies.repository.getCriticalItems(query).then(checkedIndicator),
    dependencies.repository.getOverdueActions(query).then(checkedIndicator),
    dependencies.repository.getPriorityQueue(query),
    input.filters.includeExternal
      ? dependencies.kpiSource.getExternalViolations(
        scope.contracts.flatMap((contract) => contract.integrationUuid === null
          ? []
          : [contract.integrationUuid]),
      )
        .then((result) => kpiResultSchema.parse(result))
      : Promise.resolve(null),
  ]);

  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const sacCards = {
    activeContracts: cardValue(active),
    pendingServiceOrders: cardValue(pending),
    criticalItems: cardValue(critical),
    overdueActions: cardValue(overdue),
  };
  const dataCoverage = {
    activeContracts: cardCoverage(active),
    pendingServiceOrders: cardCoverage(pending),
    criticalItems: cardCoverage(critical),
    overdueActions: cardCoverage(overdue),
  };
  const filtersApplied = {
    unidadeId: input.filters.unidadeId,
    contratoId: [...input.filters.contratoId],
    includeExternal: input.filters.includeExternal,
  };

  const rawResponse = input.filters.includeExternal
    ? {
      meta: {
        generatedAt,
        dataReference: input.filters.dataReferencia,
        timezone: input.filters.timezone,
        sources: [
          { system: 'SAC' },
          {
            system: 'KPIs',
            status: external!.status,
            updatedAt: external!.updatedAt,
          },
        ],
        merCoverage: 'MIXED',
        dataCoverage,
        filtersApplied,
      },
      data: {
        fiscal,
        cards: {
          ...sacCards,
          externalViolations: external!.externalViolations,
        },
        priorityQueue,
      },
    }
    : {
      meta: {
        generatedAt,
        dataReference: input.filters.dataReferencia,
        timezone: input.filters.timezone,
        source: 'SAC',
        merCoverage: 'PROPOSTA',
        dataCoverage,
        filtersApplied,
      },
      data: {
        fiscal,
        cards: {
          ...sacCards,
          externalViolations: null,
        },
        priorityQueue,
      },
    };

  return fiscalDashboardSummaryResponseSchema.parse(rawResponse);
}
