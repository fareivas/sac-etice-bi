import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { dateInTimezone } from '../fiscal/schemas';

export interface ManagerFilters { dataReferencia: string; timezone: string; contratoId: number[] }
export class ManagerQueryValidationError extends Error {
  constructor(readonly field: string) { super('Filtros inválidos.'); }
}
function invalid(field: string): never { throw new ManagerQueryValidationError(field); }
export function parseManagerQuery(event: Pick<APIGatewayProxyEventV2, 'rawQueryString'>, now: Date): ManagerFilters {
  const params = new URLSearchParams(event.rawQueryString);
  for (const key of params.keys()) if (!['dataReferencia', 'timezone', 'contratoId'].includes(key)) invalid(key);
  const single = (key: string) => { const values = params.getAll(key); if (values.length > 1) invalid(key); return values[0]; };
  const timezone = single('timezone') ?? 'America/Fortaleza';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { invalid('timezone'); }
  const today = dateInTimezone(now, timezone);
  const dataReferencia = single('dataReferencia') ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia) || Number.isNaN(Date.parse(`${dataReferencia}T00:00:00Z`)) ||
      new Date(`${dataReferencia}T00:00:00Z`).toISOString().slice(0, 10) !== dataReferencia || dataReferencia > today) invalid('dataReferencia');
  const contratoId = [...new Set(params.getAll('contratoId').map((raw) => {
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) invalid('contratoId');
    return Number(raw);
  }))];
  return { dataReferencia, timezone, contratoId };
}
