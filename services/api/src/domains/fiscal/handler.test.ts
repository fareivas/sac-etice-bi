import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/errors/index';
import type { FiscalAuthProvider, FiscalAuthenticationResult } from '../../shared/auth/index';
import type { FiscalSummaryRepository, FiscalIndicatorResult } from './repository';
import type { FiscalKpiSource, FiscalKpiResult } from './service';
import { createFiscalDashboardHandler, handler } from './handler';
import { createLocalFiscalDashboardHandler } from './handler';
import { GET_FISCAL_IDENTITY, GET_FISCAL_CONTRACT_SCOPE, COUNT_ACTIVE_FISCAL_CONTRACTS } from './queries';
import type { DbReader } from '../../shared/db/index';

const NOW = new Date('2026-09-23T12:00:00.000Z');
type TestHttpResponse = { statusCode: number; headers?: Record<string, string>; body?: string };

function apiEvent(rawQueryString = '', requestId?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /api/v1/fiscais/me/dashboard/resumo',
    rawPath: '/api/v1/fiscais/me/dashboard/resumo',
    rawQueryString,
    headers: {},
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method: 'GET',
        path: '/api/v1/fiscais/me/dashboard/resumo',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: requestId ?? '',
      routeKey: 'GET /api/v1/fiscais/me/dashboard/resumo',
      stage: '$default',
      time: '23/Sep/2026:12:00:00 +0000',
      timeEpoch: NOW.getTime(),
    },
    isBase64Encoded: false,
  };
}

const authorized: FiscalAuthenticationResult = {
  status: 'AUTHENTICATED',
  principal: { userId: 77 },
  canAccessFiscalView: true,
};
const unauthorized: FiscalAuthenticationResult = { status: 'UNAUTHENTICATED' };
const noFiscalAccess: FiscalAuthenticationResult = {
  status: 'AUTHENTICATED',
  principal: { userId: 77 },
  canAccessFiscalView: false,
};
const available: FiscalIndicatorResult = { coverage: 'AVAILABLE', value: 0 };
const unavailable: FiscalIndicatorResult = { coverage: 'UNAVAILABLE' };
const kpiAvailable: FiscalKpiResult = {
  status: 'AVAILABLE', externalViolations: 2, updatedAt: '2026-09-23T08:00:00-04:00',
};
const kpiUnavailable: FiscalKpiResult = {
  status: 'UNAVAILABLE', externalViolations: null, updatedAt: null,
};

function repo(overrides: Partial<FiscalSummaryRepository> = {}): FiscalSummaryRepository {
  return {
    getFiscalIdentity: vi.fn(async (userId: number) => ({ userId, name: 'Fiscal Teste' })),
    getAuthorizedContractScope: vi.fn(async () => ({
      coverage: 'AVAILABLE' as const, contracts: [{ contractId: 184, integrationUuid: 'uuid-184' }],
    })),
    getActiveContracts: vi.fn(async () => available),
    getPendingServiceOrders: vi.fn(async () => available),
    getCriticalItems: vi.fn(async () => available),
    getOverdueActions: vi.fn(async () => unavailable),
    getPriorityQueue: vi.fn(async () => ({ coverage: 'AVAILABLE' as const, items: [] })),
    ...overrides,
  };
}

function auth(result: FiscalAuthenticationResult = authorized): FiscalAuthProvider {
  return { authenticate: vi.fn(async () => result) };
}

function kpis(result: FiscalKpiResult = kpiAvailable): FiscalKpiSource {
  return { getExternalViolations: vi.fn(async () => result) };
}

function createHandler(overrides: {
  authProvider?: FiscalAuthProvider;
  repository?: FiscalSummaryRepository;
  kpiSource?: FiscalKpiSource;
  generateCorrelationId?: () => string;
} = {}) {
  return createFiscalDashboardHandler({
    authProvider: overrides.authProvider ?? auth(),
    repository: overrides.repository ?? repo(),
    kpiSource: overrides.kpiSource ?? kpis(),
    now: () => NOW,
    generateCorrelationId: overrides.generateCorrelationId ?? (() => 'generated-correlation-id'),
  });
}

async function invoke(rawQueryString = '', requestId?: string, handle = createHandler()) {
  return await handle(
    apiEvent(rawQueryString, requestId),
    {} as Context,
    () => undefined,
  ) as unknown as TestHttpResponse;
}

function bodyOf(response: { body?: string }): Record<string, any> {
  return JSON.parse(response.body ?? 'null') as Record<string, any>;
}

describe('Fiscal dashboard handler factory', () => {
  it('declares safe SAM defaults while allowing explicit local environment overrides', () => {
    const template = readFileSync(resolve(process.cwd(), '../../infra/sam/template.yaml'), 'utf8');
    const fiscal = template.split('  FiscalFunction:')[1]?.split('  GerenteContratosFunction:')[0];
    expect(fiscal).toContain('NODE_ENV: production');
    expect(fiscal).toContain("LOCAL_FISCAL_DASHBOARD_ENABLED: 'false'");
    for (const key of ['LOCAL_FISCAL_USER_ID', 'LOCAL_FISCAL_CAN_ACCESS_VIEW',
      'SAC_DB_HOST', 'SAC_DB_PORT', 'SAC_DB_NAME', 'SAC_DB_USER', 'SAC_DB_PASSWORD']) {
      expect(fiscal).toContain(`${key}:`);
    }
  });
  it.each([false, true])('serves local DEV with real repository reads and external=%s', async (external) => {
    const query = vi.fn(async (sql: string) => {
      if (sql === GET_FISCAL_IDENTITY) return [{ id: '77', nome: 'Fiscal Real', ativo: true }];
      if (sql === GET_FISCAL_CONTRACT_SCOPE) return [{ contrato_id: '184' }];
      if (sql === COUNT_ACTIVE_FISCAL_CONTRACTS) return [{ total: '1' }];
      throw new Error('Unexpected SQL');
    });
    const local = createLocalFiscalDashboardHandler(
      { query } as DbReader,
      { NODE_ENV: 'development', LOCAL_FISCAL_USER_ID: '77', LOCAL_FISCAL_CAN_ACCESS_VIEW: 'true' },
      () => NOW,
    );
    const response = await invoke(`includeExternal=${external}`, undefined, local);
    expect(response.statusCode).toBe(200);
    const body = bodyOf(response);
    expect(body.data.fiscal).toEqual({ userId: 77, name: 'Fiscal Real' });
    expect(body.data.cards).toMatchObject({ activeContracts: 1, pendingServiceOrders: null,
      criticalItems: null, overdueActions: null, externalViolations: null });
    expect(body.meta.dataCoverage).toEqual({ activeContracts: 'AVAILABLE', pendingServiceOrders: 'UNAVAILABLE',
      criticalItems: 'UNAVAILABLE', overdueActions: 'UNAVAILABLE' });
    expect(body.data.priorityQueue).toBeNull();
    if (external) expect(body.meta.sources[1]).toMatchObject({ system: 'KPIs', status: 'UNAVAILABLE', updatedAt: null });
    else expect(body.meta).toMatchObject({ source: 'SAC', merCoverage: 'PROPOSTA' });
  });
  it('returns 200 with includeExternal=false and uses authenticated userId', async () => {
    const authProvider = auth();
    const repository = repo();
    const kpiSource = kpis();
    const response = await invoke('includeExternal=false', 'gateway-req-1', createHandler({
      authProvider, repository, kpiSource,
    }));

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(bodyOf(response).meta).toMatchObject({ source: 'SAC', merCoverage: 'PROPOSTA' });
    expect(authProvider.authenticate).toHaveBeenCalledOnce();
    expect(repository.getFiscalIdentity).toHaveBeenCalledWith(77);
    expect(repository.getAuthorizedContractScope).toHaveBeenCalledWith(expect.objectContaining({
      authenticatedUserId: 77,
    }));
    expect(kpiSource.getExternalViolations).not.toHaveBeenCalled();
  });

  it('returns 200 with includeExternal=true and mixed source metadata', async () => {
    const response = await invoke('includeExternal=true', 'gateway-req-2');
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response).meta).toMatchObject({ merCoverage: 'MIXED' });
    expect(bodyOf(response).meta.sources).toHaveLength(2);
    expect(bodyOf(response).data.cards.externalViolations).toBe(2);
  });

  it('normalizes repeated contratoId from rawQueryString before repository/service use', async () => {
    const repository = repo();
    const response = await invoke(
      'contratoId=184&contratoId=205&contratoId=184&includeExternal=false',
      'gateway-req-3',
      createHandler({ repository }),
    );
    expect(response.statusCode).toBe(200);
    expect(repository.getAuthorizedContractScope).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ contratoId: [184, 205] }),
    }));
  });

  it('maps invalid query to INVALID_FILTER with safe details and correlationId', async () => {
    const response = await invoke('unidadeId=0', 'gateway-req-invalid');
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toMatchObject({
      meta: { correlationId: 'gateway-req-invalid' },
      error: {
        code: 'INVALID_FILTER',
        message: 'Filtros inválidos.',
        details: [{ field: 'unidadeId', reason: expect.any(String), rejectedValue: '0' }],
      },
    });
    expect(Array.isArray(bodyOf(response).error.details)).toBe(true);
  });

  it('maps an unknown query parameter to INVALID_FILTER', async () => {
    const response = await invoke('surprise=1', 'gateway-unknown');
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response).error).toMatchObject({
      code: 'INVALID_FILTER',
      details: [{ field: 'surprise' }],
    });
  });

  it('returns 401 when no authenticated principal exists', async () => {
    const authProvider = auth(unauthorized);
    const repository = repo();
    const response = await invoke('', 'gateway-401', createHandler({ authProvider, repository }));
    expect(response.statusCode).toBe(401);
    expect(bodyOf(response).error.code).toBe('UNAUTHENTICATED');
    expect(repository.getFiscalIdentity).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated user without Fiscal view authorization', async () => {
    const authProvider = auth(noFiscalAccess);
    const repository = repo();
    const response = await invoke('', 'gateway-403-auth', createHandler({ authProvider, repository }));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error.code).toBe('FORBIDDEN_SCOPE');
    expect(repository.getFiscalIdentity).not.toHaveBeenCalled();
  });

  it('preserves repository ApiError FORBIDDEN_SCOPE', async () => {
    const repository = repo({
      getAuthorizedContractScope: vi.fn(async () => { throw new ApiError('FORBIDDEN_SCOPE'); }),
    });
    const response = await invoke('', 'gateway-403-filter', createHandler({ repository }));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('converts unexpected repository errors to safe INTERNAL_ERROR', async () => {
    const repository = repo({
      getActiveContracts: vi.fn(async () => { throw new Error('SQL secret and internal trace'); }),
    });
    const response = await invoke('', 'gateway-500-repo', createHandler({ repository }));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).error).toEqual({
      code: 'INTERNAL_ERROR', message: 'Erro interno.', details: [],
    });
    expect(response.body).not.toContain('SQL secret');
  });

  it('converts unexpected KPI errors to INTERNAL_ERROR and never to zero', async () => {
    const kpiSource: FiscalKpiSource = {
      getExternalViolations: vi.fn(async () => { throw new Error('KPI backend detail'); }),
    };
    const response = await invoke('includeExternal=true', 'gateway-500-kpi', createHandler({ kpiSource }));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).error.code).toBe('INTERNAL_ERROR');
    expect(bodyOf(response).data).toBeUndefined();
    expect(response.body).not.toContain('KPI backend detail');
    expect(response.body).not.toContain('externalViolations":0');
  });

  it('keeps normal KPI UNAVAILABLE as a 200 response with null externalViolations', async () => {
    const response = await invoke('includeExternal=true', 'gateway-kpi-unavailable', createHandler({
      kpiSource: kpis(kpiUnavailable),
    }));
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response).data.cards.externalViolations).toBeNull();
    expect(bodyOf(response).meta.sources[1]).toMatchObject({ status: 'UNAVAILABLE', updatedAt: null });
  });

  it('keeps unavailable historical coverage as a 200 response and null card', async () => {
    const repository = repo({ getPendingServiceOrders: vi.fn(async () => unavailable) });
    const response = await invoke('includeExternal=false', 'gateway-coverage-unavailable', createHandler({ repository }));
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response).data.cards.pendingServiceOrders).toBeNull();
    expect(bodyOf(response).meta.dataCoverage.pendingServiceOrders).toBe('UNAVAILABLE');
  });

  it('uses requestContext.requestId when non-empty', async () => {
    const response = await invoke('unknown=1', 'request-id-from-gateway');
    expect(bodyOf(response).meta.correlationId).toBe('request-id-from-gateway');
  });

  it('uses injected correlation id when requestId is blank', async () => {
    const generateCorrelationId = vi.fn(() => 'injected-correlation-id');
    const response = await invoke('unknown=1', '   ', createHandler({ generateCorrelationId }));
    expect(generateCorrelationId).toHaveBeenCalledOnce();
    expect(bodyOf(response).meta.correlationId).toBe('injected-correlation-id');
  });

  it.each(['production', 'development'])('keeps export at 501 without permitted explicit activation in %s', async (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('LOCAL_FISCAL_DASHBOARD_ENABLED', nodeEnv === 'production' ? 'true' : undefined);
    const response = await handler(
      apiEvent() as APIGatewayProxyEventV2,
      {} as Context,
      () => undefined,
    ) as unknown as TestHttpResponse;
    expect(response).toEqual({
      statusCode: 501,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Dashboard ainda não implementado.' }),
    });
    vi.unstubAllEnvs();
  });
});
