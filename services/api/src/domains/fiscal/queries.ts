export const GET_FISCAL_IDENTITY = `
SELECT id, nome, ativo
FROM comum.usuario
WHERE id = $1
`;
