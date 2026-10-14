// GC-034: synthetic responses confined to browser interception.
import { managerDashboardSummaryResponseSchema, managerFiscalLoadResponseSchema } from '../../../packages/contracts/src';
import { manager as base, load as baseLoad, fiscal, suppliers, responseForRequest } from './manager-contract-alerts';
const data = structuredClone(base);
const second = data.data.contracts?.find(contract => contract.contractId === 184);
if (second) second.expiryDate = '2027-02-22';
const secondAlert = data.data.contractAlerts?.find(alert => alert.contractId === 184);
if (secondAlert) secondAlert.expiryDate = '2027-02-22';
export const manager = managerDashboardSummaryResponseSchema.parse(data);
const fiscalLoad = structuredClone(baseLoad);
if (fiscalLoad.data.inspectors) {
  fiscalLoad.data.inspectors[0].contractIds = [2];
  fiscalLoad.data.inspectors[1].contractIds = [184];
}
export const load = managerFiscalLoadResponseSchema.parse(fiscalLoad);
export { fiscal, suppliers, responseForRequest };
