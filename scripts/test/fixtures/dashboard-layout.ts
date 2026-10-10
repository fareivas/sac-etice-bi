// VIS-003: synthetic HTTP responses confined to browser interception; no production imports.
import {
  managerDashboardSummaryResponseSchema,
  managerFiscalLoadResponseSchema,
  managerSuppliersResponseSchema,
} from '../../../packages/contracts/src';
import { manager as emptyManager, fiscal, responseForRequest } from './dashboard-fidelity';

const data = structuredClone(emptyManager);
data.data.cards = {
  activeContracts: 2,
  activePortfolioValue: 2000,
  expiringContracts: 1,
  renewalsWithin120Days: 1,
};
data.data.contracts = [
  {
    contractId: 2,
    contractNumber: '13/2025',
    supplierName: 'Fornecedor A',
    value: 1000,
    expiryDate: '2026-10-10',
  },
  {
    contractId: 184,
    contractNumber: '20/2022',
    supplierName: 'Fornecedor B com nome extenso para validar quebra de linha sem perda de informação',
    value: 1000,
    expiryDate: '2027-10-08',
  },
];
data.data.expiringContractList = [data.data.contracts[0]];
data.data.contractRiskMatrix = data.data.contracts.map((contract, index) => ({
  contractId: contract.contractId,
  contractNumber: contract.contractNumber,
  supplierName: contract.supplierName,
  saldo: { status: 'CRITICAL', partialCoverage: true, reason: null },
  vigencia: index === 0 ? 'CRITICAL' : 'OK',
  sla: 'UNAVAILABLE',
  medicao: 'UNAVAILABLE',
  pagamento: 'UNAVAILABLE',
  indice: 'UNAVAILABLE',
}));
data.data.preventiveQuality = {
  registrationCompleteness: {
    activeContracts: 2,
    completeContracts: 1,
    percentage: 50,
    missingByField: { objeto: 1, valor_total: 0, data_assinatura: 0, vigencia_inicio: 0, vigencia_fim: 0 },
  },
  renewalDecisionsD90: {
    eligibleContracts: 1,
    decidedContracts: 0,
    extendContracts: 0,
    nonRenewalContracts: 0,
    undecidedContracts: 1,
    percentage: 0,
  },
};
export const manager = managerDashboardSummaryResponseSchema.parse(data);
const meta = {
  generatedAt: manager.meta.generatedAt,
  dataReference: manager.meta.dataReference,
  timezone: manager.meta.timezone,
  source: 'SAC',
  merCoverage: 'PROPOSTA',
};
export const load = managerFiscalLoadResponseSchema.parse({
  meta: {
    ...meta,
    dataCoverage: {
      inspectors: 'AVAILABLE',
      activeContracts: 'AVAILABLE',
      pendingOrders: 'AVAILABLE',
      capacity: 'UNAVAILABLE',
      weightedLoad: 'UNAVAILABLE',
      criticality: 'UNAVAILABLE',
      ranking: 'UNAVAILABLE',
      overdueActions: 'UNAVAILABLE',
    },
  },
  data: {
    inspectors: [
      {
        userId: 7,
        name: 'Fiscal A',
        activeContracts: 1,
        pendingOrders: 2,
        capacity: null,
        weightedLoad: null,
        criticality: null,
        ranking: null,
        overdueActions: null,
      },
      {
        userId: 8,
        name: 'Fiscal B',
        activeContracts: 1,
        pendingOrders: 0,
        capacity: null,
        weightedLoad: null,
        criticality: null,
        ranking: null,
        overdueActions: null,
      },
    ],
  },
});
export const suppliers = managerSuppliersResponseSchema.parse({
  meta: {
    ...meta,
    pagination: { page: 1, pageSize: 25, totalItems: 2 },
    dataCoverage: {
      suppliers: 'AVAILABLE',
      vigentValue: 'AVAILABLE',
      abcClass: 'UNAVAILABLE',
      openFinancialAmount: 'UNAVAILABLE',
      openCriticalRisks: 'UNAVAILABLE',
    },
  },
  data: {
    suppliers: manager.data.contracts!.map((contract, index) => ({
      supplierId: index + 1,
      name: contract.supplierName,
      vigentValue: contract.value,
      abcClass: null,
      openFinancialAmount: null,
      openCriticalRisks: null,
    })),
  },
});
export { fiscal, responseForRequest };
