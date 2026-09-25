import { managerSuppliersResponseSchema, type ManagerSuppliersResponse } from '@sac-etice-bi/contracts';
import { dateInTimezone } from '../fiscal/schemas';
import type { PostgresManagerRepository } from './repository';
import type { SupplierFilters } from './fornecedores-schemas';

function sumMoney(values: string[]): number {
  const scale = Math.max(0, ...values.map((value) => (value.split('.')[1] ?? '').length));
  const total = values.reduce((sum, value) => {
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
    const units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
    return sum + (negative ? -units : units);
  }, 0n);
  const result = Number(total) / 10 ** scale;
  if (!Number.isFinite(result)) throw new RangeError('Unsafe supplier total');
  return result;
}

export async function composeManagerSuppliers(userId: number, filters: SupplierFilters,
  repository: Pick<PostgresManagerRepository, 'identity' | 'scope' | 'supplierContracts'>,
  now: () => Date = () => new Date()): Promise<ManagerSuppliersResponse> {
  const manager = await repository.identity(userId);
  if (manager.userId !== userId) throw new Error('Identity mismatch');
  const current = filters.dataReferencia === dateInTimezone(now(), filters.timezone);
  if (!current) return managerSuppliersResponseSchema.parse({
    meta: { generatedAt: now().toISOString(), dataReference: filters.dataReferencia, timezone: filters.timezone,
      source: 'SAC', merCoverage: 'PROPOSTA', pagination: { page: filters.page, pageSize: filters.pageSize, totalItems: null },
      dataCoverage: { suppliers: 'UNAVAILABLE', vigentValue: 'UNAVAILABLE', abcClass: 'UNAVAILABLE',
        openFinancialAmount: 'UNAVAILABLE', openCriticalRisks: 'UNAVAILABLE' } },
    data: { suppliers: null },
  });
  const rows = await repository.supplierContracts(await repository.scope(userId, []));
  const grouped = new Map<number, { supplierId: number; name: string; values: string[]; unknown: boolean }>();
  for (const row of rows) {
    let supplier = grouped.get(row.supplierId);
    if (!supplier) {
      supplier = { supplierId: row.supplierId, name: row.name, values: [], unknown: false };
      grouped.set(row.supplierId, supplier);
    }
    if (row.status === 'vigente') {
      if (row.value === null) supplier.unknown = true;
      else supplier.values.push(row.value);
    }
  }
  const all = [...grouped.values()].map((item) => ({ supplierId: item.supplierId, name: item.name,
    vigentValue: item.unknown ? null : sumMoney(item.values), abcClass: null, openFinancialAmount: null,
    openCriticalRisks: null }));
  const complete = all.every((item) => item.vigentValue !== null);
  const direction = filters.sort.endsWith(':desc') ? -1 : 1;
  all.sort((a, b) => {
    let order: number;
    if (filters.sort.startsWith('name:')) order = a.name.localeCompare(b.name, 'pt-BR');
    else order = a.vigentValue === null && b.vigentValue === null ? 0 : a.vigentValue === null ? 1 :
      b.vigentValue === null ? -1 : Math.sign(a.vigentValue - b.vigentValue) * direction;
    return (filters.sort.startsWith('name:') ? order * direction : order) || a.supplierId - b.supplierId;
  });
  const suppliers = all.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize);
  return managerSuppliersResponseSchema.parse({
    meta: { generatedAt: now().toISOString(), dataReference: filters.dataReferencia, timezone: filters.timezone,
      source: 'SAC', merCoverage: 'PROPOSTA', pagination: { page: filters.page, pageSize: filters.pageSize, totalItems: all.length },
      dataCoverage: { suppliers: 'AVAILABLE', vigentValue: complete ? 'AVAILABLE' : 'UNAVAILABLE',
        abcClass: 'UNAVAILABLE', openFinancialAmount: 'UNAVAILABLE', openCriticalRisks: 'UNAVAILABLE' } },
    data: { suppliers },
  });
}
