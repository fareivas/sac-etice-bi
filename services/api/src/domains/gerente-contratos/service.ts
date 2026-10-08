import { managerDashboardSummaryResponseSchema, type ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { dateInTimezone } from '../fiscal/schemas';
import type { ManagerFilters } from './schemas';
import type { PostgresManagerRepository, PreventiveQualityRow } from './repository';
import { balanceCriteria, composeItemBalances } from '../../shared/item-balances';

function sumDecimal(values: readonly number[]): number {
  const parts = values.map((value) => {
    const text = String(value);
    if (!/^-?\d+(\.\d+)?$/.test(text)) throw new RangeError('Unsupported decimal value');
    const [whole, fraction = ''] = text.split('.');
    return { whole, fraction };
  });
  const scale = Math.max(0, ...parts.map((part) => part.fraction.length));
  const total = parts.reduce((sum, part) => sum + BigInt(part.whole) * 10n ** BigInt(scale) +
    BigInt(part.whole.startsWith('-') ? '-' + (part.fraction.padEnd(scale, '0') || '0') :
      part.fraction.padEnd(scale, '0') || '0'), 0n);
  const result = Number(total) / 10 ** scale;
  if (!Number.isFinite(result)) throw new RangeError('Unsafe decimal total');
  return result;
}

function composePreventiveQuality(rows: readonly PreventiveQualityRow[]) {
  const eligible = rows.filter(row => row.eligibleD90);
  const extendContracts = eligible.filter(row => row.intencao === 'prorrogar').length;
  const nonRenewalContracts = eligible.filter(row => row.intencao === 'nao_renovar').length;
  const decidedContracts = extendContracts + nonRenewalContracts;
  const eligibleContracts = eligible.length;
  const activeContracts = rows.length;
  const missingByField = {
    objeto: rows.filter(row => !row.objeto?.trim()).length,
    valor_total: rows.filter(row => row.valorTotal === null).length,
    data_assinatura: rows.filter(row => row.dataAssinatura === null).length,
    vigencia_inicio: rows.filter(row => row.vigenciaInicio === null).length,
    vigencia_fim: rows.filter(row => row.vigenciaFim === null).length,
  };
  const completeContracts = rows.filter(row => Boolean(row.objeto?.trim()) && row.valorTotal !== null &&
    row.dataAssinatura !== null && row.vigenciaInicio !== null && row.vigenciaFim !== null).length;
  return {
    renewalDecisionsD90: { eligibleContracts, extendContracts, nonRenewalContracts, decidedContracts,
      undecidedContracts: eligibleContracts - decidedContracts,
      percentage: eligibleContracts === 0 ? null : decidedContracts / eligibleContracts * 100 },
    registrationCompleteness: { activeContracts, completeContracts, missingByField,
      percentage: activeContracts === 0 ? null : completeContracts / activeContracts * 100 },
  };
}

export async function composeManagerSummary(userId: number, filters: ManagerFilters,
  repository: Pick<PostgresManagerRepository, 'identity' | 'scope' | 'activeContracts' | 'contractAlerts' | 'contractBalances' | 'itemBalances' | 'preventiveQuality'>,
  now: () => Date = () => new Date()): Promise<ManagerDashboardSummaryResponse> {
  const manager = await repository.identity(userId);
  if (manager.userId !== userId) throw new Error('Identity mismatch');
  const current = filters.dataReferencia === dateInTimezone(now(), filters.timezone);
  // The current designation and contract record cannot reconstruct a past snapshot.
  const ids = current ? await repository.scope(userId, filters.contratoId) : null;
  const [activeRows, contractAlerts, contractBalances, itemRows, preventiveRows] = ids === null ? [null, null, null, null, null] :
    await Promise.all([repository.activeContracts(ids, filters.dataReferencia),
      repository.contractAlerts(ids), repository.contractBalances(ids), repository.itemBalances(ids),
      repository.preventiveQuality(ids, filters.dataReferencia)]);
  const itemBalances = itemRows === null ? { coverage: 'UNAVAILABLE' as const }
    : composeItemBalances(itemRows, balanceCriteria(process.env));
  const preventiveQuality = preventiveRows === null
    ? { renewalDecisionsD90: null, registrationCompleteness: null }
    : composePreventiveQuality(preventiveRows);
  const contracts = activeRows?.map(({ expiresWithin120Days: _within, ...contract }) => contract) ?? null;
  const activeContracts = contracts?.length ?? null;
  const activePortfolioValue = contracts === null || contracts.some((contract) => contract.value === null)
    ? null : sumDecimal(contracts.map((contract) => contract.value!));
  const expiryAvailable = activeRows !== null && !activeRows.some((contract) => contract.expiryDate === null);
  const expiringContractList = expiryAvailable ? activeRows.filter((contract) => contract.expiresWithin120Days === true)
    .map(({ expiresWithin120Days: _within, ...contract }) => contract) : null;
  const renewalsWithin120Days = expiringContractList?.length ?? null;
  return managerDashboardSummaryResponseSchema.parse({
    meta: { generatedAt: now().toISOString(), dataReference: filters.dataReferencia, timezone: filters.timezone,
      source: 'SAC', merCoverage: 'PROPOSTA', filtersApplied: { contratoId: filters.contratoId },
      dataCoverage: { contractAlerts: contractAlerts === null ? 'UNAVAILABLE' : 'AVAILABLE',
        contractBalances: contractBalances === null ? 'UNAVAILABLE' : 'AVAILABLE', portfolio: current ? 'AVAILABLE' : 'UNAVAILABLE',
        itemBalances: itemBalances.coverage,
        renewalDecisionsD90: preventiveRows === null ? 'UNAVAILABLE' : 'AVAILABLE',
        registrationCompleteness: preventiveRows === null ? 'UNAVAILABLE' : 'AVAILABLE',
        activeContracts: current ? 'AVAILABLE' : 'UNAVAILABLE',
        activePortfolioValue: activePortfolioValue === null ? 'UNAVAILABLE' : 'AVAILABLE',
        expiringContracts: expiryAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        renewalsWithin120Days: expiryAvailable ? 'AVAILABLE' : 'UNAVAILABLE' } },
    data: { manager, cards: { activeContracts, activePortfolioValue, expiringContracts: renewalsWithin120Days, renewalsWithin120Days },
      contracts, expiringContractList, contractAlerts, contractBalances, itemBalances, preventiveQuality },
  });
}
