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
