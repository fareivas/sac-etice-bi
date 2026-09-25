import { FISCAL_PENDING_ORDER_PREDICATE } from '../../shared/db/fiscal-pending-order';

export const GET_FISCAL_IDENTITY = `
SELECT id, nome, ativo
FROM comum.usuario
WHERE id = $1
`;

export const GET_FISCAL_CONTRACT_SCOPE = `
SELECT DISTINCT contrato_id
FROM contratos.designacao
WHERE usuario_id = $1 AND papel = 'fiscal' AND ativo = true
`;

export const COUNT_ACTIVE_FISCAL_CONTRACTS = `
SELECT COUNT(DISTINCT id)::text AS total
FROM contratos.contrato
WHERE id = ANY($1::bigint[]) AND status = 'vigente'
`;

export const ELIGIBLE_FISCAL_SERVICE_ORDERS = `
FROM ordens.ordem_servico os
JOIN contratos.contrato contrato ON contrato.id = os.contrato_id
WHERE os.contrato_id = ANY($1::bigint[])
  AND ${FISCAL_PENDING_ORDER_PREDICATE}
`;

export const COUNT_PENDING_FISCAL_SERVICE_ORDERS = `
SELECT COUNT(DISTINCT os.id)::text AS total
${ELIGIBLE_FISCAL_SERVICE_ORDERS}
`;

export const GET_PENDING_FISCAL_SERVICE_ORDERS = `
SELECT DISTINCT os.id::text AS ordem_servico_id, contrato.id::text AS contrato_id,
       contrato.numero AS contrato_numero
${ELIGIBLE_FISCAL_SERVICE_ORDERS}
ORDER BY ordem_servico_id
`;
