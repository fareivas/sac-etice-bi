// DEC-036: current SAC eligibility, shared by Fiscal card/queue and manager load.
// The queue JOIN and the EXISTS use the same pendency criteria (alias p).
export const FISCAL_PENDING_DECISION_PREDICATE = `
p.entidade_tipo = 'ordem_servico'
      AND p.entidade_id = os.id
      AND p.tipo = 'decisao_fiscal_p1'
      AND p.status IN ('aberta', 'em_tratamento')`;

// EXISTS avoids multiplying one order when it has several eligible pendencies.
export const FISCAL_PENDING_ORDER_PREDICATE = `
os.lado = 'cliente'
  AND (os.status = 'aguardando_fiscal'
    OR (os.status IN ('recebida', 'em_validacao') AND EXISTS (
    SELECT 1 FROM comum.pendencia p
    WHERE ${FISCAL_PENDING_DECISION_PREDICATE}
  )))`;
