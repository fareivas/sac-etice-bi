import {
  fiscalDashboardSummaryResponseSchema,
  type FiscalDashboardSummaryResponse,
} from '@sac-etice-bi/contracts';

export async function loadFiscalSummary(includeExternal: boolean): Promise<FiscalDashboardSummaryResponse> {
  const response = await fetch(`/api/v1/fiscais/me/dashboard/resumo?includeExternal=${includeExternal}`);
  if (!response.ok) throw new Error(`Resumo indisponível (HTTP ${response.status})`);
  return fiscalDashboardSummaryResponseSchema.parse(await response.json());
}

import { managerDashboardSummaryResponseSchema, type ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
export async function loadManagerSummary(): Promise<ManagerDashboardSummaryResponse> {
  const response = await fetch('/api/v1/gerentes-contrato/me/dashboard/resumo');
  if (!response.ok) throw new Error(`Resumo indisponível (HTTP ${response.status})`);
  return managerDashboardSummaryResponseSchema.parse(await response.json());
}
