export const GET_CURRENT_ITEM_BALANCES = `
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
