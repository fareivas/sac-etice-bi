# Validação visual dos detalhes de itens do Fiscal

Usa o preview Vite existente e Chromium/Playwright. Não cria rota de fixture,
modo demonstrativo ou dependência no fluxo normal da aplicação. Todas as
chamadas `/api/**` são interceptadas no navegador de teste; nenhuma chega ao
backend ou ao banco. Não execute os scripts de fixture de banco para este teste.

`fixtures/fiscal-item-details.ts` gera respostas pelo `composeItemBalances` real
e valida o schema HTTP. Inclui adequado, atenção, crítico com saldo zero e não
verificável com campos ausentes. A variante medida/quantidade usa limiares
75%/20% e inclui medição ausente com contratado válido, conforme a convenção do
serviço. A variante comprometida/valor usa os limiares padrão 60%/10%.

Para executar sem modificar as dependências do projeto, com Node 22:

```bash
npm install --prefix /tmp/sac-fiscal-visual --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node /tmp/sac-fiscal-visual/node_modules/playwright/cli.js install chromium
npm run dev --workspace @sac-etice-bi/web -- --host 127.0.0.1 --port 5181 --strictPort
```

Em outro terminal, a partir da raiz do projeto:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/fiscal-item-details.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-item-details.visual.mjs \
  /tmp/sac-fiscal-visual/fixtures.cjs /tmp/sac-fiscal-visual/captures
```

O teste navega em desktop (1440×1000) e tela estreita (390×844), expande/recolhe
por Enter/Espaço, verifica Tab, foco visível e retido, associação ARIA, valores,
explicações e limiares da API, preservação de totais/filtros, ausência de erros
JavaScript e transbordamento da página. A tabela mantém sua rolagem horizontal
local. Gera capturas de cada faixa aberta, foco por teclado e viewport, além de
`report.json`. Revise também as capturas para legibilidade visual.

Para outra porta, configure `FISCAL_PREVIEW_URL`. Os PNGs e respostas compiladas
ficam apenas no diretório de saída temporário; não contêm dados reais nem
credenciais. Encerre o Vite de teste ao concluir a revisão.

## Vigência contratual relativa à referência

Com o mesmo Vite, Playwright e Chromium acima, execute:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/fiscal-contract-expiry.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/expiry-fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-contract-expiry.visual.mjs \
  /tmp/sac-fiscal-visual/expiry-fixtures.cjs /tmp/sac-fiscal-visual/expiry-captures
```

As fixtures validam ontem/hoje/amanhã, virada de ano, ano bissexto e data ausente
nos dois painéis, além de listas históricas indisponíveis. São respostas
sintéticas válidas no contrato HTTP, nunca enviadas ao backend. Datas inválidas
são testadas diretamente no componente/helper porque o schema HTTP já as rejeita.

O navegador roda em desktop e 390 px, com fusos America/Los_Angeles e
Pacific/Kiritimati, e relógio fixado em 2040. Compara datas e textos esperados
em relação à referência da fixture (2026 ou 2024), conferindo a independência
do relógio/fuso e a nota de que vigência não é prazo de decisão. Preserva a
rolagem horizontal local das tabelas em telas estreitas e gera capturas dos
dois painéis e `report.json` no diretório temporário de saída.

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

## CSV dos itens fiscalizados

Com o mesmo preview Vite e Playwright acima:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/fiscal-items-csv.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/items-csv-fixtures.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-items-csv.visual.mjs \
  /tmp/sac-fiscal-visual/items-csv-fixtures.cjs /tmp/sac-fiscal-visual/items-csv-captures
```

As fixtures reutilizam os critérios/gerador existentes do serviço para saldo
comprometido/valor e medido/quantidade, com zero, ausentes, saldo negativo e
texto com acento, fórmula, aspas, separador e quebra de linha. Não fazem parte
do fluxo da aplicação. O roteiro intercepta todas as chamadas de API e valida
Tab/Enter, foco, arquivo completo e recorte por fornecedor/contrato/faixa/busca,
nome/BOM/conteúdo, filtros e card/fila preservados, botão desabilitado sem
resultados/itens/fonte e layout em desktop/390 px. Capturas/relatório e downloads
ficam temporários; não alteram o banco. Reexecute também o roteiro da fila para
validar o codificador CSV compartilhado.

## Ordenação dos saldos dos itens

Com o bundle `items-csv-fixtures.cjs` e preview descritos acima:

```bash
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-item-sort.visual.mjs \
  /tmp/sac-fiscal-visual/items-csv-fixtures.cjs /tmp/sac-fiscal-visual/item-sort-captures
```

Valida ordem original, IDs/saldo/percentual em ambas as direções, zero, negativo,
nulos no final, filtros combinados, detalhes expandidos no mesmo item, totais e
distribuição preservados, CSV na ordem visual, atualização preservando escolha
e reset após escopo/usuário novo. Usa Tab/setas/Enter e foco em desktop/390 px,
com duas bases/dimensões da API. Todas as respostas são interceptadas; nenhuma
chamada chega ao backend ou banco. Capturas/relatório ficam temporários.

## Paginação local dos itens

Com o mesmo preview Vite e Playwright:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/fiscal-item-pagination.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/item-pagination-fixture.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-item-pagination.visual.mjs \
  /tmp/sac-fiscal-visual/item-pagination-fixture.cjs /tmp/sac-fiscal-visual/item-pagination-captures
```

A fixture tem 51 itens de dois contratos autorizados, gerados pelo serviço real
com fontes sintéticas. Todas as consultas são interceptadas no navegador. O
roteiro verifica teclado/foco em desktop/390 px, tamanhos 10/25/50, limites e
intervalos, atualização e redução de resultados, reset por filtros/ordenação e
escopo, totais/distribuição preservados, detalhes no item correto, estados vazios
e exportação completa na ordem escolhida a partir de página intermediária.
Capturas/relatório/downloads ficam temporários; não altera o banco.

## Distribuição de faixas clicável

Com o mesmo preview Vite e Playwright:

```bash
node_modules/.bin/esbuild scripts/test/fixtures/fiscal-band-distribution.ts \
  --bundle --platform=node --format=cjs --outfile=/tmp/sac-fiscal-visual/band-distribution-fixture.cjs
PLAYWRIGHT_MODULE=/tmp/sac-fiscal-visual/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/sac-fiscal-visual/browsers \
  node scripts/test/fiscal-band-distribution.visual.mjs \
  /tmp/sac-fiscal-visual/band-distribution-fixture.cjs /tmp/sac-fiscal-visual/band-distribution-captures
```

A fixture tem 96 itens em dois contratos autorizados, com as quatro faixas
calculadas pelo serviço a partir de fontes sintéticas. O roteiro intercepta
as APIs e valida Tab/Espaço/Enter, foco/aria-pressed/destaque textual, seleção,
remoção e troca sincronizadas com o seletor, contagens por fornecedor/contrato/
busca antes da faixa, preservação da ordenação, reset de página, CSV completo
após o filtro e indicadores globais intactos, em desktop/390 px. Confere também
contagens zero para filtros sem resultados, carteira sem itens e fonte
indisponível. PNGs/relatório/downloads ficam temporários; não usa o banco.

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
Reexecute também `fiscal-band-distribution.visual.mjs` para teclado, CSV,
ordenação, paginação e preservação dos demais painéis. Para testes jsdom use
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

Reexecute também os roteiros de faixas, atualização manual e detalhes acima,
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
