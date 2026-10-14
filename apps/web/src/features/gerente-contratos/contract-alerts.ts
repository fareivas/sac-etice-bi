import { useMemo, useState } from 'react';
import type { ManagerDashboardSummaryResponse } from '@sac-etice-bi/contracts';
import { csvReferenceSuffix, downloadCsv, encodeCsv } from '../../lib/csv';
import { displayDate } from '../../lib/display-date';

export type ContractAlert = NonNullable<ManagerDashboardSummaryResponse['data']['contractAlerts']>[number];
export type AlertFilters = { contract: string; type: string; status: string; search: string };
export type AlertGroup = { contractId: number; contractNumber: string | null; alerts: ContractAlert[] };
const emptyAlerts: ContractAlert[] = [];
const emptyFilters = (context: string | null) => ({ context, contract: '', type: '', status: '', search: '' });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const alertTypeKey = (type: string | null) => type === null ? 'null:' : `value:${type}`;
export const alertContractLabel = (alert: Pick<ContractAlert, 'contractId' | 'contractNumber'>) =>
  alert.contractNumber ?? `Contrato ID ${alert.contractId}`;
const compareContract = (a: Pick<ContractAlert, 'contractId' | 'contractNumber'>,
  b: Pick<ContractAlert, 'contractId' | 'contractNumber'>) =>
  alertContractLabel(a).localeCompare(alertContractLabel(b), 'pt-BR', { numeric: true }) || a.contractId - b.contractId;

/** Each received alert remains one record; grouping changes presentation only. */
export function selectContractAlerts(alerts: readonly ContractAlert[], filters: AlertFilters) {
  const query = normalize(filters.search.trim());
  const visible = alerts.filter(alert =>
    (!filters.contract || String(alert.contractId) === filters.contract) &&
    (!filters.type || alertTypeKey(alert.type) === filters.type) &&
    (!filters.status || alert.status === filters.status) &&
    (!query || [alertContractLabel(alert), String(alert.contractId), alert.type, alert.status,
      alert.status === 'em_tratamento' ? 'Em tratamento' : 'Aberta', alert.description]
      .some(value => value !== null && normalize(value).includes(query))));
  const groups = new Map<number, AlertGroup>();
  for (const alert of visible) {
    let group = groups.get(alert.contractId);
    if (!group) {
      group = { contractId: alert.contractId, contractNumber: alert.contractNumber, alerts: [] };
      groups.set(alert.contractId, group);
    }
    group.alerts.push(alert);
  }
  const orderedGroups = [...groups.values()].sort(compareContract);
  for (const group of orderedGroups) group.alerts.sort((a, b) => {
    if (a.createdAt === null) return b.createdAt === null ? a.alertId - b.alertId : 1;
    if (b.createdAt === null) return -1;
    return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.alertId - b.alertId;
  });
  return { groups: orderedGroups, visible: orderedGroups.flatMap(group => group.alerts) };
}

export function formatAlertRegistered(createdAt: string | null, timezone: string) {
  if (createdAt === null) return 'Indisponível';
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return 'Indisponível';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(timestamp);
  } catch { return 'Indisponível'; }
}

/** Calendar age at the API reference date, never a deadline or SLA calculation. */
export function alertAgeDays(createdAt: string | null, reference: string, timezone: string): number | null {
  if (createdAt === null || !/^\d{4}-\d{2}-\d{2}$/.test(reference)) return null;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: timezone }).formatToParts(timestamp);
    const part = (name: string) => Number(parts.find(value => value.type === name)?.value);
    const createdDay = Date.UTC(part('year'), part('month') - 1, part('day'));
    const [year, month, day] = reference.split('-').map(Number);
    const referenceDay = Date.UTC(year, month - 1, day);
    const age = (referenceDay - createdDay) / 86_400_000;
    return Number.isInteger(age) && age >= 0 ? age : null;
  } catch { return null; }
}

export function managerAlertsCsv(alerts: readonly ContractAlert[], timezone: string) {
  return encodeCsv([
    ['Contrato', 'Tipo', 'Estado', 'Descrição', 'Data de registro', 'Vencimento contratual'],
    ...alerts.map(alert => [alertContractLabel(alert), alert.type ?? 'Indisponível',
      alert.status, alert.description ?? 'Indisponível',
      formatAlertRegistered(alert.createdAt, timezone), displayDate(alert.expiryDate, timezone)]),
  ]);
}
export function downloadManagerAlertsCsv(alerts: readonly ContractAlert[], reference: string, timezone: string) {
  if (!alerts.length) return;
  downloadCsv(managerAlertsCsv(alerts, timezone), `pendencias-contratuais-${csvReferenceSuffix(reference)}.csv`);
}

export function useManagerContractAlerts(alerts: ContractAlert[] | null | undefined, context: string | null) {
  const rows = alerts ?? emptyAlerts;
  const [stored, setStored] = useState(() => emptyFilters(null));
  let filters = stored;
  if (context !== null && filters.context !== context) {
    filters = emptyFilters(context);
    setStored(filters);
  }
  const contracts = useMemo(() => [...new Map(rows.map(alert => [alert.contractId, alert.contractNumber] as const))]
    .sort((a, b) => compareContract({ contractId: a[0], contractNumber: a[1] },
      { contractId: b[0], contractNumber: b[1] })), [rows]);
  const types = useMemo(() => [...new Map(rows.map(alert => [alertTypeKey(alert.type), alert.type] as const))]
    .sort((a, b) => (a[1] ?? 'Indisponível').localeCompare(b[1] ?? 'Indisponível', 'pt-BR')), [rows]);
  const selected = useMemo(() => selectContractAlerts(rows, filters), [rows, filters]);
  const setFilter = (change: Partial<AlertFilters>) => setStored(current => ({ ...current, ...change }));
  return { ...filters, ...selected, contracts, types, total: rows.length, setFilter,
    clearFilters: () => setStored(emptyFilters(context)), activeFilters: Boolean(filters.contract || filters.type || filters.status || filters.search.trim()),
    missingContract: Boolean(filters.contract && alerts && !contracts.some(([id]) => String(id) === filters.contract)),
    missingType: Boolean(filters.type && alerts && !types.some(([key]) => key === filters.type)) };
}
