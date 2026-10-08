export const GET_MANAGER_IDENTITY = `SELECT id, nome, ativo FROM comum.usuario WHERE id = $1`;
export const GET_MANAGER_SCOPE = `SELECT DISTINCT contrato_id FROM contratos.designacao WHERE usuario_id = $1 AND papel = 'gestor' AND ativo = true`;
export const GET_MANAGER_ACTIVE_CONTRACTS = `
SELECT c.id::text AS contract_id, c.numero AS contract_number, f.razao_social AS supplier_name,
       c.valor_total::text AS value, c.vigencia_fim::date::text AS expiry_date,
       c.vigencia_fim::date BETWEEN $2::date AND ($2::date + 120) AS expires_within_120_days
FROM contratos.contrato c
LEFT JOIN fornecedores.fornecedor f ON f.id = c.fornecedor_id
WHERE c.id = ANY($1::bigint[]) AND c.status = 'vigente'
ORDER BY c.id`;

export const GET_MANAGER_CONTRACT_ALERTS = `
SELECT p.id::text AS alert_id, c.id::text AS contract_id,
       c.numero AS contract_number, p.tipo AS type, p.status AS status,
       p.descricao AS description, c.vigencia_fim::date::text AS expiry_date,
       p.criado_em AS created_at
FROM comum.pendencia p
JOIN contratos.contrato c ON c.id = p.entidade_id
WHERE p.entidade_tipo = 'contrato'
  AND c.id = ANY($1::bigint[]) AND c.status = 'vigente'
  AND p.status IN ('aberta', 'em_tratamento')
ORDER BY p.criado_em DESC, p.id DESC`;

export const GET_MANAGER_CONTRACT_BALANCES = `
SELECT c.id::text AS contract_id, c.numero AS contract_number,
       s.valor_contratado::text AS contracted_value,
       s.valor_consumido::text AS consumed_value, s.valor_saldo::text AS balance_value
FROM contratos.contrato c
LEFT JOIN contratos.vw_saldo_contrato s ON s.contrato_id = c.id
WHERE c.id = ANY($1::bigint[]) AND c.status = 'vigente'
ORDER BY c.id`;

export const GET_MANAGER_PREVENTIVE_QUALITY = `
SELECT c.id::text AS contract_id, c.objeto AS objeto,
       c.valor_total::text AS valor_total,
       c.data_assinatura::date::text AS data_assinatura,
       c.vigencia_inicio::date::text AS vigencia_inicio,
       c.vigencia_fim::date::text AS vigencia_fim,
       c.vigencia_fim::date BETWEEN $2::date AND ($2::date + 90) AS eligible_d90,
       i.intencao AS intencao
FROM contratos.contrato c
LEFT JOIN contratos.intencao_vigencia i
  ON i.contrato_id = c.id AND i.vigencia_fim = c.vigencia_fim::date
WHERE c.id = ANY($1::bigint[]) AND c.status = 'vigente'
ORDER BY c.id`;
