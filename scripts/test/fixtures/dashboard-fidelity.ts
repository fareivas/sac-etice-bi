import type { ManagerDashboardSummaryResponse } from '../../../packages/contracts/src';
import { managerDashboardSummaryResponseSchema } from '../../../packages/contracts/src';
import { fixture as fiscal } from './fiscal-band-distribution';
const base: ManagerDashboardSummaryResponse = {
  meta: { generatedAt: '2026-09-25T15:00:00Z', dataReference: '2026-09-25', timezone: 'America/Fortaleza',
    source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: [] },
    dataCoverage: { portfolio: 'AVAILABLE', activeContracts: 'AVAILABLE', activePortfolioValue: 'AVAILABLE',
      expiringContracts: 'AVAILABLE', renewalsWithin120Days: 'AVAILABLE', contractAlerts: 'AVAILABLE', contractBalances: 'AVAILABLE', itemBalances: 'AVAILABLE', renewalDecisionsD90: 'AVAILABLE', registrationCompleteness: 'AVAILABLE', contractRiskMatrix: 'AVAILABLE' } },
  data: { manager: { userId: 1, name: 'Gestora' },
    cards: { activeContracts: 0, activePortfolioValue: 0, expiringContracts: 0, renewalsWithin120Days: 0 },
    contracts: [], expiringContractList: [], contractAlerts: [], contractBalances: [], contractRiskMatrix: [],
    preventiveQuality: { renewalDecisionsD90: { eligibleContracts: 0, decidedContracts: 0, extendContracts: 0,
      nonRenewalContracts: 0, undecidedContracts: 0, percentage: null },
      registrationCompleteness: { activeContracts: 0, completeContracts: 0, percentage: null,
        missingByField: { objeto: 0, valor_total: 0, data_assinatura: 0, vigencia_inicio: 0, vigencia_fim: 0 } } },
    itemBalances: { coverage: 'AVAILABLE', criterio: { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 },
      resumo: { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 },
      agregados: { totalContratado: 0, saldoComprometido: 0, saldoMedido: 0, itemCount: 0, completeValueRows: 0,
        contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 }, itens: [] } },
};

base.data.itemBalances = structuredClone(fiscal.data.itemBalances);
export const manager = managerDashboardSummaryResponseSchema.parse(base);
export { fixture as fiscal, responseForRequest } from './fiscal-band-distribution';
