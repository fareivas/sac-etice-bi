// GC-033: synthetic HTTP fixtures used only by intercepted browser tests.
import { managerDashboardSummaryResponseSchema } from '../../../packages/contracts/src';
import { manager as base, fiscal, load, suppliers, responseForRequest } from './dashboard-layout';
const data = structuredClone(base);
data.data.contractAlerts = [
  { alertId: 31, contractId: 184, contractNumber: '20/2022', type: 'vigencia', status: 'aberta',
    description: 'Vigência próxima', createdAt: '2026-09-22T12:00:00-03:00', expiryDate: '2027-10-08' },
  { alertId: 22, contractId: 2, contractNumber: '13/2025', type: 'designacao_ausente', status: 'em_tratamento',
    description: 'Conferir registro do fiscal Árvore', createdAt: '2026-09-20T12:00:00-03:00', expiryDate: '2026-10-10' },
  { alertId: 21, contractId: 2, contractNumber: '13/2025', type: 'vigencia', status: 'aberta',
    description: 'Revisar vigência', createdAt: null, expiryDate: '2026-10-10' },
];
export const manager = managerDashboardSummaryResponseSchema.parse(data);
export { fiscal, load, suppliers, responseForRequest };
