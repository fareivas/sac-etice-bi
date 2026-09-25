import {
  fiscalDashboardSummaryResponseSchema,
  type FiscalDashboardSummaryResponse,
} from '@sac-etice-bi/contracts';

export async function loadFiscalSummary(includeExternal: boolean): Promise<FiscalDashboardSummaryResponse> {
  const response = await fetch(`/api/v1/fiscais/me/dashboard/resumo?includeExternal=${includeExternal}`);
  if (!response.ok) throw new Error(`Resumo indisponível (HTTP ${response.status})`);
  return fiscalDashboardSummaryResponseSchema.parse(await response.json());
}

import { managerDashboardSummaryResponseSchema, managerFiscalLoadResponseSchema, managerSuppliersResponseSchema, type ManagerDashboardSummaryResponse, type ManagerFiscalLoadResponse, type ManagerSuppliersResponse } from '@sac-etice-bi/contracts';
export async function loadManagerSummary(): Promise<ManagerDashboardSummaryResponse> {
  const response = await fetch('/api/v1/gerentes-contrato/me/dashboard/resumo');
  if (!response.ok) throw new Error(`Resumo indisponível (HTTP ${response.status})`);
  return managerDashboardSummaryResponseSchema.parse(await response.json());
}

export async function loadManagerFiscalLoad(): Promise<ManagerFiscalLoadResponse> {
  const response = await fetch('/api/v1/gerentes-contrato/me/fiscais/carga');
  if (!response.ok) throw new Error(`Carga dos fiscais indisponível (HTTP ${response.status})`);
  return managerFiscalLoadResponseSchema.parse(await response.json());
}

export async function loadManagerSuppliers(): Promise<ManagerSuppliersResponse> {
  const response = await fetch('/api/v1/gestao-contratual/fornecedores/resumo');
  if (!response.ok) throw new Error(`Fornecedores indisponíveis (HTTP ${response.status})`);
  return managerSuppliersResponseSchema.parse(await response.json());
}
