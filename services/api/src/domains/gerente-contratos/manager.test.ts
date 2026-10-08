import { describe, expect, it, vi } from 'vitest';
import type { DbReader } from '../../shared/db/index';
import { GET_MANAGER_ACTIVE_CONTRACTS, GET_MANAGER_IDENTITY, GET_MANAGER_SCOPE, GET_MANAGER_CONTRACT_ALERTS, GET_MANAGER_CONTRACT_BALANCES, GET_MANAGER_PREVENTIVE_QUALITY } from './queries';
import { PostgresManagerRepository } from './repository';
import { composeManagerSummary, EXPIRY_RISK_DAYS } from './service';
import { parseManagerQuery } from './schemas';
import { createManagerHandler } from './handler';
import { GET_CURRENT_ITEM_BALANCES } from '../../shared/item-balance-query';

const now = () => new Date('2026-09-25T15:00:00Z');
const filters = { dataReferencia: '2026-09-25', timezone: 'America/Fortaleza', contratoId: [] as number[] };
const contract = (id: string, value: string | null, status = 'vigente', expiry: string | null = '2026-12-31') =>
  ({ id, numero: `CT-${id}`, valor_total: value, status, vigencia_fim: expiry, fornecedor_id: '1' });
function fixture(designations: { userId: number; contractId: string; role: string; active: boolean }[],
  contracts: ReturnType<typeof contract>[]) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]): Promise<unknown[]> => {
    if (sql === GET_MANAGER_IDENTITY) return [{ id: String(values![0]), nome: `Gestor ${values![0]}`, ativo: true }];
    if (sql === GET_MANAGER_SCOPE) return designations.filter((d) => d.userId === values![0] && d.role === 'gestor' && d.active)
      .map((d) => ({ contrato_id: d.contractId }));
    if (sql === GET_MANAGER_ACTIVE_CONTRACTS) return contracts.filter((c) => (values![0] as number[]).includes(Number(c.id)) && c.status === 'vigente')
      .map((c) => {
        const reference = values![1] as string;
        const lastDay = new Date(`${reference}T00:00:00Z`);
        lastDay.setUTCDate(lastDay.getUTCDate() + 120);
        return { contract_id: c.id, contract_number: c.numero, supplier_name: 'Fornecedor', value: c.valor_total, expiry_date: c.vigencia_fim,
          expires_within_120_days: c.vigencia_fim === null ? null : c.vigencia_fim >= reference && c.vigencia_fim <= lastDay.toISOString().slice(0, 10) };
      });
    if (sql === GET_MANAGER_CONTRACT_ALERTS) return [];
    if (sql === GET_MANAGER_CONTRACT_BALANCES) return contracts.filter(c => (values![0] as number[]).includes(Number(c.id)) && c.status === 'vigente').map(c => ({ contract_id: c.id, contract_number: c.numero, contracted_value: c.valor_total, consumed_value: '0', balance_value: c.valor_total }));
    if (sql === GET_MANAGER_PREVENTIVE_QUALITY) return contracts.filter(c => (values![0] as number[]).includes(Number(c.id)) && c.status === 'vigente').map(c => {
      const reference = values![1] as string;
      const limit = new Date(`${reference}T00:00:00Z`);
      limit.setUTCDate(limit.getUTCDate() + 90);
      return { contract_id: c.id, objeto: 'Objeto', valor_total: c.valor_total,
        data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: c.vigencia_fim,
        eligible_d90: c.vigencia_fim === null ? null : c.vigencia_fim >= reference && c.vigencia_fim <= limit.toISOString().slice(0, 10), intencao: null };
    });
    if (sql === GET_CURRENT_ITEM_BALANCES) return [];
    throw new Error('Unexpected SQL');
  });
  return { repo: new PostgresManagerRepository({ query } as DbReader), query };
}
const assignment = (userId: number, contractId: string, role = 'gestor', active = true) => ({ userId, contractId, role, active });

describe('manager current portfolio', () => {
  it('uses the approved inclusive expiry bands and leaves missing expiry unavailable', async () => {
    expect(EXPIRY_RISK_DAYS).toEqual({ critical: 30, attention: 120 });
    const dates = ['2026-09-24', '2026-09-25', '2026-10-25', '2026-10-26',
      '2026-12-24', '2026-12-25', '2027-01-23', '2027-01-24', null];
    const { repo } = fixture(dates.map((_, i) => assignment(1, String(i + 1))),
      dates.map((date, i) => contract(String(i + 1), '10', 'vigente', date)));
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.contractRiskMatrix?.map(row => row.vigencia)).toEqual([
      'CRITICAL', 'CRITICAL', 'CRITICAL', 'ATTENTION', 'ATTENTION',
      'ATTENTION', 'ATTENTION', 'OK', 'UNAVAILABLE',
    ]);
    expect(result.data.contractRiskMatrix?.every(row => row.saldo.status === 'UNAVAILABLE' &&
      !row.saldo.partialCoverage && row.sla === 'UNAVAILABLE' && row.medicao === 'UNAVAILABLE' &&
      row.pagamento === 'UNAVAILABLE' && row.indice === 'UNAVAILABLE')).toBe(true);
  });
  it('consolidates existing item bands by priority and preserves partial coverage', async () => {
    const ids = ['1', '2', '3', '4', '5'];
    const { repo, query } = fixture(ids.map(id => assignment(1, id)), ids.map(id => contract(id, '100')));
    const original = query.getMockImplementation()!;
    const item = (contractId: string, itemId: string, consumed: string | null) => ({
      contract_id: contractId, contract_number: `CT-${contractId}`, supplier_name: 'Fornecedor',
      item_id: itemId, sequence: Number(itemId), specification: 'Serviço', unit: 'un',
      quantity_contracted: '1', quantity_consumed: '0', quantity_measured: '0', quantity_balance: '1',
      value_contracted: consumed === null ? null : '100', value_consumed: consumed,
      value_measured: '0', value_balance: consumed === null ? null : String(100 - Number(consumed)),
      verification_status: null,
    });
    query.mockImplementation(async (sql, values) => sql === GET_CURRENT_ITEM_BALANCES ? [
      item('1', '11', '90'), item('1', '12', '40'), item('1', '13', null),
      item('2', '21', '50'), item('2', '22', '0'),
      item('3', '31', '0'), item('4', '41', null),
    ] : original(sql, values));
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.contractRiskMatrix?.map(row => row.saldo)).toEqual([
      { status: 'CRITICAL', partialCoverage: true },
      { status: 'ATTENTION', partialCoverage: false },
      { status: 'OK', partialCoverage: false },
      { status: 'UNAVAILABLE', partialCoverage: true },
      { status: 'UNAVAILABLE', partialCoverage: false },
    ]);
    expect(query).toHaveBeenCalledWith(GET_CURRENT_ITEM_BALANCES, [[1, 2, 3, 4, 5]]);
  });
  it('returns available zero for a manager with no portfolio', async () => {
    const { repo, query } = fixture([], []);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards).toEqual({ activeContracts: 0, activePortfolioValue: 0, expiringContracts: 0, renewalsWithin120Days: 0 });
    expect(result.data.expiringContractList).toEqual([]);
    expect(result.data.contracts).toEqual([]);
    expect(result.meta.dataCoverage).toEqual({ portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE', expiringContracts: 'AVAILABLE', renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE', itemBalances: 'AVAILABLE', renewalDecisionsD90: 'AVAILABLE', registrationCompleteness: 'AVAILABLE', contractRiskMatrix: 'AVAILABLE' });
    expect(result.data.contractRiskMatrix).toEqual([]);
    expect(result.data.preventiveQuality).toMatchObject({ renewalDecisionsD90: { eligibleContracts: 0, percentage: null },
      registrationCompleteness: { activeContracts: 0, percentage: null } });
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_PREVENTIVE_QUALITY, expect.anything());
    expect(result.data.itemBalances).toMatchObject({ coverage: 'AVAILABLE', itens: [], agregados: { itemCount: 0, totalContratado: 0 } });
    expect(query).not.toHaveBeenCalledWith(GET_CURRENT_ITEM_BALANCES, expect.anything());
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_ACTIVE_CONTRACTS, expect.anything());
  });
  it('counts one and multiple distinct active contracts, excluding all inactive statuses and fiscal-only/inactive designations', async () => {
    const contracts = [contract('1', '10.50'), contract('2', '20.25'), contract('3', '30', 'encerrado'),
      contract('4', '40', 'rescindido'), contract('5', '50', 'suspenso'), contract('6', '60', 'rascunho'), contract('7', '70'), contract('8', '80')];
    const designations = [assignment(1, '1'), assignment(1, '1'), assignment(1, '2'),
      ...['3','4','5','6'].map((id) => assignment(1, id)), assignment(1, '7', 'fiscal'), assignment(1, '8', 'gestor', false)];
    const { repo } = fixture(designations, contracts);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards).toEqual({ activeContracts: 2, activePortfolioValue: 30.75, expiringContracts: 2, renewalsWithin120Days: 2 });
    expect(result.data.contracts?.map((c) => c.contractId)).toEqual([1, 2]);
    const one = await composeManagerSummary(1, { ...filters, contratoId: [1] }, repo, now);
    expect(one.data.cards.activeContracts).toBe(1);
    expect(one.data.cards.activePortfolioValue).toBe(10.5);
    expect(one.data.cards.renewalsWithin120Days).toBe(1);
    expect(one.data.expiringContractList?.map((c) => c.contractId)).toEqual([1]);
    expect(one.data.contractRiskMatrix?.map((row) => row.contractId)).toEqual([1]);
  });
  it('isolates managers and rejects a contract outside the current authorized scope', async () => {
    const { repo, query } = fixture([assignment(1, '1'), assignment(2, '2')], [contract('1', '10'), contract('2', '20')]);
    expect((await composeManagerSummary(1, filters, repo, now)).data.contracts?.map((c) => c.contractId)).toEqual([1]);
    expect((await composeManagerSummary(1, filters, repo, now)).data.contractRiskMatrix?.map((row) => row.contractId)).toEqual([1]);
    expect((await composeManagerSummary(2, filters, repo, now)).data.contracts?.map((c) => c.contractId)).toEqual([2]);
    query.mockClear();
    await expect(composeManagerSummary(1, { ...filters, contratoId: [2] }, repo, now)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_PREVENTIVE_QUALITY, expect.anything());
  });
  it('uses inclusive 0 and 120 day boundaries, excluding expired and day 121', async () => {
    const dates = ['2026-09-25', '2026-09-26', '2027-01-22', '2027-01-23', '2027-01-24', '2026-09-24'];
    const assignments = dates.map((_, index) => assignment(1, String(index + 1)));
    const contracts = dates.map((date, index) => contract(String(index + 1), '10', 'vigente', date));
    contracts.push(contract('7', '10', 'encerrado', '2026-09-25'));
    assignments.push(assignment(1, '7'));
    const { repo, query } = fixture(assignments, contracts);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards.renewalsWithin120Days).toBe(4);
    expect(result.data.cards.expiringContracts).toBe(4);
    expect(result.data.expiringContractList?.map((c) => c.contractId)).toEqual([1, 2, 3, 4]);
    expect(query).toHaveBeenCalledWith(GET_MANAGER_ACTIVE_CONTRACTS, [[1, 2, 3, 4, 5, 6, 7], '2026-09-25']);
    expect(GET_MANAGER_ACTIVE_CONTRACTS).toContain("c.vigencia_fim::date BETWEEN $2::date AND ($2::date + 120)");
    expect(GET_MANAGER_ACTIVE_CONTRACTS).toContain("c.status = 'vigente'");
    expect(GET_MANAGER_ACTIVE_CONTRACTS).toContain('c.id = ANY($1::bigint[])');
  });
  it('makes count and list unavailable if any scoped active contract lacks vigencia_fim', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(1, '2')],
      [contract('1', '10', 'vigente', '2026-09-26'), contract('2', '20', 'vigente', null)]);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards.renewalsWithin120Days).toBeNull();
    expect(result.data.cards.expiringContracts).toBeNull();
    expect(result.data.expiringContractList).toBeNull();
    expect(result.meta.dataCoverage.renewalsWithin120Days).toBe('UNAVAILABLE');
    expect(result.meta.dataCoverage.expiringContracts).toBe('UNAVAILABLE');
    const filtered = await composeManagerSummary(1, { ...filters, contratoId: [1] }, repo, now);
    expect(filtered.data.cards.renewalsWithin120Days).toBe(1);
    expect(filtered.data.expiringContractList?.map((c) => c.contractId)).toEqual([1]);
  });
  it('excludes contracts assigned only as fiscal, inactive manager assignments, and other managers', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(1, '2', 'fiscal'),
      assignment(1, '3', 'gestor', false), assignment(2, '4')],
      [1, 2, 3, 4].map((id) => contract(String(id), '10', 'vigente', '2026-09-25')));
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards.renewalsWithin120Days).toBe(1);
    expect(result.data.expiringContractList?.map((c) => c.contractId)).toEqual([1]);
  });
  it('adds decimal values without accumulated floating point error', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(1, '2')], [contract('1', '0.1'), contract('2', '0.2')]);
    expect((await composeManagerSummary(1, filters, repo, now)).data.cards.activePortfolioValue).toBe(0.3);
  });
  it('does not turn a missing contract value into zero or a partial total', async () => {
    const { repo } = fixture([assignment(1, '1'), assignment(1, '2')], [contract('1', '10'), contract('2', null)]);
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.cards.activeContracts).toBe(2);
    expect(result.data.cards.activePortfolioValue).toBeNull();
    expect(result.meta.dataCoverage.activePortfolioValue).toBe('UNAVAILABLE');
  });
  it('never applies current designation retroactively', async () => {
    const { repo, query } = fixture([assignment(1, '1')], [contract('1', '10')]);
    const result = await composeManagerSummary(1, { ...filters, dataReferencia: '2026-09-24' }, repo, now);
    expect(result.data.cards.activeContracts).toBeNull();
    expect(result.data.cards.activePortfolioValue).toBeNull();
    expect(result.data.contracts).toBeNull();
    expect(result.data.cards.renewalsWithin120Days).toBeNull();
    expect(result.data.expiringContractList).toBeNull();
    expect(query).not.toHaveBeenCalledWith(GET_MANAGER_SCOPE, expect.anything());
  });
  it('validates dates, unknown filters and duplicate contract ids', () => {
    expect(parseManagerQuery({ rawQueryString: 'contratoId=1&contratoId=1' }, now()).contratoId).toEqual([1]);
    for (const rawQueryString of ['unidadeId=1', 'dataReferencia=2026-02-30', 'dataReferencia=2026-09-26', 'contratoId=0']) {
      expect(() => parseManagerQuery({ rawQueryString }, now())).toThrow();
    }
  });
  it('returns standardized forbidden response through the handler', async () => {
    const { repo } = fixture([assignment(1, '1')], [contract('1', '10')]);
    const handler = createManagerHandler({ authProvider: { authenticate: async () =>
      ({ status: 'AUTHENTICATED', principal: { userId: 1 }, canAccessManagerView: true }) }, repository: repo, now });
    const response = await handler({ rawQueryString: 'contratoId=2', requestContext: { requestId: 'test' } } as any, {} as any, () => {});
    expect(response).toMatchObject({ statusCode: 403 });
    expect(JSON.parse((response as { body: string }).body).error.code).toBe('FORBIDDEN_SCOPE');
  });
  it('reads only scoped current items with the Fiscal classification and incomplete monetary coverage', async () => {
    const { repo, query } = fixture([assignment(1, '1'), assignment(1, '2'), assignment(2, '3')],
      [contract('1', '100'), contract('2', '100'), contract('3', '100')]);
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql, values) => sql === GET_CURRENT_ITEM_BALANCES ? [{
      contract_id: '1', contract_number: 'CT-1', supplier_name: 'Fornecedor', item_id: '10', sequence: 1,
      specification: 'Serviço', unit: 'un', quantity_contracted: '2', quantity_consumed: '1',
      quantity_measured: '1', quantity_balance: '1', value_contracted: '100', value_consumed: '95',
      value_measured: '20', value_balance: '5', verification_status: 'pendente',
    }, {
      contract_id: '2', contract_number: 'CT-2', supplier_name: null, item_id: '11', sequence: 2,
      specification: null, unit: null, quantity_contracted: '1', quantity_consumed: null,
      quantity_measured: null, quantity_balance: null, value_contracted: null, value_consumed: null,
      value_measured: null, value_balance: null, verification_status: null,
    }] : original(sql, values));
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(query).toHaveBeenCalledWith(GET_CURRENT_ITEM_BALANCES, [[1, 2]]);
    expect(result.meta.dataCoverage.itemBalances).toBe('AVAILABLE');
    expect(result.data.itemBalances).toMatchObject({ coverage: 'AVAILABLE', resumo: { critico: 1, nao_verificavel: 1 },
      agregados: { itemCount: 2, totalContratado: null, saldoComprometido: null,
        contractedValueRows: 1, committedBalanceRows: 1, measuredBalanceRows: 1 } });
    if (result.data.itemBalances.coverage !== 'AVAILABLE') throw new Error('Expected current items');
    expect(result.data.itemBalances.itens[0]).toMatchObject({ faixa: 'critico', valueMeasuredBalance: 80,
      statusVerificacao: 'pendente' });
    expect(result.data.itemBalances.itens[1].valueContracted).toBeNull();
    expect(result.data.contractRiskMatrix?.map(row => row.saldo)).toEqual([
      { status: 'CRITICAL', partialCoverage: false }, { status: 'UNAVAILABLE', partialCoverage: true },
    ]);
    expect(GET_CURRENT_ITEM_BALANCES).toContain('c.id = ANY($1::bigint[])');
    expect(GET_CURRENT_ITEM_BALANCES).toContain("c.status = 'vigente'");
    expect(GET_CURRENT_ITEM_BALANCES).toContain('ORDER BY c.id, s.seq, s.contrato_item_id');
  });
  it('does not query items for forbidden scope or historical data and surfaces SQL failures', async () => {
    const { repo, query } = fixture([assignment(1, '1')], [contract('1', '100')]);
    await expect(composeManagerSummary(1, { ...filters, contratoId: [2] }, repo, now))
      .rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(query).not.toHaveBeenCalledWith(GET_CURRENT_ITEM_BALANCES, expect.anything());
    const historical = await composeManagerSummary(1, { ...filters, dataReferencia: '2026-09-24' }, repo, now);
    expect(historical.data.itemBalances).toEqual({ coverage: 'UNAVAILABLE' });
    expect(historical.meta.dataCoverage.itemBalances).toBe('UNAVAILABLE');
    expect(historical.data.contractRiskMatrix).toBeNull();
    expect(historical.meta.dataCoverage.contractRiskMatrix).toBe('UNAVAILABLE');
    expect(query).not.toHaveBeenCalledWith(GET_CURRENT_ITEM_BALANCES, expect.anything());
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql, values) => {
      if (sql === GET_CURRENT_ITEM_BALANCES) throw new Error('private SQL detail');
      return original(sql, values);
    });
    await expect(composeManagerSummary(1, filters, repo, now)).rejects.toThrow('private SQL detail');
    const handler = createManagerHandler({ authProvider: { authenticate: async () =>
      ({ status: 'AUTHENTICATED', principal: { userId: 1 }, canAccessManagerView: true }) }, repository: repo, now });
    const response = await handler({ rawQueryString: '', requestContext: { requestId: 'test' } } as any, {} as any, () => {});
    expect(response).toMatchObject({ statusCode: 500 });
    expect((response as { body: string }).body).not.toContain('private SQL detail');
  });
  it('counts D0 and D+90 decisions and five independent registration gaps in the authorized portfolio', async () => {
    const ids = ['1', '2', '3', '4', '5', '6'];
    const { repo, query } = fixture(ids.map(id => assignment(1, id)), ids.map(id => contract(id, id === '3' ? null : '0')));
    const original = query.getMockImplementation()!;
    const rows = [
      { contract_id: '1', objeto: 'Objeto', valor_total: '0', data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-09-25', eligible_d90: true, intencao: 'prorrogar' },
      { contract_id: '2', objeto: '  ', valor_total: '0', data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-24', eligible_d90: true, intencao: 'nao_renovar' },
      { contract_id: '3', objeto: 'Objeto', valor_total: null, data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-10-01', eligible_d90: true, intencao: 'ciente' },
      { contract_id: '4', objeto: 'Objeto', valor_total: '0', data_assinatura: null, vigencia_inicio: '2026-01-01', vigencia_fim: '2026-09-24', eligible_d90: false, intencao: null },
      { contract_id: '5', objeto: 'Objeto', valor_total: '0', data_assinatura: '2026-01-01', vigencia_inicio: null, vigencia_fim: '2026-12-25', eligible_d90: false, intencao: null },
      { contract_id: '6', objeto: 'Objeto', valor_total: '0', data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: null, eligible_d90: null, intencao: null },
    ];
    query.mockImplementation(async (sql, values) => sql === GET_MANAGER_PREVENTIVE_QUALITY ? rows : original(sql, values));
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(query).toHaveBeenCalledWith(GET_MANAGER_PREVENTIVE_QUALITY, [[1, 2, 3, 4, 5, 6], '2026-09-25']);
    expect(result.data.preventiveQuality.renewalDecisionsD90).toEqual({ eligibleContracts: 3, decidedContracts: 2,
      extendContracts: 1, nonRenewalContracts: 1, undecidedContracts: 1, percentage: 2 / 3 * 100 });
    expect(result.data.preventiveQuality.registrationCompleteness).toEqual({ activeContracts: 6, completeContracts: 1,
      percentage: 1 / 6 * 100, missingByField: { objeto: 1, valor_total: 1, data_assinatura: 1,
        vigencia_inicio: 1, vigencia_fim: 1 } });
    expect(GET_MANAGER_PREVENTIVE_QUALITY).toContain('c.id = ANY($1::bigint[])');
    expect(GET_MANAGER_PREVENTIVE_QUALITY).toContain("c.status = 'vigente'");
    expect(GET_MANAGER_PREVENTIVE_QUALITY).toContain('i.vigencia_fim = c.vigencia_fim::date');
    expect(GET_MANAGER_PREVENTIVE_QUALITY).toContain('BETWEEN $2::date AND ($2::date + 90)');
    expect(GET_MANAGER_PREVENTIVE_QUALITY).not.toContain('expires_within_120_days');
  });
  it('does not count an intention for the previous validity date and keeps zero denominators available', async () => {
    const { repo, query } = fixture([assignment(1, '1')], [contract('1', '0', 'vigente', '2026-10-01')]);
    const original = query.getMockImplementation()!;
    const qualityRow = { contract_id: '1',
      objeto: 'Objeto', valor_total: '0', data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01',
      vigencia_fim: '2026-10-01', eligible_d90: true, intencao: null };
    // A intenção registrada para a vigência anterior não aparece no LEFT JOIN pela vigência atual.
    query.mockImplementation(async (sql, values) => sql === GET_MANAGER_PREVENTIVE_QUALITY ? [qualityRow] : original(sql, values));
    const result = await composeManagerSummary(1, filters, repo, now);
    expect(result.data.preventiveQuality.renewalDecisionsD90).toMatchObject({ eligibleContracts: 1,
      decidedContracts: 0, undecidedContracts: 1, percentage: 0 });
    expect(result.data.preventiveQuality.registrationCompleteness).toMatchObject({ completeContracts: 1, percentage: 100 });
    query.mockImplementation(async (sql, values) => sql === GET_MANAGER_PREVENTIVE_QUALITY
      ? [{ ...qualityRow, vigencia_fim: '2027-01-01', eligible_d90: false }] : original(sql, values));
    const withoutEligible = await composeManagerSummary(1, filters, repo, now);
    expect(withoutEligible.data.preventiveQuality.renewalDecisionsD90).toMatchObject({ eligibleContracts: 0, percentage: null });
    const past = await composeManagerSummary(1, { ...filters, dataReferencia: '2026-09-24' }, repo, now);
    expect(past.data.preventiveQuality).toEqual({ renewalDecisionsD90: null, registrationCompleteness: null });
    expect(past.meta.dataCoverage).toMatchObject({ renewalDecisionsD90: 'UNAVAILABLE', registrationCompleteness: 'UNAVAILABLE' });
  });
  it('sanitizes a preventive-quality SQL failure rather than returning zero', async () => {
    const { repo, query } = fixture([assignment(1, '1')], [contract('1', '100')]);
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql, values) => {
      if (sql === GET_MANAGER_PREVENTIVE_QUALITY) throw new Error('private SQL detail');
      return original(sql, values);
    });
    const handler = createManagerHandler({ authProvider: { authenticate: async () =>
      ({ status: 'AUTHENTICATED', principal: { userId: 1 }, canAccessManagerView: true }) }, repository: repo, now });
    const response = await handler({ rawQueryString: '', requestContext: { requestId: 'test' } } as any, {} as any, () => {});
    expect(response).toMatchObject({ statusCode: 500 });
    expect((response as { body: string }).body).not.toContain('private SQL detail');
  });
  it('validates physical preventive rows and avoids SQL for an empty authorized scope', async () => {
    const query = vi.fn().mockResolvedValue([{ contract_id: '9007199254740992', objeto: 'Objeto',
      valor_total: '0', data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01',
      vigencia_fim: '2026-10-01', eligible_d90: true, intencao: null }]);
    const repo = new PostgresManagerRepository({ query } as DbReader);
    await expect(repo.preventiveQuality([], filters.dataReferencia)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
    await expect(repo.preventiveQuality([1], filters.dataReferencia)).rejects.toThrow();
    query.mockResolvedValue([{ contract_id: '1', objeto: 'Objeto', valor_total: 'invalid',
      data_assinatura: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-10-01',
      eligible_d90: true, intencao: null }]);
    await expect(repo.preventiveQuality([1], filters.dataReferencia)).rejects.toThrow('Invalid preventive quality row');
  });
});
