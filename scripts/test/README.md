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
