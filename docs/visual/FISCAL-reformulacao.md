# Dashboard Fiscal — escopo visual definitivo

Referência principal: `docs/reference/ETICE_Dashboard_Fiscal_Autocontido_v4_ABC.html`.
O HTML define a aparência; dados e autorização continuam sendo os da API.

## Decisão de exclusão definitiva

Foram removidos da página fiscal, sem abas, rotas ou telas alternativas:

- Saldo consolidado por contrato (painel inferior).
- Distribuição dos itens por faixa.
- Gestão dos Saldos dos Itens Contratuais.
- Indicadores operacionais complementares após o ABC.

A página termina em **Relevância Econômica das Partes do Contrato**.
O painel executivo **Saldos por contrato** permanece com barras horizontais
alimentadas pelos percentuais reais da API. A referência/link para a tabela
inferior foi removida, pois essa tabela deixou de existir.

Foram excluídos JSX, estados, hooks, filtros de itens, ordenação, paginação,
detalhes expansíveis de itens, CSV de itens, imports, funções e estilos de uso
exclusivo dos componentes retirados. Os módulos fiscais exclusivos e seus testes
unitários/roteiros visuais foram excluídos. Os testes da apresentação e os roteiros
de fila/refresh foram adaptados ao escopo atual, sem reduzir a cobertura das
funcionalidades preservadas. Os roteiros históricos compartilhados deixaram de
executar a antiga apresentação fiscal e conservam os cenários gerenciais.

`BandDistribution`, `useItemBalanceFilters`, utilitários CSV compartilhados,
estilos de itens usados pelo gerente e fixtures compartilhadas de regressão
foram preservados. A fixture compartilhada de faixas deixou de importar o gerador
CSV fiscal excluído. A resposta HTTP permanece intacta, inclusive `itemBalances`
e cards operacionais que já não são apresentados na interface fiscal.

Esta decisão substitui as orientações visuais anteriores de preservar os quatro
painéis inferiores e suas funcionalidades exclusivamente fiscais. As decisões
normativas de contratos HTTP não foram alteradas.

## Sequência e comportamento preservados

1. Cabeçalho escuro com fiscal e referência reais, filtros executivos e consulta externa.
2. Seis KPIs: contratos, saldo disponível, vencimentos, SLA, medições e pagamentos.
3. Minha fila de ação / Saúde da carteira.
4. Saldos por contrato / Vigências e renovações / Pagamento e medição.
5. Ciclo financeiro com sete etapas, cinco indicadores e faixa de ação.
6. Relevância Econômica das Partes do Contrato, com dois blocos ABC azuis.

Desktop usa seis KPIs e três painéis operacionais em linha; fila/saúde mantêm
`1.4fr/1fr`, com alturas iguais dentro da linha. Tablet e 390 px mantêm a ordem
no DOM com cards empilhados. Estilos são isolados sob `.fiscal-dashboard`.

A barra superior filtra somente os painéis operacionais, por interseção de
contrato, fornecedor, busca sem caixa/acentos e janela inclusiva de vencimento.
Usa somente contratos autorizados e `meta.dataReference`, sem relógio local.
Risco continua desabilitado com explicação. Sem fonte de contratos, os controles
e o recorte ficam indisponíveis. Atualização no mesmo escopo preserva seleções;
opção desaparecida é mantida sem ampliar o recorte; novo contexto reinicia filtros.

KPIs representam a carteira completa. Saldo total exige correspondência completa
e única entre contratos autorizados e saldos, com centavos seguros; incompletude
não produz soma parcial. Vencimentos continuam em D0–120 inclusive, com total
indisponível se alguma data não for verificável. SLA, medições e pagamentos sem
fonte aprovada permanecem indisponíveis. Barras de saldo usam percentuais recebidos,
sem eixos/classificação; negativos e valores acima de 100% ampliam a escala comum.

Fila mantém uma linha por OS, detalhes nativos de todas as pendências do recorte,
status e textos originais, filtros locais, contagem de OS, indicação de pendências
ocultas e **CSV da fila**. Nenhuma prioridade, impacto, prazo ou recomendação é
inferida. Lista disponível vazia, filtro sem correspondência e fonte indisponível
continuam distintos. CSV usa exatamente o recorte selecionado, independentemente
de as linhas estarem abertas ou fechadas, com conteúdo/BOM e proteção preservados.

Alertas de vigência mantêm número e vencimento informados no alerta e descrição
original integral em detalhe expansível. Não comprovam renovação. Saúde não recebe
percentuais artificiais nem índice inventado. Finanças e ABC conservam estados
indisponíveis nas estruturas aprovadas. Zero disponível não é fonte indisponível.

Atualização manual, referência, cobertura, geração da resposta, fonte KPI e
consulta externa permanecem acessíveis. O estado da fonte KPI foi mantido nos
metadados expansíveis, sem reintroduzir cards após o ABC. Falha de refresh mantém
última resposta, filtros e timestamp; respostas antigas não sobrescrevem novo escopo.

## Validação reproduzível

Runtime Node 22, Playwright/Chromium temporários, Vite em 5183 e fixtures
HTTP interceptadas. Nenhuma requisição chega ao backend, banco ou SAC oficial.

```bash
node_modules/.bin/esbuild scripts/test/fixtures/manager-global-filters.ts \
  --bundle --platform=node --format=esm --outfile=/tmp/fiscal-exclusion-fixtures.mjs
PLAYWRIGHT_MODULE=/tmp/gc037-runtime/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/gc037-browsers \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  /tmp/gc037-runtime/node_modules/node/bin/node \
  scripts/test/fiscal-visual-reform.visual.mjs \
  /tmp/fiscal-exclusion-fixtures.mjs /tmp/fiscal-exclusion-captures
```

O roteiro confirma em 1440, 900 e 390 px a ausência dos quatro componentes e
que o último painel no DOM é o ABC, além de ordem, alinhamento, metadados,
controles, expansões, cenários disponível/parcial/vazio/indisponível/extenso e
inexistência de overflow horizontal da página. Mantém capturas comparativas
superiores/inferiores e completas com o HTML original, inclusive ciclo e ABC.
O roteiro GC-035 verifica também as duas rotas gerenciais.

## Resultados da exclusão definitiva

- Frontend: **170 testes aprovados em 14 arquivos**, incluindo 40 testes de
  apresentação fiscal e as suítes gerenciais preservadas. A redução frente ao
  lote anterior corresponde à exclusão dos testes de funcionalidades retiradas.
- API: **169 aprovados**, 2 integrações PostgreSQL ignoradas pela configuração
  existente. Contratos compartilhados: **28 aprovados**.
- Typecheck, build e `git diff --check`: aprovados. Sintaxe dos 8 roteiros
  visuais alterados verificada. Build conserva avisos de PURE em Zod e tamanho
  do bundle, sem impedir compilação.
- Chromium Fiscal: **1440, 900 e 390 px**, com fontes disponíveis, parciais,
  vazias/indisponíveis, fila vazia/múltipla e descrições extensas. Confirmou
  ausência dos quatro blocos, nenhum link pendente para a tabela retirada e
  ABC como último elemento da página. Sem erros de página ou overflow.
- Regressão de Fiscal/Supervisão/Visão agregada: **9 combinações aprovadas**.
  Suíte de fila: **3 casos aprovados**, incluindo filtros, detalhes e CSV/BOM
  exato. Refresh: **2 casos aprovados**, preservando estados, timestamp,
  filtros, recuperação e proteção contra respostas atrasadas.

Evidências: `/tmp/fiscal-exclusion-captures/report.json`, comparações e capturas
em `/tmp/fiscal-exclusion-captures/`; três rotas em
`/tmp/fiscal-exclusion-routes/`; fila e refresh em
`/tmp/fiscal-exclusion-queue/` e `/tmp/fiscal-exclusion-refresh/`.
A região inferior desktop e o ABC em 390 px foram inspecionados visualmente.

Limitações visuais permanecem somente as inerentes aos dados reais e às fontes
indisponíveis. Tabelas podem rolar internamente em telas estreitas. Não existem
consultas alternativas para os componentes excluídos. Nenhum backend, SQL, banco,
migration, autenticação, autorização ou contrato HTTP foi alterado. Sem commit
ou push.

## Ajuste de cobertura após a exclusão (sem mudança de layout)

O gráfico `FiscalContractBalanceChart` e os componentes de produção não foram
alterados neste ajuste. Recuperaram-se no roteiro fiscal atual os cenários
antes existentes no ramo fiscal de `dashboard-layout.visual.mjs`:

- 0%, -20%, 150% e percentual indisponível, sem truncar os valores nem converter
  ausência em zero. Verificação dos nomes/percentuais no nome acessível, dos
  rótulos e da escala comum `[-20,150]`.
- 20 contratos com 0% a 19%, todos identificáveis; o contrato em 0% não recebe
  preenchimento artificial. Rolagem interna alcança o último contrato, sem
  overflow horizontal do gráfico ou da página nas três larguras. O teste usa
  a altura compacta vigente, sem restaurar os 420 px do gráfico antigo.
- Todos os percentuais indisponíveis: mensagem explícita, sem barras inventadas.

Dois testes unitários adicionais verificam semântica acessível/geometria de
zero, negativos/acima de 100% e estado integralmente indisponível. O teste de
20 registros já existente foi preservado e complementado pelo teste real de
rolagem Chromium.

A auditoria de datas confirmou os 43 testes existentes de calendários válidos,
inválidos/ausentes, bordas, fusos e independência do relógio. Testes de resumo e
recortes vazios/indisponíveis permaneceram. Acrescentou-se apenas a rejeição de
uma resposta HTTP com `2026-02-31`, em integração React e Chromium; o validador
existente impede que a data inválida entre no dashboard. O roteiro também
confere as datas contratuais recebidas e a indicação de vigência nula.

Os quatro roteiros gerenciais históricos foram limpos de parênteses redundantes,
laços unitários e blocos artificiais decorrentes da retirada do ramo fiscal.
Suas asserções foram comparadas antes/depois: 20, 46, 46 e 31, respectivamente
(**143 asserções preservadas com os mesmos argumentos**). Nenhuma verificação
foi substituída por teste fiscal excluído. Esses roteiros continuam históricos:
incluem composições antigas, como abas; a regressão gerencial vigente usa
`gc035-prototype.visual.mjs`, sem enfraquecer o acervo histórico.

`docs/api/decisoes-contrato-fiscal.md` agora distingue claramente contrato de dados
vigente e interface de itens descontinuada, preservando todas as decisões e
marcando os seis roteiros excluídos como históricos/não executáveis. O README
de testes e este documento descrevem os roteiros atuais, sem sugerir recriação
dos quatro blocos retirados ou mudanças de backend.

### Resultados da revisão de cobertura

- Frontend: **173 testes aprovados**, em 14 arquivos (41 de apresentação fiscal,
  6 do gráfico executivo e os 43 de datas preservados).
- API: **169 aprovados**, 2 integrações PostgreSQL ignoradas pela configuração
  existente; contratos compartilhados: **28 aprovados**.
- Typecheck, build e `git diff --check`: aprovados. Sintaxe dos quatro roteiros
  gerenciais e do roteiro fiscal validada. Avisos anteriores de PURE em Zod e
  tamanho do bundle permanecem; não são falhas de compilação.
- Chromium: cenários extremos, 20 contratos e rolagem interna, percentuais
  indisponíveis e data HTTP inválida aprovados em **1440, 900 e 390 px**.
  Rótulos acessíveis, datas válidas/nulas, filtros, vazio, cobertura e ausência
  de overflow verificados; os quatro blocos seguem ausentes e o último painel
  continua sendo Relevância Econômica das Partes do Contrato.
- Regressão atual do Gerente e demais rotas: **9 combinações aprovadas** em
  `gc035-prototype.visual.mjs`, nas mesmas três larguras. Os quatro roteiros
  históricos foram auditados estaticamente, sem declarar suas composições
  antigas como testes atuais executados.

Evidências: `/tmp/fiscal-coverage-captures/report.json`, capturas
`fiscal-W-balance-extremes.png`, `fiscal-W-balance-twenty.png`,
`fiscal-W-balance-unavailable.png` e `fiscal-W-invalid-http-date.png`;
regressão em `/tmp/fiscal-coverage-manager-regression/report.json`;
auditoria de asserções em `/tmp/manager-script-assertions.json`.
Capturas dos extremos e do último contrato em 390 px foram inspecionadas.

Os hashes de `summary.tsx`, `contract-balance-chart.tsx`, `contract-expiry.tsx`,
`operational-overview.ts` e `styles.css` foram conferidos antes/depois: nenhum
componente de produção ou layout foi alterado neste ajuste. Alterações limitadas
a testes, roteiros e documentação; sem backend, API, SQL, banco, migrations,
autenticação ou regras novas. Sem commit ou push.
