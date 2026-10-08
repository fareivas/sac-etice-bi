// The input IDs are already restricted by active gestor designations in repository.scope.
// DISTINCT protects totals against duplicate designations or joined rows.
export const GET_MANAGER_SUPPLIER_CONTRACTS = `
SELECT DISTINCT c.id::text AS contract_id, f.id::text AS supplier_id, f.razao_social AS name,
       c.status AS status, c.valor_total::text AS value
FROM contratos.contrato c
JOIN fornecedores.fornecedor f ON f.id = c.fornecedor_id
WHERE c.id = ANY($1::bigint[])
ORDER BY supplier_id, contract_id`;
