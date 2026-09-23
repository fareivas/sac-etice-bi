import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { FiscalAuthProvider, FiscalAuthenticationResult } from './index';

/** Temporary DEV/TEST harness. Identity and access are selected by the server environment. */
export class LocalFiscalAuthProvider implements FiscalAuthProvider {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async authenticate(_event: APIGatewayProxyEventV2): Promise<FiscalAuthenticationResult> {
    const env = this.environment;
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      return { status: 'UNAUTHENTICATED' };
    }
    const rawId = env.LOCAL_FISCAL_USER_ID;
    const rawAccess = env.LOCAL_FISCAL_CAN_ACCESS_VIEW;
    if (!rawId || !/^[1-9]\d*$/.test(rawId) ||
        (rawAccess !== 'true' && rawAccess !== 'false')) {
      return { status: 'UNAUTHENTICATED' };
    }
    const userId = Number(rawId);
    if (!Number.isSafeInteger(userId)) return { status: 'UNAUTHENTICATED' };
    return {
      status: 'AUTHENTICATED',
      principal: { userId },
      canAccessFiscalView: rawAccess === 'true',
    };
  }
}
