import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const DEFAULT_TIMEZONE = 'America/Fortaleza';
const ALLOWED_PARAMETERS = new Set([
  'dataReferencia',
  'timezone',
  'unidadeId',
  'contratoId',
  'includeExternal',
]);

export interface FiscalDashboardFilters {
  dataReferencia: string;
  timezone: string;
  unidadeId: number | null;
  contratoId: number[];
  includeExternal: boolean;
}

export interface FiscalQueryValidationDetail {
  field: string;
  reason: string;
  value?: string;
}

export class FiscalQueryValidationError extends Error {
  readonly code = 'INVALID_FILTER' as const;

  constructor(readonly details: FiscalQueryValidationDetail[]) {
    super('Filtros inválidos.');
    this.name = 'FiscalQueryValidationError';
  }
}

function invalid(field: string, reason: string, value?: string): never {
  throw new FiscalQueryValidationError([{ field, reason, ...(value === undefined ? {} : { value }) }]);
}

function singleValue(params: URLSearchParams, field: string): string | undefined {
  const values = params.getAll(field);
  if (values.length > 1) invalid(field, 'Parâmetro não repetível.');
  return values[0];
}

function positiveInteger(value: string, field: string): number {
  if (!/^\d+$/.test(value)) invalid(field, 'Deve ser inteiro positivo.', value);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    invalid(field, 'Deve ser inteiro positivo.', value);
  }
  return number;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

function dateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** HTTP API v2 preserva parâmetros repetidos em rawQueryString. */
export function parseFiscalDashboardQuery(
  event: Pick<APIGatewayProxyEventV2, 'rawQueryString'>,
  now: Date = new Date(),
): FiscalDashboardFilters {
  const params = new URLSearchParams(event.rawQueryString);
  for (const field of params.keys()) {
    if (!ALLOWED_PARAMETERS.has(field)) invalid(field, 'Parâmetro desconhecido.');
  }

  const timezone = singleValue(params, 'timezone') ?? DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    invalid('timezone', 'Fuso IANA inválido.', timezone);
  }

  const today = dateInTimezone(now, timezone);
  const requestedDate = singleValue(params, 'dataReferencia');
  const dataReferencia = requestedDate ?? today;
  if (!validCalendarDate(dataReferencia)) {
    invalid('dataReferencia', 'Data inválida; use YYYY-MM-DD.', dataReferencia);
  }
  if (dataReferencia > today) {
    invalid('dataReferencia', 'Data futura não permitida.', dataReferencia);
  }

  const unidadeValue = singleValue(params, 'unidadeId');
  const unidadeId = unidadeValue === undefined ? null : positiveInteger(unidadeValue, 'unidadeId');

  const contratoId = [...new Set(params.getAll('contratoId').map(
    (value) => positiveInteger(value, 'contratoId'),
  ))];

  const externalValue = singleValue(params, 'includeExternal');
  if (externalValue !== undefined && externalValue !== 'true' && externalValue !== 'false') {
    invalid('includeExternal', 'Use true ou false.', externalValue);
  }

  return {
    dataReferencia,
    timezone,
    unidadeId,
    contratoId,
    includeExternal: externalValue === undefined || externalValue === 'true',
  };
}
