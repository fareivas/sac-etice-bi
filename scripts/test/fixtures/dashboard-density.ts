// Isolated VIS-004 responses, never imported by the production application.
import { managerFiscalLoadResponseSchema } from '../../../packages/contracts/src';
import { load } from './dashboard-layout';
export { fiscal, manager, suppliers, responseForRequest } from './dashboard-layout';
const observed = (userId: number, name: string | null, activeContracts: number, pendingOrders: number) => ({
  userId,
  name,
  activeContracts,
  pendingOrders,
  capacity: null,
  weightedLoad: null,
  criticality: null,
  ranking: null,
  overdueActions: null,
});
const available = (inspectors: ReturnType<typeof observed>[]) =>
  managerFiscalLoadResponseSchema.parse({ ...structuredClone(load), data: { inspectors } });
const unavailable = structuredClone(load);
unavailable.data.inspectors = null;
unavailable.meta.dataCoverage.inspectors = 'UNAVAILABLE';
unavailable.meta.dataCoverage.activeContracts = 'UNAVAILABLE';
unavailable.meta.dataCoverage.pendingOrders = 'UNAVAILABLE';
export const loads = {
  multiple: available([
    observed(9, 'Fiscal A', 4, 1),
    observed(7, 'Fiscal B', 2, 6),
    observed(8, null, 0, 0),
  ]),
  zero: available([observed(1, 'Fiscal com zero apurado', 0, 0)]),
  many: available(
    Array.from({ length: 30 }, (_, index) =>
      observed(
        index + 1,
        index === 0 ? 'WWWWWWWWWWWWWWWWWWWW — Nome integral preservado na tabela' : `Fiscal ${index + 1}`,
        index % 5,
        index % 7
      )
    )
  ),
  empty: available([]),
  unavailable: managerFiscalLoadResponseSchema.parse(unavailable),
};
