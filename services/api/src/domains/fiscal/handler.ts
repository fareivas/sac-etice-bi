import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { FiscalAuthProvider } from '../../shared/auth/index';
import { LocalFiscalAuthProvider } from '../../shared/auth/local-fiscal';
import { getDb, type DbReader } from '../../shared/db/index';
import { ApiError, createApiError, createInternalError } from '../../shared/errors/index';
import { errorResponse, jsonResponse } from '../../shared/http/index';
import { FiscalQueryValidationError, parseFiscalDashboardQuery } from './schemas';
import type { FiscalSummaryRepository } from './repository';
import { composeFiscalDashboardSummary, type FiscalKpiSource } from './service';
import { PostgresFiscalSummaryRepository } from './postgres-repository';

export interface FiscalDashboardHandlerDependencies {
  authProvider: FiscalAuthProvider;
  repository: FiscalSummaryRepository;
  kpiSource: FiscalKpiSource;
  now?: () => Date;
  generateCorrelationId?: () => string;
}

function correlationIdFor(
  requestId: string | undefined,
  generate: () => string,
): string {
  if (typeof requestId === 'string' && requestId.trim().length > 0) return requestId.trim();
  const generated = generate();
  return generated.trim().length > 0 ? generated.trim() : randomUUID();
}

export function createFiscalDashboardHandler(
  dependencies: FiscalDashboardHandlerDependencies,
): APIGatewayProxyHandlerV2 {
  return async (event) => {
    const correlationId = correlationIdFor(
      event.requestContext?.requestId,
      dependencies.generateCorrelationId ?? randomUUID,
    );

    try {
      const authentication = await dependencies.authProvider.authenticate(event);
      if (authentication.status === 'UNAUTHENTICATED') {
        throw createApiError('UNAUTHENTICATED');
      }
      if (!authentication.canAccessFiscalView) {
        throw createApiError('FORBIDDEN_SCOPE');
      }

      let filters;
      try {
        filters = parseFiscalDashboardQuery(
          event,
          (dependencies.now ?? (() => new Date()))(),
        );
      } catch (error) {
        if (error instanceof FiscalQueryValidationError) {
          throw new ApiError('INVALID_FILTER', {
            details: error.details.map(({ field, reason, value }) => ({
              field,
              reason,
              ...(value === undefined ? {} : { rejectedValue: value }),
            })),
          });
        }
        throw error;
      }

      const summary = await composeFiscalDashboardSummary(
        { authenticatedUserId: authentication.principal.userId, filters },
        {
          repository: dependencies.repository,
          kpiSource: dependencies.kpiSource,
          now: dependencies.now,
        },
      );
      return jsonResponse(summary, 200);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : createInternalError(error);
      return errorResponse(apiError, {
        correlationId,
        now: dependencies.now,
      });
    }
  };
}

/** Prototype adapter only; no connection to the external KPI project is claimed. */
export const unavailablePrototypeKpiSource: FiscalKpiSource = {
  async getExternalViolations() {
    return { status: 'UNAVAILABLE', externalViolations: null, updatedAt: null };
  },
};

export function createLocalFiscalDashboardHandler(
  db: DbReader,
  environment: NodeJS.ProcessEnv,
  now?: () => Date,
): APIGatewayProxyHandlerV2 {
  return createFiscalDashboardHandler({
    authProvider: new LocalFiscalAuthProvider(environment),
    repository: new PostgresFiscalSummaryRepository(db, now),
    kpiSource: unavailablePrototypeKpiSource,
    now,
  });
}

export const handler: APIGatewayProxyHandlerV2 = async (event, context, callback) => {
  if ((process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') ||
      process.env.LOCAL_FISCAL_DASHBOARD_ENABLED !== 'true') {
    return {
      statusCode: 501,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Dashboard ainda não implementado.' }),
    };
  }
  const response = await createLocalFiscalDashboardHandler(getDb(), process.env)(event, context, callback);
  if (response === undefined) throw new Error('Fiscal handler returned no response');
  return response;
};
