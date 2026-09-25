import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { parseManagerQuery, ManagerQueryValidationError } from './schemas';

export type SupplierSort = 'name:asc' | 'name:desc' | 'vigentValue:asc' | 'vigentValue:desc';
export interface SupplierFilters { dataReferencia: string; timezone: string; page: number; pageSize: number; sort: SupplierSort }
export function parseSupplierQuery(event: Pick<APIGatewayProxyEventV2, 'rawQueryString'>, now: Date): SupplierFilters {
  const params = new URLSearchParams(event.rawQueryString);
  const allowed = new Set(['dataReferencia', 'timezone', 'page', 'pageSize', 'sort']);
  for (const key of params.keys()) if (!allowed.has(key)) throw new ManagerQueryValidationError(key);
  const single = (key: string) => {
    const values = params.getAll(key);
    if (values.length > 1) throw new ManagerQueryValidationError(key);
    return values[0];
  };
  const base = new URLSearchParams();
  for (const key of ['dataReferencia', 'timezone']) {
    const value = single(key);
    if (value !== undefined) base.set(key, value);
  }
  const { dataReferencia, timezone } = parseManagerQuery({ rawQueryString: base.toString() }, now);
  const positive = (key: string, fallback: number, max?: number) => {
    const raw = single(key);
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(raw)) throw new ManagerQueryValidationError(key);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || (max !== undefined && value > max)) throw new ManagerQueryValidationError(key);
    return value;
  };
  const page = positive('page', 1);
  const pageSize = positive('pageSize', 25, 100);
  const sort = single('sort') ?? 'name:asc';
  if (!['name:asc', 'name:desc', 'vigentValue:asc', 'vigentValue:desc'].includes(sort))
    throw new ManagerQueryValidationError('sort');
  return { dataReferencia, timezone, page, pageSize, sort: sort as SupplierSort };
}
