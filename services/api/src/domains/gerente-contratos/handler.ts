import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getDb, type DbReader } from '../../shared/db/index';
import { ApiError, createApiError, createInternalError } from '../../shared/errors/index';
import { errorResponse, jsonResponse } from '../../shared/http/index';
import { PostgresManagerRepository } from './repository';
import { parseManagerQuery, ManagerQueryValidationError } from './schemas';
import { composeManagerSummary } from './service';

export type ManagerAuthentication = { status: 'UNAUTHENTICATED' } | {
  status: 'AUTHENTICATED'; principal: { userId: number }; canAccessManagerView: boolean;
};
export interface ManagerAuthProvider { authenticate(event: APIGatewayProxyEventV2): Promise<ManagerAuthentication> }
export class LocalManagerAuthProvider implements ManagerAuthProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  async authenticate(_event: APIGatewayProxyEventV2): Promise<ManagerAuthentication> {
    if (!['development', 'test'].includes(this.env.NODE_ENV ?? '') ||
      !/^[1-9]\d*$/.test(this.env.LOCAL_MANAGER_USER_ID ?? '') ||
      !['true', 'false'].includes(this.env.LOCAL_MANAGER_CAN_ACCESS_VIEW ?? '')) return { status: 'UNAUTHENTICATED' };
    const userId = Number(this.env.LOCAL_MANAGER_USER_ID);
    if (!Number.isSafeInteger(userId)) return { status: 'UNAUTHENTICATED' };
    return { status: 'AUTHENTICATED', principal: { userId },
      canAccessManagerView: this.env.LOCAL_MANAGER_CAN_ACCESS_VIEW === 'true' };
  }
}
export function createManagerHandler(dependencies: {
  authProvider: ManagerAuthProvider;
  repository: Pick<PostgresManagerRepository, 'identity' | 'scope' | 'activeContracts'>;
  now?: () => Date;
}): APIGatewayProxyHandlerV2 {
  return async (event) => {
    const correlationId = event.requestContext?.requestId?.trim() || randomUUID();
    try {
      const auth = await dependencies.authProvider.authenticate(event);
      if (auth.status === 'UNAUTHENTICATED') throw createApiError('UNAUTHENTICATED');
      if (!auth.canAccessManagerView) throw createApiError('FORBIDDEN_SCOPE');
      let filters;
      try { filters = parseManagerQuery(event, (dependencies.now ?? (() => new Date()))()); }
      catch (error) {
        if (error instanceof ManagerQueryValidationError) throw new ApiError('INVALID_FILTER', { details: [{ field: error.field }] });
        throw error;
      }
      return jsonResponse(await composeManagerSummary(auth.principal.userId, filters,
        dependencies.repository, dependencies.now), 200);
    } catch (error) {
      return errorResponse(error instanceof ApiError ? error : createInternalError(error),
        { correlationId, now: dependencies.now });
    }
  };
}
export function createLocalManagerHandler(db: DbReader, env: NodeJS.ProcessEnv,
  now?: () => Date): APIGatewayProxyHandlerV2 {
  return createManagerHandler({ authProvider: new LocalManagerAuthProvider(env),
    repository: new PostgresManagerRepository(db), now });
}
export const handler: APIGatewayProxyHandlerV2 = async (event, context, callback) => {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '') ||
      process.env.LOCAL_MANAGER_DASHBOARD_ENABLED !== 'true') {
    return { statusCode: 501, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Dashboard ainda não implementado.' }) };
  }
  const result = await createLocalManagerHandler(getDb(), process.env)(event, context, callback);
  if (result === undefined) throw new Error('Manager handler returned no response');
  return result;
};
