// DEC-026: client-side service orders with a direct contract and an eligible fiscal decision.
// EXISTS avoids multiplying one order when it has several eligible pendencies.
export const FISCAL_PENDING_ORDER_PREDICATE = `
os.lado = 'cliente'
  AND EXISTS (
    SELECT 1 FROM comum.pendencia p
    WHERE p.entidade_tipo = 'ordem_servico'
      AND p.entidade_id = os.id
      AND p.tipo = 'decisao_fiscal_p1'
      AND p.status IN ('aberta', 'em_tratamento')
  )`;
