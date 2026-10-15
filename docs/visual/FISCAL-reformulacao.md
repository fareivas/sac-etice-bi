# Reformulação visual do Dashboard do Fiscal

Referência principal vigente: `docs/reference/ETICE_Dashboard_Fiscal_Autocontido_v4_ABC.html`,
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

## Reprodução fiel do Autocontido v4 ABC

A referência visual principal é agora o arquivo fornecido
`docs/reference/ETICE_Dashboard_Fiscal_Autocontido_v4_ABC.html`, preservado sem
alterações. A apresentação usa suas medidas e cores: Arial/Helvetica, cabeçalho
com gradiente `#0f172a → #164e63` e padding 22/24 px, conteúdo até 1500 px com
padding 20 px, cinco filtros equivalentes, cartões com raio 14 px, sombra
`0 8px 24px rgba(15,23,42,.08)`, KPIs com borda superior 4 px, tabela de 12 px
com padding 10/9 px, barras de 12 px, cards de vigência de 150 px mínimos e
blocos destacados com borda esquerda 5 px. A fila/saúde adota a proporção
`1.4fr / 1fr` do HTML (aproximadamente 58/42, compatível com a linha homologada).
Breakpoints do núcleo passam a 1100/650 px; os cinco filtros empilham em 390 px.
Todos os estilos consolidados são específicos de `.fiscal-dashboard`.

Os controles adicionais da fila (filtros, CSV, contagem e ressalvas) ficam em
**Filtros, CSV e escopo da fila**, detalhe nativo recolhido por padrão. Tabela,
registros e colunas reais permanecem disponíveis. A barra superior mantém
identificação dos controles para leitores de tela, com escopo e fontes no
bloco expansível e consulta externa acessível. A faixa compacta de atualização
continua separada para preservar geração, referência e cobertura reais.

Saúde reproduz cinco trilhos horizontais e reserva o bloco âmbar para o índice
consolidado **Indisponível**, sem preencher percentuais. Saldos por contrato
usa barras HTML compactas sem eixos, preservando percentuais da API e a tabela
completa inferior. Valores negativos/acima de 100% ampliam a escala comum,
com origem marcada e rótulos originais; não são truncados, classificados ou
convertidos em zero. Percentuais ausentes conservam a explicação de cobertura.

Vigências usam cards compactos com datas/dias reais. Alertas preservam campos
estruturados e descrição original integral em detalhe expansível. Pagamento
(vermelho) e medição (âmbar) reproduzem os blocos do HTML, com indisponibilidade.
Ciclo financeiro reproduz sete fases, cinco indicadores e faixa de ação,
todos indisponíveis, sem status, gargalos ou recomendações inferidos. ABC
reproduz os dois blocos azuis, sem classes, participações ou prioridade fictícias.
A sequência homologada e todos os detalhamentos complementares permanecem.

### Evidências e diferenças restantes

Validação: **249 testes frontend**, **169 API**, **28 contratos** aprovados.
Typecheck, build e `git diff --check` aprovados. Duas integrações PostgreSQL
foram ignoradas pela configuração existente. Roteiros de fila (3 casos) e
refresh (2) passaram, incluindo abertura dos controles, teclado, filtros,
CSV, retenção de dados, falha/recuperação e proteção contra respostas antigas.

Comparações Chromium em **1440, 900 e 390 px**, com dados disponíveis,
parciais, vazios e indisponíveis. Sem overflow horizontal da página React
nem erros de execução. Verificados fonte/filtros contra o HTML, ordem no DOM,
KPIs em linha no desktop, proporção de fila/saúde, três larguras equivalentes,
sete fases, cinco indicadores, ABC, ausência de eixos e descrições expansíveis.
As requisições foram interceptadas; nenhum backend ou banco foi acessado.

Capturas em `/tmp/fiscal-faithful-captures/`, por largura `W`:

- HTML: `original-W-upper.png`, `original-W-lower.png`, `original-W-full.png`,
  `original-W-cycle.png`, `original-W-abc.png`.
- React: `fiscal-W-viewport.png` (superior), `react-W-lower.png`,
  `fiscal-W-initial.png` (completa), `react-W-cycle.png`, `react-W-abc.png`.
- Estados: `fiscal-W-available.png`, `fiscal-W-partial.png`,
  `fiscal-W-empty.png`, `fiscal-W-unavailable.png` e alerta expandido.
- Relatório: `report.json`. Fila/refresh: `/tmp/fiscal-faithful-queue/` e
  `/tmp/fiscal-faithful-refresh/`.

Diferenças necessárias: nomes/datas vêm da API; não aparece a identificação
“Protótipo Power BI” como informação real. Valores e textos dos KPIs são os
aprovados, mantendo **D0–120**, sem trocar silenciosamente pela janela ilustrativa
D+90. A fila mostra OS, severidade, pendências e ressalvas reais, conservando
suas sete colunas; não copia P1/P2, impactos ou recomendações do modelo.
Quantidade/comprimento dos registros e ausência de fontes alteram alturas e
conteúdo. Controles de autorização, consulta externa, atualização e cobertura
e detalhamentos adicionais permanecem, mesmo sem equivalente no HTML.
Percentuais de saúde, índice, processos de renovação, finanças e classes ABC
ficam **Indisponíveis**. Essas diferenças impedem igualdade pixel a pixel.

Build mantém os avisos preexistentes de anotações PURE em Zod e bundle acima
de 500 kB. Sem alteração de backend, SQL, banco, migrations, autenticação,
autorização ou contratos HTTP; sem dados do protótipo na aplicação, dependências
novas, commit ou push.

O roteiro das três rotas também passou nas 9 combinações de Fiscal, Supervisão
e Visão agregada com 1440/900/390 px, sem regressão estrutural ou overflow.
Evidências: `/tmp/fiscal-faithful-routes/`. As capturas superiores e do ciclo
foram inspecionadas comparativamente, incluindo 390 px.

## Acabamento visual final: compactação e alinhamento executivo

A estrutura homologada permanece. A faixa entre filtros e KPIs conserva botão,
geração da resposta, referência, cobertura, escopo e consulta externa. A cobertura
parcial continua visível e anunciada; a explicação completa e a distinção entre
geração e atualização do banco ficam em **Sobre atualização e cobertura**,
expansível nativo acessível. Nenhuma informação foi removida.

Cada OS ocupa uma linha executiva compacta. A célula de motivo apresenta a
quantidade factual de pendências do recorte e permite abrir seus detalhes. O
detalhe preserva todas as pendências correspondentes aos filtros, seus status,
título da OS quando recebido e descrições originais, inclusive espaços/quebras
de linha. Texto vazio conserva a indicação anterior de decisão pendente e o
conteúdo original vazio; texto nulo mantém o fallback existente. A contagem de
pendências ocultas pelos filtros permanece, sem mostrar registros fora do recorte.
A seleção e o CSV continuam usando `queueFilters.visible`, independentemente de
a linha estar aberta ou fechada. Não houve alteração dos filtros ou do CSV.

Fila/saúde e os três painéis operacionais agora usam o alinhamento `stretch` da
grade, igualando as alturas dentro de cada linha no desktop sem alturas fixas
nem linhas fictícias. Fila disponível vazia e fila indisponível têm mensagens
próprias e nenhuma OS artificial. Ao expandir conteúdo extenso, a grade acompanha
a altura necessária e as áreas com rolagem interna preservam o conteúdo integral.
Em tablet/390 px os cards empilhados mantêm altura natural e ordem no DOM.
Explicações de saúde, vigências/alertas e fonte financeira ficam acessíveis por
expansão; as indisponibilidades permanecem visíveis. Ciclo, ABC, barras de saldo
e detalhamentos inferiores conservaram os estilos e comportamentos aprovados.

### Validação do acabamento

- Frontend: **252 testes aprovados** (18 arquivos, 72 testes de apresentação
  fiscal), incluindo detalhes por OS, descrições originais, status, fila vazia
  e indisponível e metadados expansíveis.
- API: **169 aprovados**; contratos: **28 aprovados**. Duas integrações
  PostgreSQL ignoradas pela configuração existente, sem contá-las como aprovação.
- Typecheck, build e `git diff --check`: aprovados. Permanecem os avisos de
  anotações PURE em Zod e tamanho do bundle já registrados.
- Chromium em **1440, 900 e 390 px**: cenários disponíveis, parciais,
  indisponíveis, fila vazia, múltiplas pendências e descrições extensas. Verificou
  igualdade de alturas nas linhas desktop, larguras/proporções, ordem dos cards,
  expansão por teclado, texto integral e ausência de overflow da página.
- Roteiro de fila: 3 casos aprovados, incluindo filtros por teclado, expansão
  de pendências, download CSV e conteúdo exato/BOM. Refresh: 2 casos aprovados,
  preservando timestamp, filtros, falha/recuperação e respostas antigas.

Capturas comparativas com o HTML obrigatório e relatório:
`/tmp/fiscal-polish-captures/`. Para cada largura W: `original-W-upper.png`
versus `fiscal-W-viewport.png`; `original-W-lower.png` versus
`react-W-lower.png`; capturas completas e específicas de ciclo/ABC permanecem.
`fiscal-W-empty-queue-executive.png` registra a fila vazia alinhada à saúde;
`fiscal-W-os-ID-expanded.png` mostra pendências abertas;
`fiscal-W-long-content.png` e `fiscal-W-long-content-executive.png` registram
conteúdo extenso. Relatórios adicionais em `/tmp/fiscal-polish-queue/` e
`/tmp/fiscal-polish-refresh/`. Capturas desktop/vazia e expansão em 390 px foram
inspecionadas. Tabelas estreitas mantêm rolagem horizontal interna, como o HTML.

Diferenças restantes: fonte real e metadados adicionais, campos factuais da OS,
quantidade de registros, explicações de cobertura e indisponibilidade. A altura
da linha acompanha seu card mais alto; não se cria conteúdo para ocupar o espaço
remanescente. Saúde, finanças e ABC continuam indisponíveis quando não aprovados.
Não se copiaram valores, prioridades ou recomendações ilustrativos.

Sem alteração de regras, backend, SQL, banco, migrations, contratos HTTP,
autenticação ou autorização. Sem commit ou push.

Regressão visual das três rotas: 9 combinações aprovadas em
`/tmp/fiscal-polish-routes/`, sem regressões gerenciais ou overflow.
