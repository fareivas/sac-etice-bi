# Reformulação visual do Dashboard do Fiscal

Referência: `docs/reference/prototypes/ETICE_Dashboard_Fiscal_React_Recharts.html`,
consultada junto à especificação de endpoints (6.1/6.2) e às decisões do resumo
fiscal. Cabeçalho compacto em azul-escuro, filtros horizontais, seis KPIs,
fila e saúde lado a lado, três painéis operacionais e detalhamento inferior.
Estilos novos são limitados a `.fiscal-dashboard`.

A barra superior usa somente `data.contracts` com cobertura disponível.
Contrato, fornecedor, busca sem caixa/acentos e janela de vencimento filtram
por interseção **somente os dois painéis operacionais de saldos e vigências**.
Não modifica a fila, itens ou KPIs da carteira inteira. Risco é desabilitado:
a resposta fiscal não fornece classificação contratual aprovada. Os escopos
ficam explícitos e o bloco expansível explica fontes e limitações. Janelas
incluem D0 e o limite selecionado, calculados a partir de `meta.dataReference`;
data ausente fica fora da janela, mas aparece como indisponível quando não há
janela ativa. Sem a fonte de contratos, controles e painéis ficam indisponíveis.
Não recupera dados de outra carteira nem oferece identificação arbitrária de fiscal.
Seleções desaparecidas são mantidas, com opção explicativa e recorte vazio;
atualizações equivalentes preservam filtros, mudança de usuário/unidade/IDs
autorizados/referência reinicia os controles. Consulta externa permanece existente.

Os seis KPIs representam a carteira autorizada completa:

- Contratos sob fiscalização: card recebido com sua cobertura.
- Saldo disponível: soma monetária dos `contractBalances`, somente quando há
  exatamente uma linha por contrato autorizado, sem IDs externos/duplicados,
  com ambas as fontes disponíveis e centavos/total em precisão segura.
  Não usa itens para preencher lacunas. Mantém zero e negativos; falta de
  completude ou fonte produz **Indisponível**, nunca soma parcial.
- Vencimentos: contagem factual distinta em D0–120 inclusive, somente quando
  todas as datas da carteira permitem cálculo. Não indica renovação ou atraso.
- SLA, medições e pagamentos: **Indisponível**, sem fonte/regra de indicador.

OS pendentes, itens críticos do legado, ações vencidas, violações externas e
alertas contratuais foram preservados em indicadores complementares expansíveis.
Os percentuais de saúde das cinco dimensões continuam indisponíveis; os trilhos
hachurados não possuem preenchimento percentual nem semântica de progresso.
Não há média dos saldos, índice de saúde ou score inventado.

O gráfico existente de percentuais de saldos recebidos foi movido para a linha
operacional, com link para a tabela de valores completos abaixo. Essa tabela
continua usando a carteira inteira. Vigências mostram datas/dias verificáveis
e alertas reais por contrato; renovações efetivamente identificadas permanecem
indisponíveis. Pagamento e medição apresentam etapas conceituais indisponíveis,
sem valores ou status contratuais inferidos.

Fila mantém registros/ordem, filtros, busca, CSV e estados de fonte vazia,
filtro sem correspondência e indisponibilidade. Ressalvas estão em blocos
expansíveis acessíveis. Distribuição, seleção de faixas, filtros dos itens,
ordenação, paginação, detalhes e CSV integral permanecem implementados.
Ciclo financeiro e ABC inferiores também foram preservados.

Diferenças remanescentes do modelo: risco, percentuais de saúde, SLA, indicadores
financeiros e processos de renovação não são simulados. Fila e itens têm filtros
próprios, e a barra superior não é apresentada como filtro global. A identificação,
datas, contagens, contratos e saldos vêm exclusivamente da resposta real.

## Validação reproduzível

Runtime Node 22 e Playwright/Chromium temporários em `/tmp/gc037-runtime` e
`/tmp/gc037-browsers`, sem nova dependência no repositório. Vite local na porta
5183; todas as respostas `/api/**` interceptadas com fixtures.

```bash
node_modules/.bin/esbuild scripts/test/fixtures/manager-global-filters.ts \
  --bundle --platform=node --format=esm --outfile=/tmp/gc037-fixtures.mjs
PLAYWRIGHT_MODULE=/tmp/gc037-runtime/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/gc037-browsers \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  /tmp/gc037-runtime/node_modules/node/bin/node \
  scripts/test/fiscal-visual-reform.visual.mjs \
  /tmp/gc037-fixtures.mjs /tmp/fiscal-visual-reform
```

## Resultados em 14/10/2026

- Frontend completo: 18 arquivos, **245 testes aprovados**, incluindo 5 testes
  puros do resumo operacional e 4 novas integrações React (65 testes fiscais
  de apresentação ao todo). CSV, filtros, paginação, faixas, detalhes e refresh
  permanecem cobertos pelas suítes existentes.
- API: **169 aprovados**, 2 integrações PostgreSQL ignoradas pela configuração
  existente; contratos compartilhados: **28 aprovados**.
- Typecheck, build e `git diff --check`: aprovados.
- Chromium da reformulação: 1440, 900 e 390 px, com composição, filtros
  combinados, cobertura parcial, carteira vazia e fonte indisponível, sem
  overflow horizontal nem erros de página. Capturas inspecionadas confirmam
  a linha de três painéis em desktop e os seletores em duas colunas em 390 px.
  Relatório e capturas em `/tmp/fiscal-visual-reform/`.
- Roteiro das três rotas (Fiscal, Supervisão, Visão agregada): **9 combinações
  aprovadas**, `/tmp/fiscal-reform-routes/`.
- Roteiros existentes: fila (3 casos), CSV de itens (4), paginação (2),
  atualização manual (2), faixas (3) e ordenação (4), todos aprovados.
  Relatórios em `/tmp/fiscal-reform-{queue,csv,pagination,refresh,bands,sort}/`.

Uma execução paralela do roteiro das três rotas terminou com encerramento
inesperado do navegador; não foi contabilizada como aprovada. A repetição
isolada completa passou. O runtime Node 22 temporário evita a incompatibilidade
Node 20/jsdom já constatada. Build conserva os avisos de anotações PURE em Zod
e bundle acima de 500 kB; não impede a compilação.

Sem alteração de backend, contratos HTTP, autorização, schema, banco,
migrations, dados ou SAC oficial. Sem dependências novas, commit ou push.

## Ajuste exclusivo de sequência e posição dos cards

O cabeçalho passa a usar **Visão operacional da carteira individual de contratos**.
A ordem no DOM, preservada em desktop, tablet e 390 px, é:

1. Cabeçalho e filtros.
2. Seis KPIs: contratos, saldo, vencimentos, SLA, medições e pagamentos.
3. Fila de ação à esquerda (60%) e saúde à direita (40%), alinhadas pelo topo.
4. Saldos por contrato, vigências e renovações, pagamento e medição: três
   colunas de largura equivalente no desktop.
5. Ciclo financeiro do contrato em largura total.
6. Relevância Econômica das Partes do Contrato / ABC em largura total.
7. Indicadores operacionais complementares, saldo consolidado e distribuição
   por faixa, seguidos da gestão dos saldos dos itens.

Abaixo de 1150 px, fila/saúde e os três painéis operacionais ficam empilhados.
Os KPIs usam três colunas no tablet e duas em 390 px. Não usa `order` CSS para
simular a sequência: ciclo e ABC foram movidos no JSX, sem mudar seus conteúdos,
fontes ou estados indisponíveis. Filtros, ordenação, paginação, seleção de faixas,
detalhes e CSV continuam intactos. O gerente conserva seu layout.

Validação deste ajuste: 245 testes frontend, 169 API e 28 contratos aprovados;
2 integrações PostgreSQL ignoradas pela configuração existente. Typecheck,
build e `git diff --check` aprovados. Chromium em 1440, 900 e 390 px verificou
ordem, linha única de KPIs no desktop, proporção 60/40, topo alinhado, três
larguras equivalentes, ciclo/ABC em largura total e ausência de overflow.
Relatório e capturas: `/tmp/fiscal-layout-captures/`. A captura desktop foi
inspecionada para confirmar a composição final.

Permanecem os avisos de build já registrados (anotações PURE de Zod e tamanho
do bundle). Nenhuma mudança de dados, regras, backend, APIs, autenticação,
banco ou migrations; sem commit ou push.

## Refinamento de metadados, alertas e estados vazios

A área entre filtros e KPIs reúne atualização, referência e cobertura em uma
faixa discreta identificada por `aria-label`. Preserva o botão e seus estados,
a geração formatada em `meta.timezone`, a data de referência e a ressalva de
que geração da resposta não significa atualização do banco. Cobertura parcial
continua anunciada por `role=status`; mensagens de atualização e erro mantêm
seus estados acessíveis e o comportamento de retenção da última resposta.

Em Vigências e renovações, cada alerta mostra **Alerta contratual**, seguido
de campos próprios para contrato e **Vencimento informado no alerta**. Ambos
vêm de `contractAlerts`, sem substituir a data do alerta pela data da lista de
contratos. Número ausente usa o ID; vencimento ausente é **Indisponível**.
A descrição do SAC aparece somente no detalhe nativo expansível, identificado
pelo `alertId`, com texto original integral, espaços e quebras de linha
preservados. Não extrai nem reescreve o número contratual da descrição, não
infere tipo, severidade ou processo de renovação. `null` tem mensagem própria;
texto vazio recebido permanece vazio. O resumo expansível é operável por teclado.

Os estados indisponíveis deixam de reservar 150 px de altura mínima; tabelas
vazias usam menor espaçamento. Cards operacionais e detalhamentos alinhados pelo
topo deixam de herdar a altura do vizinho mais alto. As larguras, proporções,
ordem no DOM e todos os conteúdos/controles homologados permanecem preservados.
Zero, lista disponível vazia e fonte indisponível continuam distintos.

Validação: **248 testes frontend**, **169 API**, **28 contratos** aprovados;
2 integrações PostgreSQL ignoradas pela configuração existente. Typecheck,
build e `git diff --check` aprovados. Chromium verificou 1440, 900 e 390 px:
faixa de metadados, campos do alerta, descrição original, expansão por Enter,
estados vazio/parcial/indisponível, alturas compactas, ordem homologada e ausência
de overflow horizontal. O roteiro de atualização manual também passou em
desktop e 390 px, preservando teclado, timestamp, filtros, falha e recuperação.
Capturas/relatórios: `/tmp/fiscal-refinement-captures/` e
`/tmp/fiscal-refinement-refresh/`.

Permanecem os avisos anteriores de build (anotações PURE em Zod e tamanho do
bundle). Sem alteração de backend, APIs, SQL, autorização, autenticação, banco,
migrations ou dados do SAC; sem métricas novas, commit ou push.
