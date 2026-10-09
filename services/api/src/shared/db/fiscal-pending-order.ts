// DEC-026: only open P1 fiscal decisions linked directly to a service order.
// The queue JOIN and the count EXISTS use the same pendency criteria (alias p).
export const FISCAL_PENDING_DECISION_PREDICATE = `
p.entidade_tipo = 'ordem_servico'
      AND p.entidade_id = os.id
      AND p.tipo = 'decisao_fiscal_p1'
      AND p.status IN ('aberta', 'em_tratamento')`;

// EXISTS avoids multiplying one order when it has several eligible pendencies.
export const FISCAL_PENDING_ORDER_PREDICATE = `
os.lado = 'cliente'
  AND EXISTS (
    SELECT 1 FROM comum.pendencia p
    WHERE ${FISCAL_PENDING_DECISION_PREDICATE}
  )`;
