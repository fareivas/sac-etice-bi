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
