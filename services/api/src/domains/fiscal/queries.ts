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

// Scope IDs have already been authorized and restricted by contratoId.
export const GET_CURRENT_FISCAL_CONTRACTS = `
SELECT c.id::text AS contract_id, c.numero AS contract_number,
       f.razao_social AS supplier_name, c.valor_total::text AS value,
       c.vigencia_fim::date::text AS expiry_date
FROM contratos.contrato c
LEFT JOIN fornecedores.fornecedor f ON f.id = c.fornecedor_id
WHERE c.id = ANY($1::bigint[]) AND c.status = 'vigente'
ORDER BY c.id
`;

export const GET_CURRENT_FISCAL_CONTRACT_BALANCES = `
SELECT c.id::text AS contract_id, c.numero AS contract_number,
       s.valor_contratado::text AS contracted_value,
       s.valor_consumido::text AS consumed_value,
       s.valor_saldo::text AS balance_value
FROM contratos.contrato c
LEFT JOIN contratos.vw_saldo_contrato s ON s.contrato_id = c.id
WHERE c.id = ANY($1::bigint[]) AND c.status = 'vigente'
ORDER BY c.id
`;

// The distinct, filtered scope is resolved before this query. No designation or
// decision JOIN is needed, so each pendencia can produce only one alert.
export const GET_CURRENT_FISCAL_CONTRACT_ALERTS = `
SELECT p.id::text AS alert_id, c.id::text AS contract_id,
       c.numero AS contract_number, p.descricao AS description,
       c.vigencia_fim::date::text AS expiry_date, p.criado_em AS created_at
FROM comum.pendencia p
JOIN contratos.contrato c ON c.id = p.entidade_id
WHERE p.entidade_tipo = 'contrato'
  AND c.id = ANY($1::bigint[]) AND c.status = 'vigente'
  AND p.tipo = 'vigencia_vencendo' AND p.status = 'aberta'
ORDER BY p.criado_em DESC, p.id DESC
`;

export const GET_CURRENT_FISCAL_ITEM_BALANCES = `
SELECT c.id::text AS contract_id, c.numero AS contract_number,
       f.razao_social AS supplier_name, s.contrato_item_id::text AS item_id,
       s.seq AS sequence, s.especificacao AS specification, s.unidade AS unit,
       s.quantidade_contratada::text AS quantity_contracted,
       s.quantidade_consumida::text AS quantity_consumed,
       s.quantidade_medida::text AS quantity_measured,
       s.quantidade_saldo::text AS quantity_balance,
       s.valor_contratado::text AS value_contracted,
       s.valor_consumido::text AS value_consumed,
       s.valor_medido::text AS value_measured,
       s.valor_saldo::text AS value_balance,
       ci.status_verificacao AS verification_status
FROM bi.saldos_por_item s
JOIN contratos.contrato_item ci ON ci.id = s.contrato_item_id
JOIN contratos.contrato c ON c.id = ci.contrato_id
LEFT JOIN fornecedores.fornecedor f ON f.id = c.fornecedor_id
WHERE c.id = ANY($1::bigint[]) AND c.status = 'vigente'
ORDER BY c.id, s.seq, s.contrato_item_id
`;
