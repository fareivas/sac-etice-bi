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
