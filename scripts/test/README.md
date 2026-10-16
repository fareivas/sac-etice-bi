# Validação visual dos dashboards

O Fiscal termina após Relevância Econômica das Partes do Contrato. Os roteiros
vigentes são `fiscal-visual-reform.visual.mjs`, `fiscal-queue-filters.visual.mjs`,
`fiscal-refresh.visual.mjs` e `gc035-prototype.visual.mjs` (três rotas).
Consultas de itens, CSV de itens, ordenação, paginação e distribuição de faixas
foram excluídos definitivamente do Fiscal, junto dos roteiros exclusivos.
Fixtures de itens ainda referenciadas por regressões gerenciais são preservadas.
Os roteiros VIS abaixo são históricos e gerenciais; para o Fiscal use os atuais.

Runtime: Node 22, Playwright e Chromium temporários, Vite local e respostas
HTTP interceptadas. Não inicia backend nem consulta banco/SAC oficial. Comandos
atuais e evidências: `docs/visual/FISCAL-reformulacao.md`.

## Vigência contratual relativa à referência

A transformação de datas continua coberta por `contract-expiry.test.tsx` e pelo
roteiro atual `fiscal-visual-reform.visual.mjs`, nas vigências e alertas executivos.
O roteiro histórico de tabelas de vigência foi retirado por depender de painéis
que já não existem. Os campos de data e contratos HTTP permanecem intactos.

## Filtros locais da fila fiscal

Com o mesmo preview Vite e Chromium acima:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/fiscal-queue-filters.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/queue-fixture.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-queue-filters.visual.mjs \
  /tmp/sac-fiscal-visual/queue-fixture.cjs /tmp/sac-fiscal-visual/queue-captures
```

A fixture contém quatro OS, múltiplas pendências abertas/em tratamento,
descrições e fornecedor ausentes e contratos com o mesmo número, mas IDs
diferentes. Usa apenas os campos existentes da resposta e valida o schema HTTP.
Os refreshes testados recebem respostas sintéticas pelo navegador; a consulta
externa é apenas um disparador do carregamento já existente e nunca chega ao
backend ou Projeto de KPIs.

O roteiro confere filtros combinados, correspondência na mesma pendência,
quantidade oculta, contagem por OS, card e demais painéis preservados, ausência
de requisições adicionais pelos filtros, teclado (setas/Tab/Enter), foco visível,
preservação no mesmo contexto, reinício por usuário/escopo, não ampliação da
carteira ao limpar filtros, fonte indisponível, fila vazia e recorte sem resultado.
Roda em desktop e 390 px, gera capturas e `report.json` somente no diretório
informado e não acessa o banco. Testes de unidade também cobrem unidade/data de
referência, busca sem acentos, pendências nulas e opções de contrato removidas.

O mesmo roteiro também valida **Exportar CSV** por teclado em desktop e 390 px:
confere nome com a data de referência, bytes do BOM UTF-8, linha da pendência
visível após filtros combinados, ausência das pendências ocultas e manutenção
de filtros/contagem/card sem novas requisições. Verifica botão desabilitado nos
três estados sem dados exportáveis. O download é lido no armazenamento
temporário do Playwright, sem ser incorporado ao projeto. Os testes
`queue-csv.test.ts` cobrem múltiplas pendências, campos ausentes, fallback,
acentos, aspas, separadores, quebras de linha e proteção contra fórmulas.

## Atualização manual fiscal

Com o mesmo preview Vite e bundle `queue-fixture.cjs` da fila, execute:

```bash
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-refresh.visual.mjs \
  /tmp/sac-fiscal-visual/queue-fixture.cjs /tmp/sac-fiscal-visual/refresh-captures
```

Controla respostas exclusivamente no navegador, em desktop e 390 px. Valida
Tab/Enter e foco, bloqueio de cliques, dados/filtros visíveis enquanto carrega,
falha HTTP 500 sem apagar a última resposta, tentativa e recuperação, retenção
de opção desaparecida sem ampliar o recorte, descarte de resposta antiga após
escopo novo e horário `generatedAt` no fuso recebido. PNGs/relatório ficam no
diretório temporário informado. Não usa o banco nem a API oficial.

## VIS-002 — Fidelidade React/Recharts

A referência principal de organização, componentes e apresentação passa a ser
`ETICE_Dashboard_Fiscal_React_Recharts.html` e
`ETICE_Dashboard_Gerente_Contratos_React_Recharts.html`. Autocontido v4 ABC é
referência secundária. Consulte `docs/visual/VIS-002.md` para divergências
intencionais e decisões funcionais preservadas.

```bash
node_modules/.bin/esbuild scripts/test/fixtures/dashboard-fidelity.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/vis002-fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/dashboard-fidelity.visual.mjs \
  /tmp/sac-fiscal-visual/vis002-fixtures.cjs /tmp/vis002
```

Em desktop 1440 px, tablet 900 px e 390 px, valida os dois gráficos reais
Recharts, quatro faixas, filtros combinados, sem resultados com zero real,
sem itens, indisponibilidade, falha de carregamento, sequência dos painéis,
anéis preventivos e ausência de transbordamento. Capturas de página inteira,
roscas e recortes ficam no diretório temporário com `report.json`. As fixtures
são sintéticas e isoladas; nenhuma chamada chega ao backend ou banco.
A cobertura de itens permanece no gerente. Para testes jsdom use
Node compatível com as dependências instaladas (runtime de validação: Node 22).

## VIS-003 — Organização, proporções e saldo consolidado

O lote e as divergências intencionais estão em `docs/visual/VIS-003.md`.
Com o preview local e Chromium acima:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/dashboard-layout.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/vis003-fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/dashboard-layout.visual.mjs \
  /tmp/sac-fiscal-visual/vis003-fixtures.cjs /tmp/vis003
```

Roda em 1440, 900 e 390 px, verifica sequência DOM, área complementar,
proporção 1,25:1, colunas dos KPIs, contagens e filtros das roscas, saldo
contratual com zero/nulo/negativo/acima de 100%, seis dimensões da matriz,
seleção por teclado e retorno do foco, filtros da matriz e anéis de 50%/0%.
Confere ausência de overflow na página e gera capturas da implementação e dos
protótipos locais. Requisições das telas são interceptadas; consultas dos
protótipos são abortadas. Nenhum backend, SAC oficial ou banco é acessado.

Reexecute também os roteiros atuais de fila e atualização manual,
com `FISCAL_PREVIEW_URL` apontando para a mesma porta. Use Node 22 para a suíte
jsdom. Capturas/relatórios ficam somente em `/tmp`, sem assets demonstrativos
ou fixtures no fluxo de produção.

## VIS-004 — Fila compacta e carga gerencial

Com o preview Vite e Chromium descritos acima, execute:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/dashboard-density.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/vis004-fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/dashboard-density.visual.mjs \
  /tmp/sac-fiscal-visual/vis004-fixtures.cjs /tmp/vis004
```

O roteiro de carga cobre seis estados em 1440, 900 e 390 px: múltiplos fiscais
com valores distintos/zero, somente zero, 30 fiscais/nome extenso, lista vazia,
fonte indisponível e erro HTTP. Verifica escala comum, valores explícitos,
tabela integral, explicação preservada, foco por Tab e rolagem por teclado.
Captura também a fila fiscal e os dois protótipos locais para comparação.

Reexecute `fiscal-queue-filters.visual.mjs` com o bundle `queue-fixture.cjs`:
agora cobre também tablet 900 px, distribuição dos filtros, faixa compacta de
ações, notas visíveis, cabeçalho fixo, sequência Tab/Shift+Tab, CSV/BOM e estados.
Reexecute os roteiros `fiscal-refresh.visual.mjs` e
`dashboard-layout.visual.mjs` para regressão dos comportamentos e painéis
anteriores. Respostas são interceptadas e nenhuma consulta chega ao SAC/banco.
Documentação e resultados: `docs/visual/VIS-004.md`.

## VIS-005 — saldo, matriz e distribuição

Reutiliza `dashboard-layout.visual.mjs` e a fixture `dashboard-layout.ts` do
VIS-003. Além da sequência, filtros e estados já verificados, confere altura do
saldo com um contrato, 20 contratos com rolagem local (incluindo zero), nomes
extensos completos na matriz e no detalhamento, fonte legível e ordem de Tab
nos filtros. Em 390 px, busca ocupa a primeira linha e os dois seletores a segunda.
A distribuição por faixa permanece somente no gerente; o Fiscal termina no ABC.

Com o Vite na porta 5183 e Playwright/Chromium acima:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/dashboard-layout.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/vis003-fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/dashboard-layout.visual.mjs \
  /tmp/sac-fiscal-visual/vis003-fixtures.cjs /tmp/vis005-final
```

As capturas incluem os dois protótipos locais nos três tamanhos. Reexecutar os
roteiros VIS-004 de densidade e fila com as respectivas
fixtures descritas acima, usando a mesma URL e diretórios de saída separados.
Nenhuma fixture ou dado demonstrativo é incluído no frontend de produção.

## GC-034 — filtros globais do gerente

Roteiro histórico do GC-034. Ele pressupõe a navegação em abas removida no
GC-035; para a estrutura atual, execute o roteiro GC-035 abaixo.

Com Vite local na porta 5183 e o módulo Playwright/Chromium disponível:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/manager-global-filters.ts \
  --bundle --platform=node --format=esm --outfile=/tmp/gc034-fixtures.mjs
PLAYWRIGHT_MODULE=/tmp/vis006-browser/node_modules/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/opt/google/chrome/chrome \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/manager-global-filters.visual.mjs \
  /tmp/gc034-fixtures.mjs /tmp/gc034-captures
```

O roteiro intercepta todas as requisições `/api/**` com dados sintéticos, valida Fiscal e Gerente em 1440, 900 e 390 px nas duas abas, filtros, teclado e overflow horizontal da página. Não inicia SAM nem acessa banco ou SAC oficial.

## GC-035B/GC-035C — três páginas independentes

O roteiro GC-035 substitui as verificações visuais históricas que pressupunham
abas e painéis complementares. No computador local, inicie o preview em um terminal:

```bash
npm run dev --workspace @sac-etice-bi/web -- --host 127.0.0.1 --port 5183 --strictPort
```

Em outro terminal, na raiz do repositório, gere os dois bundles e execute a
regressão básica seguida dos estados recentes. Playwright e Chromium são os
caminhos já validados nesse computador; as capturas e relatórios ficam em `/tmp`:

```bash
mkdir -p /tmp/gc035-visual
node_modules/.bin/esbuild scripts/test/fixtures/manager-global-filters.ts \
  --bundle --platform=node --format=esm --outfile=/tmp/gc035-visual/base-fixtures.mjs
node_modules/.bin/esbuild scripts/test/fixtures/gc035-recent-states.ts \
  --bundle --platform=node --format=esm --outfile=/tmp/gc035-visual/recent-fixtures.mjs
PLAYWRIGHT_MODULE=/tmp/sac-bi-browser/node_modules/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/usr/bin/google-chrome \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/gc035-prototype.visual.mjs \
  /tmp/gc035-visual/base-fixtures.mjs /tmp/gc035-visual/basico
PLAYWRIGHT_MODULE=/tmp/sac-bi-browser/node_modules/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/usr/bin/google-chrome \
FISCAL_PREVIEW_URL=http://127.0.0.1:5183 \
  node scripts/test/gc035-recent-states.visual.mjs \
  /tmp/gc035-visual/recent-fixtures.mjs /tmp/gc035-visual/estados-recentes
```

O roteiro complementar intercepta todas as chamadas `/api/**` com fixtures
validadas pelos schemas e cobre 13 cenários em 1440, 900 e 390 px na Supervisão
e Visão agregada: saldos vazios/zerados/medidos, fiscais no recorte,
referências incompatíveis e nova tentativa de fornecedores. Cada cenário gera
captura, inclusive em falha, e `estados-recentes/report.json` identifica o
resultado por viewport. Falhas retornam código diferente de zero. Nenhum dado
vai ao backend ou banco. A rota Fiscal permanece na regressão básica.

O roteiro usa apenas fixtures HTTP sintéticas e os protótipos locais. Gera
capturas comparativas do Fiscal, da Supervisão e da Visão agregada em 1440,
900 e 390 px, cada qual contra seu próprio protótipo. Confere ordem, tabelas,
foco por teclado e ausência de overflow horizontal da página.
Na Supervisão, também confere subtítulo, quatro alertas, posição dos filtros,
gráfico combinado e radar. Os valores demonstrativos dos HTMLs não entram nas
respostas da aplicação.

Na GC-035D, o mesmo roteiro confere ainda os quatro indicadores principais
dos saldos, o detalhe expansível dos controles e a ausência de eixos com valores
no gráfico indisponível de fornecedores estratégicos. As capturas desta etapa
ficam em `/tmp/gc035d-captures/`.

Na GC-036, o roteiro confere as colunas de intervenções em ambas as telas,
o estado de cobertura e a ausência de prioridade fictícia. As capturas são
geradas em `/tmp/gc036-captures/`, sempre com fixtures HTTP sintéticas.

## Reformulação visual fiscal

`scripts/test/fiscal-visual-reform.visual.mjs` usa o mesmo bundle ESM de
`manager-global-filters.ts` do roteiro GC-035. Confere seis KPIs, cinco dimensões
sem percentuais inventados, barra de filtros operacionais, três painéis, recortes
combinados, fonte parcial/vazia/indisponível e overflow em 1440, 900 e 390 px.
O roteiro GC-035 foi atualizado para os três painéis novos; o roteiro de fila
foi ajustado para a fila e ressalvas expansíveis; não há indicadores complementares no Fiscal.
Documentação, comandos e evidências: `docs/visual/FISCAL-reformulacao.md`.


## Cobertura recuperada dos recursos fiscais preservados

O roteiro `fiscal-visual-reform.visual.mjs` inclui os cenários fiscais de saldo
antes presentes em `dashboard-layout.visual.mjs`: 0%, -20%, 150%, percentual
nulo e 20 contratos (0% a 19%), agora no painel executivo. Verifica nomes e
percentuais acessíveis, escala real, rolagem vertical interna e ausência de
overflow horizontal em 1440, 900 e 390 px. Datas inválidas recebidas por HTTP
são rejeitadas pelo validador existente; datas válidas/nulas, filtros e recortes
vazios continuam cobertos. A página deve sempre terminar no ABC após resposta válida.

Os quatro roteiros gerenciais históricos foram apenas limpos de parênteses e
blocos artificiais, mantendo todas as asserções gerenciais. Eles documentam
composições anteriores (inclusive abas removidas); a regressão atual de Supervisão
e Visão agregada usa `gc035-prototype.visual.mjs`. Não executar os roteiros
fiscais excluídos de itens, faixas, paginação, ordenação, CSV de itens ou tabelas
antigas de vigência. O histórico foi identificado em
`docs/api/decisoes-contrato-fiscal.md`, sem alterar contratos HTTP.
