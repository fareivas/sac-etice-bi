import { describe, expect, it, vi } from 'vitest';
import type { FiscalDashboardFilters } from './schemas';
import type { FiscalSummaryRepository, FiscalIndicatorResult } from './repository';
import {
  composeFiscalDashboardSummary,
  type FiscalKpiSource,
  type FiscalKpiResult,
} from './service';

const filters = (includeExternal: boolean): FiscalDashboardFilters => ({
  dataReferencia: '2026-09-21',
  timezone: 'America/Fortaleza',
  unidadeId: null,
  contratoId: [],
  includeExternal,
});

const available = (value: number): FiscalIndicatorResult => ({ coverage: 'AVAILABLE', value });
const unavailable: FiscalIndicatorResult = { coverage: 'UNAVAILABLE' };

function repository(overrides: Partial<FiscalSummaryRepository> = {}): FiscalSummaryRepository {
  return {
    getFiscalIdentity: vi.fn(async (userId) => ({ userId, name: 'Fiscal Exemplo' })),
    getAuthorizedContractScope: vi.fn(async () => ({
      contracts: [{ contractId: 184, integrationUuid: 'uuid-contrato-184' }],
    })),
    getActiveContracts: vi.fn(async () => available(1)),
    getPendingServiceOrders: vi.fn(async () => available(2)),
    getCriticalItems: vi.fn(async () => available(0)),
    getOverdueActions: vi.fn(async () => unavailable),
    getPriorityQueue: vi.fn(async () => []),
    ...overrides,
  };
}

function kpiSource(result: FiscalKpiResult): FiscalKpiSource {
  return { getExternalViolations: vi.fn(async () => result) };
}

const now = () => new Date('2026-09-21T20:30:00.000Z');

describe('composeFiscalDashboardSummary', () => {
  it('with includeExternal=false skips KPI, uses SAC/PROPOSTA and null external count', async () => {
    const repo = repository();
    const kpis = kpiSource({
      status: 'AVAILABLE', externalViolations: 0, updatedAt: '2026-09-21T14:25:00-03:00',
    });

    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: repo, kpiSource: kpis, now },
    );

    expect(kpis.getExternalViolations).not.toHaveBeenCalled();
    expect(response.meta).toMatchObject({ source: 'SAC', merCoverage: 'PROPOSTA' });
    expect('sources' in response.meta).toBe(false);
    expect(response.data.cards.externalViolations).toBeNull();
    expect(response.meta.filtersApplied).toEqual({ unidadeId: null, contratoId: [], includeExternal: false });
  });

  it('with AVAILABLE KPIs emits multiple sources and preserves a valid external zero', async () => {
    const repo = repository({
      getAuthorizedContractScope: vi.fn(async () => ({ contracts: [
        { contractId: 184, integrationUuid: 'uuid-184' },
        { contractId: 205, integrationUuid: null },
      ] })),
    });
    const kpis = kpiSource({
      status: 'AVAILABLE', externalViolations: 0, updatedAt: '2026-09-21T14:25:00-03:00',
    });

    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(true) },
      { repository: repo, kpiSource: kpis, now },
    );

    expect(kpis.getExternalViolations).toHaveBeenCalledWith(['uuid-184']);
    expect('sources' in response.meta && response.meta.sources).toEqual([
      { system: 'SAC' },
      { system: 'KPIs', status: 'AVAILABLE', updatedAt: '2026-09-21T14:25:00-03:00' },
    ]);
    expect(response.meta.merCoverage).toBe('MIXED');
    expect(response.data.cards.externalViolations).toBe(0);
  });

  it('does not send null when every authorized contract lacks integrationUuid', async () => {
    const repo = repository({
      getAuthorizedContractScope: vi.fn(async () => ({ contracts: [
        { contractId: 184, integrationUuid: null },
        { contractId: 205, integrationUuid: null },
      ] })),
    });
    const kpis = kpiSource({
      status: 'UNAVAILABLE', externalViolations: null, updatedAt: null,
    });

    await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(true) },
      { repository: repo, kpiSource: kpis, now },
    );

    expect(kpis.getExternalViolations).toHaveBeenCalledWith([]);
    expect(kpis.getExternalViolations).not.toHaveBeenCalledWith(expect.arrayContaining([null]));
  });

  it('preserves the last valid KPI value and its updatedAt when STALE', async () => {
    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(true) },
      {
        repository: repository(),
        kpiSource: kpiSource({
          status: 'STALE', externalViolations: 4, updatedAt: '2026-09-20T18:00:00-03:00',
        }),
        now,
      },
    );

    expect(response.data.cards.externalViolations).toBe(4);
    expect('sources' in response.meta && response.meta.sources[1]).toMatchObject({
      status: 'STALE', updatedAt: '2026-09-20T18:00:00-03:00',
    });
  });

  it('represents KPI UNAVAILABLE without prior value as null, never zero', async () => {
    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(true) },
      {
        repository: repository(),
        kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }),
        now,
      },
    );

    expect(response.data.cards.externalViolations).toBeNull();
    expect('sources' in response.meta && response.meta.sources[1]).toMatchObject({
      status: 'UNAVAILABLE', updatedAt: null,
    });
  });

  it('maps only unavailable SAC coverage to null and preserves an actual zero', async () => {
    const repo = repository({
      getActiveContracts: vi.fn(async () => available(0)),
      getPendingServiceOrders: vi.fn(async () => unavailable),
      getCriticalItems: vi.fn(async () => available(0)),
      getOverdueActions: vi.fn(async () => unavailable),
    });

    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: repo, kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }), now },
    );

    expect(response.data.cards).toMatchObject({
      activeContracts: 0,
      pendingServiceOrders: null,
      criticalItems: 0,
      overdueActions: null,
    });
    expect(response.meta.dataCoverage).toEqual({
      activeContracts: 'AVAILABLE',
      pendingServiceOrders: 'UNAVAILABLE',
      criticalItems: 'AVAILABLE',
      overdueActions: 'UNAVAILABLE',
    });
  });

  it('preserves Fiscal and valid zero cards with empty portfolio, and passes through the empty queue', async () => {
    const repo = repository({
      getAuthorizedContractScope: vi.fn(async () => ({ contracts: [] })),
      getActiveContracts: vi.fn(async () => available(0)),
      getPendingServiceOrders: vi.fn(async () => available(0)),
      getCriticalItems: vi.fn(async () => available(0)),
      getOverdueActions: vi.fn(async () => available(0)),
      getPriorityQueue: vi.fn(async () => []),
    });
    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: repo, kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }), now },
    );

    expect(response.data.fiscal).toEqual({ userId: 77, name: 'Fiscal Exemplo' });
    expect(response.data.cards).toEqual({
      activeContracts: 0,
      pendingServiceOrders: 0,
      criticalItems: 0,
      overdueActions: 0,
      externalViolations: null,
    });
    expect(response.data.priorityQueue).toEqual([]);
    expect(response.meta.dataCoverage).toEqual({
      activeContracts: 'AVAILABLE',
      pendingServiceOrders: 'AVAILABLE',
      criticalItems: 'AVAILABLE',
      overdueActions: 'AVAILABLE',
    });
  });

  it('passes through queue fields including nulls without IPA or heuristic derivation', async () => {
    const queue = [{
      type: 'SERVICE_ORDER' as const,
      severity: null,
      contractId: null,
      contractNumber: null,
      supplierName: null,
      title: null,
      dueAt: null,
    }];
    const repo = repository({ getPriorityQueue: vi.fn(async () => queue) });
    const response = await composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: repo, kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }), now },
    );

    expect(response.data.priorityQueue).toEqual(queue);
    expect(response.data.priorityQueue[0]).not.toHaveProperty('ipa');
  });

  it('rejects repository failures, mismatched identity and inconsistent dependency results', async () => {
    const failedRepository = repository({
      getActiveContracts: vi.fn(async () => { throw new Error('database read failed'); }),
    });
    await expect(composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: failedRepository, kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }), now },
    )).rejects.toThrow('database read failed');

    const mismatched = repository({
      getFiscalIdentity: vi.fn(async () => ({ userId: 78, name: 'Outro' })),
    });
    await expect(composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: mismatched, kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }), now },
    )).rejects.toThrow('does not match authenticated user');

    const invalidResult = repository({
      getActiveContracts: vi.fn(async () => ({ coverage: 'UNAVAILABLE', value: 0 } as never)),
    });
    await expect(composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(false) },
      { repository: invalidResult, kpiSource: kpiSource({ status: 'UNAVAILABLE', externalViolations: null, updatedAt: null }), now },
    )).rejects.toThrow();

    const invalidKpi = {
      getExternalViolations: vi.fn(async () => ({
        status: 'UNAVAILABLE', externalViolations: 0, updatedAt: null,
      } as never)),
    };
    await expect(composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(true) },
      { repository: repository(), kpiSource: invalidKpi, now },
    )).rejects.toThrow();

    const failedKpi = {
      getExternalViolations: vi.fn(async () => { throw new Error('KPI transport failed'); }),
    };
    await expect(composeFiscalDashboardSummary(
      { authenticatedUserId: 77, filters: filters(true) },
      { repository: repository(), kpiSource: failedKpi, now },
    )).rejects.toThrow('KPI transport failed');
  });
});
