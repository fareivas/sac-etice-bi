# Primeiro lote do resumo do Gerente de Contratos

`GET /api/v1/gerentes-contrato/me/dashboard/resumo` usa somente a fotografia atual do PostgreSQL. `contratoId` é um recorte adicional solicitado para este lote e somente restringe a carteira autorizada. `unidadeId`, `supplierId` e `includeExternal` da especificação 7.1 não são aceitos neste lote porque as relações/regras e a integração externa não foram aprovadas para a implementação atual.

O contrato parcial retorna `manager`, `cards.activeContracts`, `cards.activePortfolioValue`, `cards.expiringContracts`, `cards.renewalsWithin120Days`, `contracts` e `expiringContractList`, com cobertura por indicador. A lista `contracts` contém contratos vigentes da carteira atual. `merCoverage=PROPOSTA` segue a cobertura estrutural prevista na especificação; os demais campos da resposta completa descrita na especificação 7.1 ainda não são publicados. A rota de produção permanece desabilitada com 501 até existir uma política de autenticação/autorização real.

A decisão funcional aprovada para este lote fixa uma janela inclusiva de 120 dias para contratos vigentes com vencimento próximo. Na fotografia atual, o contrato deve pertencer à carteira autorizada atual do gestor, ter `status = 'vigente'`, `vigencia_fim IS NOT NULL`, `vigencia_fim >= dataReferencia` e `vigencia_fim <= dataReferencia + 120 dias`. O dia de referência e o dia +120 entram; um contrato já vencido ou em +121 não entra. A consulta SQL usa `BETWEEN` com esses limites inclusivos e recebe `dataReferencia` como parâmetro. O filtro `contratoId` restringe a população antes da classificação.

`cards.renewalsWithin120Days` é o nome do indicador aprovado para o contrato HTTP. `cards.expiringContracts`, campo pré-existente, espelha a mesma contagem para preservar compatibilidade. Ambos representam apenas **contratos vigentes com vencimento nos próximos 120 dias**, sem afirmar início ou situação de renovação formal. `expiringContractList` preserva o formato de item existente (`contractId`, `contractNumber`, `supplierName`, `value`, `expiryDate`) e contém somente contratos na janela. A tela apresenta identificação, fornecedor e fim da vigência; `value` continua no contrato HTTP por compatibilidade e vem de `contrato.valor_total`. `meta.dataCoverage.renewalsWithin120Days` e `meta.dataCoverage.expiringContracts` espelham a mesma disponibilidade.

Se qualquer contrato vigente do recorte autorizado tiver `vigencia_fim NULL`, não é possível classificar toda a população. Ambos os contadores e `expiringContractList` ficam `null/UNAVAILABLE`, inclusive se outros contratos estiverem na janela. Carteira atual vazia produz `0/AVAILABLE` e lista `[]`. Para `dataReferencia` passada, os três permanecem `null/UNAVAILABLE` porque a designação atual não reconstrói a carteira histórica.

Se qualquer contrato ativo tiver `valor_total` nulo, o total é `null/UNAVAILABLE`; a contagem permanece disponível. **Decisão humana mínima:** definir se contratos ativos sem valor devem excluir-se de um total parcial, bloquear o total inteiro ou seguir outra regra. Até essa decisão, o total inteiro fica indisponível para evitar subcontagem silenciosa.

`dataReferencia` passada não usa a designação atual, status, valor ou vigência atuais. A carteira e os indicadores dependentes dela ficam `null/UNAVAILABLE`. O nome e ID do usuário autenticado continuam disponíveis. Zero significa consulta atual válida sem contratos vigentes; `null` significa dado não apurável.


## Carga de fiscais — slice parcial

`GET /api/v1/gerentes-contrato/me/fiscais/carga` segue literalmente os nomes HTTP da especificação 7.2: `inspectors[].activeContracts` e `inspectors[].pendingOrders`. A apuração usa a fotografia atual da carteira autorizada por designação ativa de gestor. `activeContracts` conta `DISTINCT` contratos com `status = 'vigente'` e designação fiscal ativa. `pendingOrders` conta `DISTINCT` OS cliente vinculadas diretamente a contratos da carteira com designação fiscal ativa, segundo a elegibilidade compartilhada da DEC-036: `aguardando_fiscal`, ou `recebida`/`em_validacao` com decisão fiscal P1 aberta/em tratamento. OS sem contrato direto e demais status ficam fora. O predicado é compartilhado com o domínio Fiscal por módulo neutro. `responsavel_id` não atribui a OS ao fiscal; a regra não reproduz autorização de ações ou fallback de perfis do SAC.

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

## DEC-GC-028 — Supervisão operacional dos fiscais

**Status:** APROVADA para a apresentação gerencial atual.

O Dashboard do Gerente usa exclusivamente
`GET /api/v1/gerentes-contrato/me/fiscais/carga` para comparar, por fiscal,
`inspectors[].activeContracts` (contratos vigentes designados) e
`inspectors[].pendingOrders` (OS cliente com decisão fiscal pendente ligada
diretamente a contrato da carteira com designação fiscal ativa, conforme
DEC-026). Mantém a tabela com as colunas Fiscal, Contratos vigentes, OS
pendentes e Capacidade e acrescenta gráfico de barras agrupadas na mesma
escala linear iniciada em zero. A tabela é a alternativa textual do gráfico.

A ordenação existe apenas no frontend: contratos vigentes decrescente, nome
do fiscal em ordem `pt-BR` e `userId` crescente. Não altera o endpoint nem
representa ranking de desempenho. As pendências são vinculadas a contratos,
não necessariamente atribuídas individualmente ao fiscal. A mesma OS pode
constar para fiscais diferentes com designações ativas múltiplas; as contagens
por fiscal não são somadas como OS únicas da carteira do gerente.

Lista disponível vazia apresenta mensagem própria sem gráfico. Cobertura
`UNAVAILABLE` ou `inspectors: null` apresenta indisponibilidade sem zeros.
Falha HTTP ou de validação da chamada de carga é exibida separadamente e não
derruba o resumo principal. Durante a carga conjunta permanece o estado de
carregamento. Capacidade, carga ponderada, criticidade, ranking, ações
concluídas no prazo, ações vencidas e recomendações de intervenção seguem
indisponíveis; não há cálculo de sobrecarga.

## DEC-GC-029 — Qualidade Preventiva da Gestão

**Status:** APROVADA para o resumo gerencial atual.

`GET /api/v1/gerentes-contrato/me/dashboard/resumo` inclui
`data.preventiveQuality.renewalDecisionsD90` e
`data.preventiveQuality.registrationCompleteness`, cada um com cobertura
independente em `meta.dataCoverage`. A população é limitada aos contratos
`vigente` da carteira resolvida por designação ativa de `gestor`; o filtro
`contratoId` somente restringe esse escopo e IDs externos geram
`FORBIDDEN_SCOPE`.

**Decisões D-90:** contratos com `vigencia_fim` entre `dataReferencia` e
`dataReferencia + 90 dias`, inclusive. A fonte da decisão é
`contratos.intencao_vigencia`, vinculada por `contrato_id` e pela mesma
`vigencia_fim` corrente. Apenas `prorrogar` e `nao_renovar` contam como
decididos; `ciente` e ausência de intenção não contam. `decidedContracts`
é a soma dessas duas intenções, `undecidedContracts` é elegíveis menos
decididos, e `percentage` é decididos/elegíveis × 100. Denominador zero
produz percentual `null`. Intenção de prorrogar não comprova prorrogação.

**Preenchimento cadastral:** todos os contratos vigentes do recorte.
`completeContracts` exige `objeto` não vazio após trim, `valor_total`
não nulo (zero é preenchido), `data_assinatura`, `vigencia_inicio` e
`vigencia_fim` não nulos. `missingByField` conta as ausências de cada
campo, e `percentage` é completos/vigentes × 100, ou `null` se a
população for vazia. Isso mede presença cadastral, não conformidade ou
validade do conteúdo.

Para a data atual, carteira vazia gera contagens zero e percentuais `null`
com cobertura `AVAILABLE`. Contrato sem fim de vigência entra no
preenchimento e fica fora do D-90. Data histórica não reconstruível gera
ambos os indicadores `null/UNAVAILABLE`, sem consultar fotografia atual.
Falha SQL conserva HTTP 500 sanitizado. Percentuais são calculados sem
arredondamento intermediário e formatados apenas na tela. Ações no prazo,
medições, previsibilidade e radar de cinco dimensões permanecem sem
métricas aprovadas.

## DEC-GC-031 — Matriz Contrato × Dimensão de Risco

**Status:** APROVADA para a carteira atual do gerente.

O resumo gerencial inclui `data.contractRiskMatrix` e
`meta.dataCoverage.contractRiskMatrix`, sem consulta adicional. Há uma linha
por contrato vigente autorizado em `data.contracts`, com o mesmo ID, número e
fornecedor. O filtro `contratoId` mantém o escopo autorizado. Carteira vazia
gera matriz `[]/AVAILABLE`; fotografia histórica não reconstruível gera
`null/UNAVAILABLE`.

**Saldo:** usa exclusivamente as faixas dos itens já compostos em
`data.itemBalances.itens`, sem recalcular percentuais. A precedência por
contrato é `critico > atencao > adequado`, mapeada para `CRITICAL`,
`ATTENTION` e `OK`. A presença de qualquer item `nao_verificavel` marca
`partialCoverage: true`, inclusive quando outro item permite classificação.
Sem item verificável, o estado é `UNAVAILABLE`; contrato sem itens tem
`partialCoverage: false`. Saldo contratual agregado não classifica risco.

**Vigência:** usa somente `contracts[].expiryDate` e `meta.dataReference`.
Por decisão funcional do GC-031, vencimento na data de referência, anterior
ou até D+30 inclusive é `CRITICAL`; D+31 a D+120 inclusive é `ATTENTION`;
a partir de D+121 é `OK`. Data ausente é `UNAVAILABLE`. Essa classificação expressa
somente proximidade do vencimento e não presume ação vencida, renovação ou
atraso operacional. Os limites ficam centralizados no serviço e são testados
nas bordas.

**SLA, Medição, Pagamento e Índice:** cada célula é `UNAVAILABLE`. Não há
pontuação, ponderação, ranking ou inferência a partir da ausência de alertas.
SLA e demais KPIs técnicos dependem do Projeto de KPIs. A interface mostra
etiquetas textuais para os estados e explicita cobertura parcial de Saldo.

### GC-031 — Motivos de indisponibilidade do saldo

Extensão aprovada pelo pedido de ajuste da coluna Saldo: cada `saldo` inclui
`reason` obrigatório, com `null` quando o status é classificável e um dos
seguintes valores quando é `UNAVAILABLE`:

- `NO_ITEMS`: fonte disponível sem itens para o contrato; cobertura parcial falsa.
  A tela mostra “Sem itens cadastrados para classificar o saldo”.
- `ALL_ITEMS_UNVERIFIABLE`: todos os itens do contrato são não verificáveis;
  cobertura parcial verdadeira, mantendo sua indicação na tela.
- `ITEM_SOURCE_UNAVAILABLE`: `itemBalances.coverage = UNAVAILABLE`; cobertura
  parcial falsa. Tem precedência sobre ausência de itens.

O frontend explica os três motivos. Não muda a precedência das faixas nem usa
saldo global como substituto. Não há alteração de consultas ou dados do banco;
falhas SQL continuam erros HTTP, conforme GC-027.

## GC-032 — Alinhamento visual e operacional do dashboard gerencial

**Escopo:** apresentação no frontend, sem mudança de contrato HTTP, consulta, cálculo
ou regra GC-027 a GC-031. Referência visual:
`docs/reference/prototypes/ETICE_Dashboard_Gerente_Contratos_Autocontido_v4_ABC.html`.
Os dados numéricos do protótipo são demonstrativos e não são usados no SAC BI.

A tela organiza escopo autorizado, seis indicadores executivos, matriz de risco e
fiscais, intervenções, forecast/exposição/qualidade, ciclo financeiro,
fornecedores e detalhamentos. Os seis cards mostram contratos ativos, contratos
com ao menos uma dimensão crítica na matriz, valor atual da carteira ativa,
vencimentos nos próximos 120 dias, quantidade de alertas contratuais e SLA
abaixo da meta. A contagem de contratos com dimensão crítica é apenas uma
contagem factual das células recebidas, nunca índice geral, score ou ranking.
O card de vencimentos não afirma renovação atrasada. SLA depende do Projeto de
KPIs e aparece como **Indisponível**. Qualquer cobertura ausente permanece
indisponível, inclusive em fotografia histórica.

O heatmap mantém as seis dimensões e os status de GC-031. A pesquisa local por
contrato ou fornecedor combina com dimensão e classificação. Os contadores
representam células da matriz no recorte visível; as linhas são ordenadas pela
maior criticidade presente, com desempate por número/ID do contrato. A ordem
é somente visual e não produz pontuação. Motivos de indisponibilidade do Saldo
e cobertura parcial continuam textuais. Os controles não alteram a resposta da
API nem os filtros dos itens contratuais.

Intervenções exibem alertas efetivos e observações das células críticas de
Saldo ou Vigência. A recomendação é avaliar o contrato e o encaminhamento
cabível; não há prioridade P1/P2, impacto, responsável ou prazo calculado.
Contratos e OS dos fiscais continuam associados por designação na carteira;
OS não representam necessariamente atribuição individual e não se somam
entre fiscais. Capacidade e sobrecarga não são calculadas.

Forecast de 180 dias, exposição financeira e volumes/tempos do ciclo financeiro
são painéis de indisponibilidade até existir fonte e regra aprovada. Saldo
contratual não é exposição financeira. Os dois indicadores preventivos mantêm
seus anéis e detalhamentos próprios. O painel de fornecedores preserva o valor
vigente e exibe ABC indisponível: a classe exige pagamentos efetivos acumulados
em 12 meses e regra aprovada. A apresentação não reutiliza o valor vigente
como base ABC.

Os filtros e tabelas de saldos, itens, contratos e renovações permanecem
independentes dos controles locais da matriz. Estilos visuais são limitados a
`.manager-dashboard`, inclusive pontos de quebra para desktop, tablet e telas
de 390 px. Estados vazios/indisponíveis, rótulos e foco visível são textuais.

## GC-033 — Refinamento visual da primeira tela gerencial

**Escopo:** frontend, estilos, testes e documentação. A referência visual segue
`docs/reference/prototypes/ETICE_Dashboard_Gerente_Contratos_Autocontido_v4_ABC.html`.
Os campos, cálculos, coberturas, filtros e regras GC-027 a GC-032 permanecem os
mesmos. Dados simulados e métricas conceituais do protótipo não entram na tela.

O cabeçalho, escopo, seis cards, controles e painéis iniciais usam menor altura,
padding e espaçamento. Em largura suficiente, a matriz mostra as seis dimensões
lado a lado; em telas estreitas, sua tabela rola horizontalmente dentro do
painel. A célula exibe somente **Crítico**, **Atenção**, **OK** ou
**Indisponível**. Contrato, fornecedor, dimensão, classificação, motivo de
indisponibilidade e cobertura parcial aparecem no painel aberto ao selecionar
a célula. Isso mantém íntegra a explicação do Saldo prevista em GC-031.

Cada célula é um botão com rótulo acessível, foco visível e estado de seleção.
A seleção funciona por mouse e teclado; Esc ou o botão de fechamento ocultam o
painel. O fechamento por botão devolve o foco à célula. Os filtros combináveis,
contadores e ordenação da GC-032 continuam locais à matriz; os contadores
aparecem como indicadores compactos. A explicação longa das contagens dos
fiscais permanece disponível em um bloco expansível, reduzindo a altura do
painel quando a carteira não tem fiscais designados.

Foram definidos ajustes responsivos para 1440 px, 768 px e 390 px. A rolagem
horizontal fica no conteúdo da matriz quando as sete colunas não cabem; as
informações da célula continuam acessíveis por seleção, sem depender de hover.

### GC-033 — Correções finais de layout e formatação

A coluna Contrato da matriz tem largura fixa no layout da tabela e quebra
nomes longos de fornecedores dentro da própria célula. Em 390 px, a rolagem
horizontal pertence apenas à tabela da matriz; as seis dimensões continuam
acessíveis. O painel selecionável mantém o nome integral do fornecedor.
`cards.activePortfolioValue` é exibido em BRL com duas casas decimais, mantendo
`null` como **Indisponível** e zero disponível como `R$ 0,00`.

## GC-033 — Consulta Gerencial de Pendências Contratuais (frontend)

O painel da Visão principal passa a chamar-se **Intervenções e pendências contratuais**. Usa exclusivamente `data.contractAlerts` e `meta.dataCoverage.contractAlerts` da resposta já autorizada do resumo do Gerente. Não cria endpoint, consulta ou regra de prioridade.

Filtros locais combináveis: contrato por `contractId`, tipo (inclusive tipo nulo), estado e pesquisa sem distinção de caixa/acentos em contrato, tipo, estado e descrição. A lista recebida não é mutada. A apresentação agrupa por `contractId` para não unir contratos com números iguais, ordena os grupos pelo número exibido do contrato (`pt-BR`, comparação numérica, ID como desempate) e os registros pela criação crescente, com datas nulas por último e `alertId` como desempate. A ordem do endpoint descrita em DEC-GC-026 permanece intacta; essa é apenas a ordem local de leitura e do CSV. Nenhum registro é criado ou descartado pela formação dos grupos.

O contador mostra `visíveis de total recebido` somente quando a cobertura está disponível. São estados distintos: fonte indisponível, lista disponível vazia e filtro sem correspondência. Os controles locais não alteram cards executivos, observações da matriz ou outras consultas. As seleções persistem entre abas e respostas equivalentes; mudando gerente, recorte autorizado ou data de referência, os filtros são limpos. Quando a fonte fica temporariamente indisponível no mesmo contexto, as seleções são retidas para o retorno.

`createdAt` é mostrado como data e hora na `meta.timezone`. A antiguidade usa **dias de calendário** entre a data local de criação e `meta.dataReference`, somente quando ambas permitem cálculo confiável e a criação não é futura. É identificada como antiguidade, nunca atraso, prazo de decisão ou SLA. `expiryDate` continua rotulado **Vencimento contratual**, sem inferência de prazo da pendência. Valores nulos são apresentados como Indisponível. O tipo `designacao_ausente` é exibido literalmente e não prova ausência atual de designação.

A exportação CSV contém exatamente os registros visíveis na mesma ordem dos grupos e itens, com contrato, tipo, estado, descrição, data de registro e vencimento contratual. Reutiliza `encodeCsv` para aspas, delimitadores, quebras de linha, UTF-8 e proteção de fórmulas. A ação fica desabilitada quando não há registros visíveis. A seção **Observações da matriz** permanece independente dos filtros e conserva apenas observações factuais, sem recomendação individual inventada.

Validação GC-033: testes unitários de seleção, ordenação, agrupamento, datas e CSV; interação React de filtros/abas/cobertura; Chromium com fixtures sintéticas em 1440, 900 e 390 px para ambos os dashboards, sem acesso a banco ou SAC oficial. Sem alteração de contrato HTTP, backend, SQL ou autorização.

## GC-036 — Ocorrências contratuais para avaliação gerencial

Nas telas Supervisão e Visão agregada, a tabela visual de intervenções passa a
mostrar ocorrências factuais do resumo autorizado. Cada alerta efetivo gera uma
linha identificada por `alertId`. Cada célula `CRITICAL` de Saldo ou Vigência
gera uma linha identificada por `contractId` e dimensão. Origens diferentes
permanecem distintas. A apresentação agrupa por contrato e ordena por número
do contrato, ID e identidade da ocorrência; essa ordem não representa
prioridade. As colunas dos dois protótipos são preservadas.

Contrato, fornecedor quando constar da matriz, tipo, estado e descrição do
alerta e dimensão crítica são informações factuais. Fiscal responsável,
prioridade, impacto, antecedência e prazo permanecem indisponíveis. A frase
“Avaliar o contrato e o encaminhamento cabível” é orientação genérica, sem
atribuição formal. O KPI de intervenções segue indisponível. Alertas e matriz
têm cobertura independente; a interface distingue cobertura parcial, ambas
as fontes indisponíveis, fontes disponíveis sem ocorrências e recorte vazio ou
indisponível. O recorte global é aplicado antes da transformação. A consulta
histórica GC-033 e seus filtros não são alterados.

## GC-034 — Filtros globais do Gerente

A barra da visão gerencial combina fiscal, risco, janela de vencimento e busca por interseção sobre `data.contracts` da carteira autorizada. A gerência permanece visível e desabilitada porque não há fonte aprovada. A janela padrão é D0 a D+180, inclusiva, a partir de `meta.dataReference`; há opções D+90 e D+365. Data nula ou vencimento anterior a D0 não entra no recorte. Essa janela de seleção não altera os limites existentes de risco de 30/120 dias, D-90 ou o indicador específico de vencimento em 120 dias.

O filtro de risco testa exclusivamente `contractRiskMatrix[].saldo.status` e `vigencia`, aceitando correspondência em qualquer uma das duas dimensões. As seis dimensões continuam visíveis na matriz. Busca sem caixa/acentos cobre número/ID, fornecedor e nomes dos fiscais com designação ativa. A resposta parcial de carga acrescenta `inspectors[].contractIds`, gerados somente de `contratos.designacao` ativa com papel `fiscal` e de IDs previamente autorizados por `repository.scope()`; não consulta o SAC oficial nem amplia a carteira. O campo é opcional no validador compartilhado para compatibilidade de consumidores anteriores; a consulta atual sempre o preenche.

O frontend restringe matriz, contratos, pendências, saldos contratuais e itens aos IDs selecionados. Recalcula contagem de contratos vigentes, valor ativo com cobertura completa e precisão segura, contagem de críticos da matriz e vencimentos em 120 dias, mantendo nulos quando incompletos. Indicadores preventivos D-90/preenchimento, OS pendentes por fiscal e valor por fornecedor ficam **Indisponível** no subconjunto: as respostas atuais não fornecem as relações necessárias à sua repartição exata. A carga por fiscal mostra somente a contagem de contratos vigentes no recorte; não reaproveita a contagem de OS da carteira inteira. Sem fonte suficiente para determinar o recorte, inclusive nomes de fiscal para a busca quando a carga falha, a tela mostra indisponibilidade em vez de apresentar totais da carteira inteira como filtrados. Filtros locais persistem ao alternar abas e ao mudar o recorte global.

## GC-037 — Horizonte factual de vencimentos em 180 dias

A Visão agregada substitui o título Forecast por **Horizonte de vencimentos ·
180 dias**. A transformação pura usa exclusivamente `summary.data.contracts`
da carteira vigente autorizada e `meta.dataReference`, sem relógio do navegador.
Deduplica por `contractId`, exclui datas anteriores a D0 e posteriores a D+180
(inclusive D0 e D180) e ordena por dias restantes, número/ID exibido e ID.
As faixas inclusivas são D0–30, D31–60, D61–90, D91–120 e D121–180.

Fiscal, risco e busca conservam a seleção GC-034, incluindo a exigência de
fontes suficientes. Somente IDs de `selectGlobalContracts()` podem aparecer.
A janela efetiva é a interseção com 180 dias: D+90 produz D0–90; D+180 e
D+365 produzem D0–180. As cinco faixas permanecem visíveis; as totalmente
fora da janela mostram **Fora do recorte**.

A cobertura é específica deste painel e consultada na carteira original,
antes da projeção. Qualquer vencimento ausente/não verificável mantém o total
consolidado **Indisponível**, inclusive se outro filtro possivelmente excluiria
esse contrato. Linhas conhecidas selecionadas e contagens verificáveis ficam
visíveis com aviso de cobertura parcial; não se distribuem datas desconhecidas.
Não se reutiliza a cobertura de `renewalsWithin120Days`. Carteira disponível
vazia e recorte válido vazio mostram zero quando a cobertura é completa, com
mensagens distintas. `portfolio: UNAVAILABLE`, `contracts: null` ou IDs
selecionados indisponíveis impedem todas as linhas e contagens consolidadas.

Número ausente usa `contractId`; fornecedor ausente mostra **Indisponível**.
A data usa `displayDate()` e dias/faixas usam `daysFromReference()` existente.
Previsão financeira e necessidade de renovação/aditivo/licitação permanecem
**Indisponíveis**: vencimento factual não comprova processo ou decisão.
Não altera o endpoint de renovações 7.4, contratos HTTP, backend, autorização,
banco, regras de vencimento em 120 dias, Supervisão ou Fiscal.

### GC-037 — restauração visual do Forecast executivo (15/10/2026)

Na rota `/gerente-contratos/visao-agregada`, o card volta a seguir o protótipo
homologado: **Forecast 180 dias** com dois alertas executivos. O valor de
contratos com risco de saldo/vigência e a quantidade que exige
renovação/aditivo/licitação são **Indisponível**, com indicação de ausência de
fonte e regra aprovadas. Nenhum valor de saldo ou contagem de vencimentos é
usado como substituto. A tabela, as cinco faixas e o total consolidado
factual descritos acima deixam a interface principal. `expiryHorizon()` e seus
testes puros permanecem disponíveis no frontend, mas não integram o Forecast
executivo. A descrição anterior registra a implementação factual da GC-037;
este adendo define a apresentação vigente. Os filtros globais continuam
atuando sobre os demais painéis conforme GC-034.
