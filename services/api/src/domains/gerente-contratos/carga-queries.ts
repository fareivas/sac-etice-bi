import { FISCAL_PENDING_ORDER_PREDICATE } from '../../shared/db/fiscal-pending-order';

// Reuse DEC-026 eligibility; the fiscal comes only from the active designation.
export const GET_MANAGER_FISCAL_LOAD = `
SELECT d.usuario_id::text AS user_id, u.nome AS name,
       ARRAY_AGG(DISTINCT c.id::text) AS contract_ids,
       COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'vigente')::text AS active_contracts,
       COUNT(DISTINCT os.id)::text AS pending_orders
FROM contratos.designacao d
JOIN comum.usuario u ON u.id = d.usuario_id
JOIN contratos.contrato c ON c.id = d.contrato_id
LEFT JOIN ordens.ordem_servico os ON os.contrato_id = d.contrato_id
  AND ${FISCAL_PENDING_ORDER_PREDICATE}
WHERE d.contrato_id = ANY($1::bigint[])
  AND d.papel = 'fiscal' AND d.ativo = true
GROUP BY d.usuario_id, u.nome
ORDER BY u.nome, d.usuario_id`;

