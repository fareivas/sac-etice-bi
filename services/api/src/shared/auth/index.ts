import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface AuthenticatedPrincipal {
  /** SAC user id resolved by a future authentication adapter. */
  userId: number;
}

export type FiscalAuthenticationResult =
  | { status: 'UNAUTHENTICATED' }
  | {
    status: 'AUTHENTICATED';
    principal: AuthenticatedPrincipal;
    canAccessFiscalView: boolean;
  };

/** Authentication mechanism remains deliberately unimplemented. */
export interface FiscalAuthProvider {
  authenticate(event: APIGatewayProxyEventV2): Promise<FiscalAuthenticationResult>;
}
