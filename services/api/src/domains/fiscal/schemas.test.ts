import { describe, expect, it } from 'vitest';
import { FiscalQueryValidationError, parseFiscalDashboardQuery } from './schemas';

const NOW = new Date('2026-09-23T02:30:00.000Z');
const parse = (rawQueryString: string, now = NOW) =>
  parseFiscalDashboardQuery({ rawQueryString }, now);

function expectInvalid(query: string): void {
  try {
    parse(query);
    throw new Error(`A consulta deveria ser inválida: ${query}`);
  } catch (error) {
    expect(error).toBeInstanceOf(FiscalQueryValidationError);
    expect((error as FiscalQueryValidationError).code).toBe('INVALID_FILTER');
  }
}

describe('parseFiscalDashboardQuery', () => {
  it('aplica todos os defaults no timezone padrão', () => {
    expect(parse('')).toEqual({
      dataReferencia: '2026-09-22',
      timezone: 'America/Fortaleza',
      unidadeId: null,
      contratoId: [],
      includeExternal: true,
    });
  });

  it('aceita dataReferencia válida e rejeita formato/data inválidos ou data futura', () => {
    expect(parse('dataReferencia=2026-09-21').dataReferencia).toBe('2026-09-21');
    expect(parse('dataReferencia=2024-02-29').dataReferencia).toBe('2024-02-29');
    for (const value of ['2026-9-21', '2026-02-30', '21-09-2026', '2026-09-23']) {
      expectInvalid(`dataReferencia=${value}`);
    }
  });

  it('valida timezone IANA e calcula o default na data local efetiva', () => {
    expect(parse('timezone=Asia%2FTokyo')).toMatchObject({
      dataReferencia: '2026-09-23',
      timezone: 'Asia/Tokyo',
    });
    expectInvalid('timezone=Fuso%2FInexistente');
  });

  it('aceita unidadeId inteiro positivo e rejeita os demais', () => {
    expect(parse('unidadeId=4').unidadeId).toBe(4);
    for (const value of ['0', '-1', '1.5', 'abc', '']) {
      expectInvalid(`unidadeId=${value}`);
    }
  });

  it('aceita contratoId único ou repetido e remove duplicados', () => {
    expect(parse('contratoId=184').contratoId).toEqual([184]);
    expect(parse('contratoId=184&contratoId=205').contratoId).toEqual([184, 205]);
    expect(parse('contratoId=184&contratoId=205&contratoId=184').contratoId).toEqual([184, 205]);
  });

  it('rejeita lista por vírgulas e contratoId inválido', () => {
    for (const value of ['184,205', '0', '-1', '1.5', 'abc', '']) {
      expectInvalid(`contratoId=${value}`);
    }
  });

  it('aceita somente true e false para includeExternal', () => {
    expect(parse('includeExternal=true').includeExternal).toBe(true);
    expect(parse('includeExternal=false').includeExternal).toBe(false);
    for (const value of ['1', '0', 'yes', 'no', 'TRUE', '']) {
      expectInvalid(`includeExternal=${value}`);
    }
  });

  it('rejeita parâmetros desconhecidos e repetição dos parâmetros singulares', () => {
    expectInvalid('page=1');
    expectInvalid('timezone=America%2FFortaleza&timezone=America%2FFortaleza');
  });

  it('usa rawQueryString, sem interpretar a representação combinada do API Gateway', () => {
    const result = parseFiscalDashboardQuery({
      rawQueryString: 'contratoId=184&contratoId=205',
      queryStringParameters: { contratoId: '184,205' },
    } as Parameters<typeof parseFiscalDashboardQuery>[0], NOW);
    expect(result.contratoId).toEqual([184, 205]);
  });

  it('calcula a data padrão no timezone efetivo perto da mudança do dia UTC/local', () => {
    const beforeFortalezaMidnightUtc = new Date('2026-09-23T02:59:59.000Z');
    const afterFortalezaMidnightUtc = new Date('2026-09-23T03:00:00.000Z');
    expect(parseFiscalDashboardQuery({ rawQueryString: '' }, beforeFortalezaMidnightUtc).dataReferencia)
      .toBe('2026-09-22');
    expect(parseFiscalDashboardQuery({ rawQueryString: '' }, afterFortalezaMidnightUtc).dataReferencia)
      .toBe('2026-09-23');
    expect(parseFiscalDashboardQuery(
      { rawQueryString: 'timezone=Asia%2FTokyo' },
      new Date('2026-09-22T15:00:00.000Z'),
    ).dataReferencia).toBe('2026-09-23');
  });
});
