# Primeiro lote do resumo do Gerente de Contratos

`GET /api/v1/gerentes-contrato/me/dashboard/resumo` usa somente a fotografia atual do PostgreSQL. `contratoId` é um recorte adicional solicitado para este lote e somente restringe a carteira autorizada. `unidadeId`, `supplierId` e `includeExternal` da especificação 7.1 não são aceitos neste lote porque as relações/regras e a integração externa não foram aprovadas para a implementação atual.

O contrato parcial retorna `manager`, `cards.activeContracts`, `cards.activePortfolioValue`, `cards.expiringContracts`, `cards.renewalsWithin120Days`, `contracts` e `expiringContractList`, com cobertura por indicador. A lista `contracts` contém contratos vigentes da carteira atual. `merCoverage=PROPOSTA` segue a cobertura estrutural prevista na especificação; os demais campos da resposta completa descrita na especificação 7.1 ainda não são publicados. A rota de produção permanece desabilitada com 501 até existir uma política de autenticação/autorização real.

A decisão funcional aprovada para este lote fixa uma janela inclusiva de 120 dias para contratos vigentes com vencimento próximo. Na fotografia atual, o contrato deve pertencer à carteira autorizada atual do gestor, ter `status = 'vigente'`, `vigencia_fim IS NOT NULL`, `vigencia_fim >= dataReferencia` e `vigencia_fim <= dataReferencia + 120 dias`. O dia de referência e o dia +120 entram; um contrato já vencido ou em +121 não entra. A consulta SQL usa `BETWEEN` com esses limites inclusivos e recebe `dataReferencia` como parâmetro. O filtro `contratoId` restringe a população antes da classificação.

`cards.renewalsWithin120Days` é o nome do indicador aprovado para o contrato HTTP. `cards.expiringContracts`, campo pré-existente, espelha a mesma contagem para preservar compatibilidade. Ambos representam apenas **contratos vigentes com vencimento nos próximos 120 dias**, sem afirmar início ou situação de renovação formal. `expiringContractList` preserva o formato de item existente (`contractId`, `contractNumber`, `supplierName`, `value`, `expiryDate`) e contém somente contratos na janela. A tela apresenta identificação, fornecedor e fim da vigência; `value` continua no contrato HTTP por compatibilidade e vem de `contrato.valor_total`. `meta.dataCoverage.renewalsWithin120Days` e `meta.dataCoverage.expiringContracts` espelham a mesma disponibilidade.

Se qualquer contrato vigente do recorte autorizado tiver `vigencia_fim NULL`, não é possível classificar toda a população. Ambos os contadores e `expiringContractList` ficam `null/UNAVAILABLE`, inclusive se outros contratos estiverem na janela. Carteira atual vazia produz `0/AVAILABLE` e lista `[]`. Para `dataReferencia` passada, os três permanecem `null/UNAVAILABLE` porque a designação atual não reconstrói a carteira histórica.

Se qualquer contrato ativo tiver `valor_total` nulo, o total é `null/UNAVAILABLE`; a contagem permanece disponível. **Decisão humana mínima:** definir se contratos ativos sem valor devem excluir-se de um total parcial, bloquear o total inteiro ou seguir outra regra. Até essa decisão, o total inteiro fica indisponível para evitar subcontagem silenciosa.

`dataReferencia` passada não usa a designação atual, status, valor ou vigência atuais. A carteira e os indicadores dependentes dela ficam `null/UNAVAILABLE`. O nome e ID do usuário autenticado continuam disponíveis. Zero significa consulta atual válida sem contratos vigentes; `null` significa dado não apurável.


## Carga de fiscais — slice parcial

`GET /api/v1/gerentes-contrato/me/fiscais/carga` segue literalmente os nomes HTTP da especificação 7.2: `inspectors[].activeContracts` e `inspectors[].pendingOrders`. A apuração usa a fotografia atual da carteira autorizada por designação ativa de gestor. `activeContracts` conta `DISTINCT` contratos com `status = 'vigente'` e designação fiscal ativa. `pendingOrders` conta `DISTINCT` OS cliente vinculadas diretamente a contratos da carteira com designação fiscal ativa e pendência elegível segundo DEC-026. O predicado DEC-026 é compartilhado com o domínio Fiscal por módulo neutro. `responsavel_id` não atribui a OS ao fiscal.

Para `dataReferencia` passada, a lista inteira fica `null/UNAVAILABLE`; a fotografia atual não reconstrói histórico. Capacidade, carga ponderada, criticidade, ranking e ações vencidas permanecem `null/UNAVAILABLE`. Os filtros `role`, `criticality`, `sort` e paginação ainda não têm semântica física aprovada neste slice. A rota de produção permanece 501.


## Fornecedores — slice parcial 7.3

`GET /api/v1/gestao-contratual/fornecedores/resumo` restringe fornecedores à carteira atual autorizada do gerente: designação ativa `gestor` → contrato → `contrato.fornecedor_id` → fornecedor. Não consulta a população global de fornecedores. `vigentValue` soma `valor_total` dos contratos distintos com `status = 'vigente'` por fornecedor, sem reconstrução por aditivos. Se qualquer contrato vigente do fornecedor tiver `valor_total NULL`, o valor do fornecedor é `null`; a cobertura global de `vigentValue` fica `UNAVAILABLE` se houver qualquer fornecedor com total incompleto. Uma carteira vazia consultada retorna `suppliers: []`, `totalItems: 0` e valor disponível. Dados de referência passados retornam `suppliers: null` e cobertura `UNAVAILABLE` sem aplicar designações ou valores atuais retroativamente.

`abcClass`, `openFinancialAmount` e `openCriticalRisks` são `null/UNAVAILABLE`. Os filtros `unidadeId`, `abcClass` e `riskSeverity` são rejeitados com `INVALID_FILTER`, assim como parâmetros desconhecidos; não são ignorados. São aceitos `dataReferencia`, `timezone`, `page` (padrão 1), `pageSize` (padrão 25, máximo 100) e `sort` (`name` ou `vigentValue`, asc/desc). A ordenação padrão é `name:asc` com desempate por ID, sem semântica de ranking ABC. Paginação ocorre após o escopo e a agregação. `activeContracts`, participação percentual, financeiro vencido, classificação acumulada, ranking e score do exemplo demonstrativo não são publicados neste slice. Produção permanece 501.

## DEC-GC-013 a DEC-GC-020 — Financeiro / aging (7.5)

O MER atual possui fluxo financeiro operacional real por meio de
`ordens.ciclo_faturamento`, `ordens.memoria_calculo`, `ordens.liquidacao`,
`fornecedores.nota_fiscal` e estruturas relacionadas. Isso não equivale,
porém, ao modelo de documento financeiro e aging exigido pelo endpoint 7.5.

- `bi.pagamentos_kpis.valor_aguardando_pagamento` não é equivalente a
  `summary.openAmount`.
- `summary.openAmount` permanece `null` / `UNAVAILABLE`.
- `summary.overdueAmount` permanece `null` / `UNAVAILABLE`.
- `documents[].agingBucket`, `stalledStage` e `daysInStage` permanecem
  indisponíveis.
- Não inferir vencimento a partir de `data_emissao`, `competencia`,
  `atualizado_em` ou idade do ciclo.
- Não transformar nota fiscal ou ciclo de faturamento artificialmente no
  `financialDocument` do contrato 7.5.
- Ciclos pagos, valor aguardando pagamento e tempos observados são métricas
  reais do SAC, mas não substituem automaticamente os campos contratados
  pelo endpoint 7.5.
- `agingBucket` não pode ser aplicado sem aging real.
- `unidadeId` continua sem relação física aprovada.
- `side` não deve ser inferido do fluxo de pagamento.
- `supplierId` existe fisicamente, mas qualquer uso futuro deve respeitar
  a carteira autorizada do gerente.
- `dataReferencia` passada não deve reconstruir estado financeiro a partir
  da fotografia atual.

O endpoint 7.5 fica sem implementação funcional nesta fase.

## DEC-GC-021 a DEC-GC-025 — Renovações (7.4)

O MER atual permite determinar a vigência corrente do contrato, mas não
representa o processo de renovação definido pelo endpoint 7.4.

- `contratos.contrato.vigencia_fim` representa vencimento contratual, não
  processo de renovação.
- `summary.within180Days` não será preenchido contando simplesmente contratos
  com vencimento nos próximos 180 dias.
- O resumo do gerente já expõe separadamente o indicador factual aprovado de
  contratos vigentes com vencimento nos próximos 120 dias.
- `summary.overdueStages` e `summary.predictedGaps` permanecem `UNAVAILABLE`.
- `processes[]` permanece `UNAVAILABLE`.
- Não fabricar `processId`, `type`, `currentStage`, `stageDueDate`,
  `officialExpectedCompletion`, `predictedCompletion` ou
  `continuityGapDays` a partir de contrato ou aditivo.
- `contratos.aditivo.nova_vigencia_fim` pode alterar a vigência corrente
  quando refletida no contrato, mas não constitui por si só evidência de um
  processo de renovação conforme o contrato 7.4.

O endpoint 7.4 fica sem implementação funcional nesta fase.

## Correção técnica da consulta de fornecedores

No lote consolidado, `GET_MANAGER_SUPPLIER_CONTRACTS` passa de
`ORDER BY f.id, c.id` para `ORDER BY supplier_id, contract_id`. PostgreSQL exige
que expressões de ordenação de `SELECT DISTINCT` estejam na seleção; os aliases
selecionados eliminam o HTTP 500 causado por essa restrição. A consulta mantém
parâmetros, carteira autorizada, deduplicação e valores nulos. A ordenação
funcional e a paginação continuam aplicadas pelo serviço depois da agregação,
sem alteração do contrato HTTP ou de regras funcionais. A regressão PostgreSQL
é optativa (`SAC_DB_INTEGRATION_TEST=true`) e executa somente SELECT, sem fixtures
persistentes ou mudanças no banco.

## DEC-GC-026 — Alertas contratuais e saldos da carteira

**Status:** APROVADA para este lote local, conforme pedido de enriquecimento do Gerente.

O resumo acrescenta propriedades obrigatórias `data.contractAlerts` e
`data.contractBalances` (`array | null`) e as respectivas chaves em
`meta.dataCoverage` (`AVAILABLE | UNAVAILABLE`). Campos, filtros e indicadores
anteriores permanecem com a mesma semântica.

A carteira é resolvida pela designação ativa de `gestor` do usuário autenticado.
`contratoId` somente restringe essa carteira; qualquer ID solicitado fora dela
continua gerando `FORBIDDEN_SCOPE`. Ambas as consultas recebem os IDs autorizados
como parâmetro e selecionam somente contratos com `status = 'vigente'`, sem
exigir designação fiscal ou corrigir divergências entre status e vigência final.

- Alertas: `comum.pendencia`, ligada por `entidade_tipo = 'contrato'` e
  `entidade_id = contrato.id`. Todos os tipos são elegíveis com status `aberta`
  ou `em_tratamento`; resolvidas e canceladas são excluídas. Não há JOIN com
  decisões ou designações. Deduplicação por `pendencia.id`, ordenação
  `p.criado_em DESC, p.id DESC`.
- Cada alerta contém `alertId`, `contractId` (inteiros positivos seguros),
  `contractNumber`, `type`, `description` (`string | null`), `status`
  (`aberta | em_tratamento`), `expiryDate` (`YYYY-MM-DD | null`) e `createdAt`
  (datetime ISO 8601 com offset ou `null`). `expiryDate` vem exclusivamente de
  `contrato.vigencia_fim` e não representa prazo de ação.
- Saldos: fonte exclusiva `contratos.vw_saldo_contrato`, por LEFT JOIN à carteira
  vigente. Itens usam o mesmo schema financeiro do Fiscal: `contractId`,
  `contractNumber`, `contractedValue`, `consumedValue`, `balanceValue`, `balancePct`.
  Valores vêm de `valor_contratado`, `valor_consumido` e `valor_saldo` da view.
  Percentual é saldo/contratado × 100 somente com contratado positivo e resultado
  finito; caso contrário, `null`. Não se substitui saldo por `contrato.valor_total`.
- Qualquer valor financeiro ausente, inválido, não finito ou acima da precisão
  monetária segura torna a lista inteira `null/UNAVAILABLE`. Ausência de linha
  na view é preservada pelo LEFT JOIN e segue essa mesma regra conservadora.
- Fotografia atual consultável retorna listas/AVAILABLE, inclusive `[]` sem
  registros ou com carteira vazia. Histórico não reconstruível retorna ambas
  `null/UNAVAILABLE`, sem leitura da carteira atual. Falha SQL mantém HTTP 500
  sanitizado; não é convertida em insuficiência de cobertura.

A tela mantém as seções existentes e acrescenta Alertas contratuais, Saldos da
carteira e distribuição financeira por contrato. O gráfico usa os mesmos valores
reais da tabela em escala monetária comum, sem classificação de risco, percentuais
inventados ou alteração da paleta. Listas vazias e indisponíveis são distintas.
Não amplia aging financeiro, renovação formal, ranking, criticidade ou ações vencidas.

Validação local posterior: conferir o gestor 4, seus dois contratos e quatro
pendências não resolvidas, e os saldos totalizando R$ 612.156,00 conforme pedido.
Essas expectativas não são fixtures permanentes. Integração PostgreSQL não foi
repetida no sandbox após a indisponibilidade do ambiente constatada no lote anterior.

## DEC-GC-027 — Saldos por item na carteira do gerente

**Status:** APROVADA para o resumo gerencial atual.

`GET /api/v1/gerentes-contrato/me/dashboard/resumo` inclui as propriedades
obrigatórias `data.itemBalances` e `meta.dataCoverage.itemBalances`. A estrutura
do primeiro campo é a mesma do resumo Fiscal, inclusive critério, distribuição,
agregados com contadores de completude e itens. A classificação, os limiares,
os percentuais e o arredondamento monetário reutilizam a implementação Fiscal;
`cards.criticalItems` do Fiscal conserva sua regra distinta.

A fonte é `bi.saldos_por_item`, ligada a `contratos.contrato_item` e a contratos
`vigente`. A consulta recebe somente IDs resolvidos previamente por designação
ativa de `gestor` e pelo filtro `contratoId` validado por `scope`. Carteira vazia
não consulta a view e retorna `AVAILABLE`, `itens: []` e agregados zerados.
Valores ausentes continuam `null` nos itens e nos agregados afetados, com
contadores de completude independentes. Data histórica retorna
`{ coverage: 'UNAVAILABLE' }` e cobertura `UNAVAILABLE`, sem aplicar
designações atuais retroativamente. Falhas de SQL continuam erros HTTP.

Os filtros de fornecedor, contrato, faixa e busca são locais ao conjunto
autorizado recebido. Tabela, distribuição e indicadores por item usam o mesmo
recorte. Os painéis de `Saldos da carteira` e `Distribuição financeira por
contrato` continuam baseados exclusivamente em `contratos.vw_saldo_contrato`,
sem influência dos filtros locais ou recálculo a partir de itens.
