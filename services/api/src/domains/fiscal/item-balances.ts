import type { FiscalItemBalance, FiscalItemBalances } from '@sac-etice-bi/contracts';

export interface BalanceCriteria {
  base: 'comprometido' | 'medido';
  dimensao: 'valor' | 'quantidade';
  limiar_atencao: number;
  limiar_critico: number;
}

export function balanceCriteria(env: NodeJS.ProcessEnv): BalanceCriteria {
  const base = env.SALDO_FAIXA_BASE ?? 'comprometido';
  const dimensao = env.SALDO_FAIXA_DIMENSAO ?? 'valor';
  const limiar_atencao = Number(env.SALDO_LIMIAR_ATENCAO ?? '0.60');
  const limiar_critico = Number(env.SALDO_LIMIAR_CRITICO ?? '0.10');
  if ((base !== 'comprometido' && base !== 'medido') ||
      (dimensao !== 'valor' && dimensao !== 'quantidade') ||
      !Number.isFinite(limiar_atencao) || !Number.isFinite(limiar_critico) ||
      !(0 <= limiar_critico && limiar_critico < limiar_atencao && limiar_atencao <= 1)) {
    throw new Error('Invalid item balance criteria');
  }
  return { base, dimensao, limiar_atencao, limiar_critico };
}

// PostgreSQL numeric is carried as text. BigInt comparisons avoid rounding a
// ratio before the boundary decision, including values close to a threshold.
type Decimal = { value: bigint; scale: bigint };

function decimal(raw: string | null): Decimal | null {
  if (raw === null) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match) throw new Error('Invalid database decimal');
  const fraction = match[3] ?? '';
  const decimalPlaces = fraction.length - Number(match[4] ?? '0');
  if (!Number.isSafeInteger(decimalPlaces) || Math.abs(decimalPlaces) > 1000) throw new RangeError('Unsupported decimal scale');
  const signedDigits = BigInt(`${match[1]}${match[2]}${fraction}`);
  return decimalPlaces <= 0
    ? { value: signedDigits * 10n ** BigInt(-decimalPlaces), scale: 1n }
    : { value: signedDigits, scale: 10n ** BigInt(decimalPlaces) };
}

function subtract(total: string | null, measured: string | null): Decimal | null {
  const a = decimal(total);
  if (!a) return null;
  const b = decimal(measured ?? '0')!;
  const scale = a.scale > b.scale ? a.scale : b.scale;
  return { value: a.value * (scale / a.scale) - b.value * (scale / b.scale), scale };
}

function decimalText(number: Decimal | null): string | null {
  if (!number) return null;
  const digits = number.scale.toString().length - 1;
  const abs = number.value < 0n ? -number.value : number.value;
  const fraction = digits ? `.${(abs % number.scale).toString().padStart(digits, '0')}` : '';
  return `${number.value < 0n ? '-' : ''}${abs / number.scale}${fraction}`;
}

function add(a: Decimal, b: Decimal): Decimal {
  const scale = a.scale > b.scale ? a.scale : b.scale;
  return { value: a.value * (scale / a.scale) + b.value * (scale / b.scale), scale };
}

/** Monetary API numbers use cents, rounded half away from zero once at output. */
function moneyNumber(number: Decimal): number {
  const numerator = number.value * 100n;
  const abs = numerator < 0n ? -numerator : numerator;
  const cents = (abs + number.scale / 2n) / number.scale;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Money exceeds safe cent precision');
  const result = Number(numerator < 0n ? -cents : cents) / 100;
  if (!Number.isFinite(result) || Math.round(result * 100) !== Number(numerator < 0n ? -cents : cents) ||
      Number(cents + 1n) / 100 === Number(cents) / 100 ||
      (cents > 0n && Number(cents - 1n) / 100 === Number(cents) / 100)) {
    throw new RangeError('Money exceeds safe cent precision');
  }
  return result;
}

function quantityNumber(number: Decimal | null): number | null {
  if (!number) return null;
  const value = Number(decimalText(number));
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new RangeError('Quantity exceeds safe number precision');
  return value;
}

export function classifyBalance(balance: string | null, contracted: string | null, criteria: BalanceCriteria): FiscalItemBalance['faixa'] {
  const a = decimal(balance);
  const b = decimal(contracted);
  if (!a || !b || b.value <= 0n) return 'nao_verificavel';
  const threshold = (value: number) => decimal(String(value))!;
  const compare = (value: number) => {
    const t = threshold(value);
    const left = a.value * b.scale * t.scale;
    const right = t.value * a.scale * b.value;
    return left < right ? -1 : left > right ? 1 : 0;
  };
  if (compare(criteria.limiar_critico) <= 0) return 'critico';
  if (compare(criteria.limiar_atencao) >= 0) return 'adequado';
  return 'atencao';
}

export type RawBalanceItem = Omit<FiscalItemBalance, 'pctSaldo' | 'pctSaldoMedido' | 'faixa' | 'valueMeasuredBalance' | 'quantityMeasuredBalance'> & {
  raw: { valueContracted: string | null; valueBalance: string | null; valueMeasured: string | null;
    quantityContracted: string | null; quantityBalance: string | null; quantityMeasured: string | null };
};

export function composeItemBalances(rows: readonly RawBalanceItem[], criterio: BalanceCriteria): Extract<FiscalItemBalances, {coverage: 'AVAILABLE'}> {
  const resumo = { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 };
  const ratio = (balance: string | null, contracted: string | null) => {
    const a = decimal(balance), b = decimal(contracted);
    if (!a || !b || b.value <= 0n) return null;
    return Math.round(Number(a.value * b.scale) / Number(b.value * a.scale) * 10000) / 10000;
  };
  const itens = rows.map(({ raw, ...row }) => {
    const contracted = criterio.dimensao === 'valor' ? raw.valueContracted : raw.quantityContracted;
    const committed = criterio.dimensao === 'valor' ? raw.valueBalance : raw.quantityBalance;
    const valueMeasuredBalance = subtract(raw.valueContracted, raw.valueMeasured);
    const quantityMeasuredBalance = subtract(raw.quantityContracted, raw.quantityMeasured);
    const measured = criterio.dimensao === 'valor' ? valueMeasuredBalance : quantityMeasuredBalance;
    const measuredText = decimalText(measured);
    const faixa = classifyBalance(criterio.base === 'comprometido' ? committed : measuredText, contracted, criterio);
    resumo[faixa]++;
    return { ...row, valueMeasuredBalance: valueMeasuredBalance === null ? null : moneyNumber(valueMeasuredBalance),
      quantityMeasuredBalance: quantityNumber(quantityMeasuredBalance),
      pctSaldo: ratio(committed, contracted), pctSaldoMedido: ratio(measuredText, contracted), faixa };
  });
  const aggregate = (values: (Decimal | null)[]) => values.every(value => value !== null)
    ? moneyNumber(values.reduce<Decimal>((total, value) => add(total, value!), { value: 0n, scale: 1n })) : null;
  const contractedValueRows = rows.filter(row => row.raw.valueContracted !== null).length;
  const committedBalanceRows = rows.filter(row => row.raw.valueBalance !== null).length;
  const measuredBalanceRows = rows.filter(row => row.raw.valueContracted !== null).length;
  return { coverage: 'AVAILABLE', criterio, resumo,
    agregados: { totalContratado: aggregate(rows.map(row => decimal(row.raw.valueContracted))),
      saldoComprometido: aggregate(rows.map(row => decimal(row.raw.valueBalance))),
      saldoMedido: aggregate(rows.map(row => subtract(row.raw.valueContracted, row.raw.valueMeasured))),
      itemCount: rows.length, contractedValueRows, committedBalanceRows, measuredBalanceRows,
      completeValueRows: rows.filter(row => row.raw.valueContracted !== null && row.raw.valueBalance !== null).length },
    itens };
}
