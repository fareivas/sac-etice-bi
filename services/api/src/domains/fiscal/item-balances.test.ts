import { describe, expect, it } from 'vitest';
import { balanceCriteria, classifyBalance, composeItemBalances, type RawBalanceItem } from './item-balances';

const criterion = balanceCriteria({});
const classify = (balance: string | null, contracted: string | null) => classifyBalance(balance, contracted, criterion);
const row = (balance: string | null, contracted: string | null = '100'): RawBalanceItem => ({
  contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor', itemId: 10,
  sequence: 1, specification: 'Serviço', unit: 'un', quantityContracted: 100,
  quantityConsumed: 0, quantityMeasured: 0, quantityBalance: 100,
  valueContracted: contracted === null ? null : Number(contracted), valueConsumed: 0,
  valueMeasured: 0, valueBalance: balance === null ? null : Number(balance),
  statusVerificacao: 'divergente', blockedAt: null, blockReason: null,
  raw: { valueContracted: contracted, valueBalance: balance, valueMeasured: '0',
    quantityContracted: '100', quantityBalance: '100', quantityMeasured: '0' },
});

describe('item balances', () => {
  it('classifies exact boundaries and values just across them without rounded percentages', () => {
    expect(classify('60', '100')).toBe('adequado');
    expect(classify('59.999', '100')).toBe('atencao');
    expect(classify('10.001', '100')).toBe('atencao');
    expect(classify('10', '100')).toBe('critico');
    expect(classify('0', '100')).toBe('critico');
    expect(classify('-1', '100')).toBe('critico');
  });
  it.each([null, '0', '-1'])('cannot verify invalid contracted value %s', contracted => {
    expect(classify('10', contracted)).toBe('nao_verificavel');
  });
  it('cannot verify a null balance', () => expect(classify(null, '100')).toBe('nao_verificavel'));
  it('validates configurable criteria', () => {
    expect(classifyBalance('30', '100', balanceCriteria({ SALDO_LIMIAR_ATENCAO: '0.3', SALDO_LIMIAR_CRITICO: '0.2' }))).toBe('adequado');
    expect(() => balanceCriteria({ SALDO_LIMIAR_ATENCAO: '0.1', SALDO_LIMIAR_CRITICO: '0.1' })).toThrow();
    expect(() => balanceCriteria({ SALDO_FAIXA_BASE: 'other' })).toThrow();
    expect(classifyBalance('0.0000001', '1', balanceCriteria({ SALDO_LIMIAR_ATENCAO: '0.0000001', SALDO_LIMIAR_CRITICO: '0' }))).toBe('adequado');
  });
  it('keeps measured and committed percentages independent and preserves incomplete aggregates', () => {
    const a = { ...row('10'), raw: { ...row('10').raw, valueMeasured: '70' }, valueMeasured: 70 };
    const result = composeItemBalances([a, row(null)], criterion);
    expect(result.resumo).toEqual({ adequado: 0, atencao: 0, critico: 1, nao_verificavel: 1 });
    expect(result.itens[0]).toMatchObject({ pctSaldo: 0.1, pctSaldoMedido: 0.3, valueMeasuredBalance: 30, faixa: 'critico', statusVerificacao: 'divergente' });
    expect(result.agregados).toMatchObject({ itemCount: 2, completeValueRows: 1, contractedValueRows: 2,
      committedBalanceRows: 1, measuredBalanceRows: 2, totalContratado: 200, saldoComprometido: null, saldoMedido: 130 });
    expect(composeItemBalances([a], { ...criterion, base: 'medido' }).itens[0].faixa).toBe('atencao');
    expect(composeItemBalances([a], { ...criterion, dimensao: 'quantidade' }).itens[0].faixa).toBe('adequado');
  });
  it('represents a valid empty portfolio as an empty list with zero counts', () => {
    expect(composeItemBalances([], criterion)).toMatchObject({ coverage: 'AVAILABLE', resumo: { critico: 0 },
      agregados: { itemCount: 0, totalContratado: 0, saldoComprometido: 0, saldoMedido: 0,
        contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 }, itens: [] });
  });

  it('sums original monetary decimals and rounds once, half away from zero, at the API boundary', () => {
    const rows = [row('0.005', '0.105'), row('0.005', '0.105'), row('0.005', '0.105')];
    expect(composeItemBalances(rows, criterion).agregados).toMatchObject({
      totalContratado: 0.32, saldoComprometido: 0.02, saldoMedido: 0.32,
      contractedValueRows: 3, committedBalanceRows: 3, measuredBalanceRows: 3,
    });
    expect(composeItemBalances([row('-0.005', '1')], criterion).agregados.saldoComprometido).toBe(-0.01);
  });

  it('rejects an aggregate that cannot be represented with safe cent precision', () => {
    expect(() => composeItemBalances([row('90071992547409.92', '1')], criterion)).toThrow(/safe cent precision/);
    expect(composeItemBalances([row('1000000000000.99', '1')], criterion).agregados.saldoComprometido).toBe(1000000000000.99);
  });

  it('tracks each aggregate independently when contracted or committed values are missing', () => {
    expect(composeItemBalances([row('8', null)], criterion).agregados).toMatchObject({
      totalContratado: null, saldoComprometido: 8, saldoMedido: null,
      contractedValueRows: 0, committedBalanceRows: 1, measuredBalanceRows: 0,
    });
    const rows = [row('8', null), row(null, '100')];
    const result = composeItemBalances(rows, criterion);
    expect(result.agregados).toMatchObject({ totalContratado: null, saldoComprometido: null, saldoMedido: null,
      contractedValueRows: 1, committedBalanceRows: 1, measuredBalanceRows: 1 });
    expect(result.itens[0].valueMeasuredBalance).toBeNull();
    expect(result.itens[1].valueMeasuredBalance).toBe(100);
  });

  it('treats null measured as zero but preserves negative measured balances and dimensions', () => {
    const first = row('10');
    first.raw.valueMeasured = null;
    first.valueMeasured = null;
    expect(composeItemBalances([first], { ...criterion, base: 'medido' }).itens[0])
      .toMatchObject({ valueMeasuredBalance: 100, pctSaldoMedido: 1, faixa: 'adequado' });
    expect(composeItemBalances([first], criterion).agregados.saldoMedido).toBe(100);
    const second = row('10');
    second.raw.valueMeasured = '120';
    second.valueMeasured = 120;
    second.raw.quantityMeasured = '110';
    expect(composeItemBalances([second], { ...criterion, base: 'medido' }).itens[0])
      .toMatchObject({ valueMeasuredBalance: -20, faixa: 'critico' });
    expect(composeItemBalances([second], { ...criterion, base: 'medido', dimensao: 'quantidade' }).itens[0])
      .toMatchObject({ quantityMeasuredBalance: -10, faixa: 'critico' });
  });
  it('counts measured balance coverage by calculability with missing measurement and missing contracted value', () => {
    const observedZero = row('100');
    const missingMeasurement = row('100');
    missingMeasurement.raw.valueMeasured = null;
    missingMeasurement.valueMeasured = null;
    missingMeasurement.raw.quantityMeasured = null;
    missingMeasurement.quantityMeasured = null;
    const missingContracted = row(null, null);
    const result = composeItemBalances([observedZero, missingMeasurement, missingContracted], criterion);
    expect(result.itens.map(item => item.valueMeasuredBalance)).toEqual([100, 100, null]);
    expect(result.itens.map(item => item.valueMeasured)).toEqual([0, null, 0]);
    expect(result.agregados).toMatchObject({ itemCount: 3, measuredBalanceRows: 2, saldoMedido: null });
    const available = composeItemBalances([observedZero, missingMeasurement], criterion);
    expect(available.agregados).toMatchObject({ measuredBalanceRows: 2, saldoMedido: 200 });
  });
});
