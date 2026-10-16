// Synthetic HTTP fixtures used only by the complementary browser roteiro.
import {
  managerDashboardSummaryResponseSchema,
  managerFiscalLoadResponseSchema,
  managerSuppliersResponseSchema,
} from '../../../packages/contracts/src';
import { composeItemBalances, type RawBalanceItem } from '../../../services/api/src/shared/item-balances';
import { manager, load, suppliers } from './manager-global-filters';

const criterion = { base: 'comprometido' as const, dimensao: 'valor' as const,
  limiar_atencao: .6, limiar_critico: .1 };
const raw = (measured: number | null, consumed: number): RawBalanceItem => ({
  itemId: 99001, contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor A',
  sequence: 1, specification: 'Item sintético de validação visual', unit: 'h',
  valueContracted: 1000, valueConsumed: consumed, valueMeasured: measured, valueBalance: 1000 - consumed,
  quantityContracted: 10, quantityConsumed: consumed / 100, quantityMeasured: measured === null ? null : measured / 100,
  quantityBalance: 10 - consumed / 100, statusVerificacao: 'verificado', blockedAt: null, blockReason: null,
  raw: { valueContracted: '1000', valueBalance: String(1000 - consumed), valueMeasured: measured === null ? null : String(measured),
    quantityContracted: '10', quantityBalance: String(10 - consumed / 100),
    quantityMeasured: measured === null ? null : String(measured / 100) },
});
function withItems(rows: RawBalanceItem[], base: 'comprometido' | 'medido' = 'comprometido') {
  const response = structuredClone(manager);
  response.data.itemBalances = composeItemBalances(rows, { ...criterion, base });
  return managerDashboardSummaryResponseSchema.parse(response);
}
export const noItems = withItems([]);
const zero = raw(0, 0);
zero.valueContracted = 0; zero.valueBalance = 0;
zero.quantityContracted = 0; zero.quantityBalance = 0;
zero.raw = { ...zero.raw, valueContracted: '0', valueBalance: '0', quantityContracted: '0', quantityBalance: '0' };
export const zeroItem = withItems([zero]);
export const measuredMissing = withItems([raw(null, 200)], 'medido');
export const localItems = withItems([raw(350, 200)]);
export const outsideLoad = managerFiscalLoadResponseSchema.parse({ ...load,
  data: { inspectors: load.data.inspectors?.filter(inspector => inspector.contractIds?.includes(184)) ?? [] } });
export const emptyLoad = managerFiscalLoadResponseSchema.parse({ ...load, data: { inspectors: [] } });
export const unavailableLoad = managerFiscalLoadResponseSchema.parse({ ...load,
  meta: { ...load.meta, dataCoverage: { ...load.meta.dataCoverage,
    inspectors: 'UNAVAILABLE', activeContracts: 'UNAVAILABLE', pendingOrders: 'UNAVAILABLE' } },
  data: { inspectors: null } });
export const dateLoad = managerFiscalLoadResponseSchema.parse({ ...load,
  meta: { ...load.meta, dataReference: '2026-09-26' } });
export const timezoneLoad = managerFiscalLoadResponseSchema.parse({ ...load,
  meta: { ...load.meta, timezone: 'UTC' } });
export const badSuppliers = managerSuppliersResponseSchema.parse({ ...suppliers,
  meta: { ...suppliers.meta, dataReference: '2026-09-26' } });
export const goodSuppliers = managerSuppliersResponseSchema.parse(suppliers);
export { manager, load };
