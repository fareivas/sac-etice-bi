// VIS-003: fixtures live only in intercepted browser responses, never in production.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fiscal, manager, load, suppliers, responseForRequest } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/vis003');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const [screen, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 900, 1000],
    ['narrow', 390, 844],
  ]) {
    for (const role of ['fiscal', 'manager']) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      let requests = 0;
      let current = structuredClone(role === 'fiscal' ? fiscal : manager);
      let fail = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        requests++;
        const url = route.request().url();
        if (url.includes('/fiscais/carga') || url.includes('/fornecedores/resumo')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(url.includes('/fiscais/carga') ? load : suppliers),
          });
        }
        assert.ok(url.includes('/dashboard/resumo'));
        return route.fulfill({
          status: fail ? 500 : 200,
          contentType: 'application/json',
          body: JSON.stringify(
            role === 'fiscal'
              ? responseForRequest(current, new URL(url).searchParams.get('includeExternal') === 'true')
              : current
          ),
        });
      });
      const url = `${process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183'}${role === 'manager' ? '/gerente-contratos' : '/'}`;
      const open = () => page.goto(url, { waitUntil: 'networkidle' });
      await open();
      const chart = page.locator(
        role === 'fiscal' ? '.fiscal-band-distribution' : '.manager-band-distribution'
      );
      const legend = chart.locator('.item-band-chart-legend');
      const items = page.locator('.fiscal-saldos');
      const filters = items.locator('.saldo-filters select');
      const counts = () => legend.locator('li').allTextContents();
      const initialRequests = requests;
      assert.deepEqual(await counts(), ['Adequado: 24', 'Atenção: 24', 'Crítico: 24', 'Não verificável: 24']);
      assert.equal(await chart.locator('.recharts-sector').count(), 4);
      assert.equal(await chart.locator('.item-band-chart button').count(), 0);
      if (role === 'manager') {
        assert.deepEqual((await page.locator('.panel-heading h2').allTextContents()).slice(0, 9), [
          'Carga e risco por fiscal',
          'Qualidade preventiva da gestão',
          'Matriz Contrato × Dimensão de Risco',
          'Fornecedores estratégicos: valor × risco',
          'Intervenções gerenciais',
          'Curva ABC de Fornecedores',
          'Distribuição dos itens por faixa de saldo',
          'Gestão dos Saldos dos Itens Contratuais',
          'Eficiência do Ciclo Financeiro — carteira gerenciada',
        ]);
        assert.equal(await page.locator('[data-quality-ring]').count(), 2);
        assert.ok(
          (await page.locator('.manager-complementary').innerText()).includes('Curva ABC de Clientes')
        );
      }
      if (role === 'fiscal') {
        assert.deepEqual((await page.locator('.panel-heading h2').allTextContents()).slice(0, 7), [
          'Minha fila de ação',
          'Saúde da carteira',
          'Saldo consolidado por contrato',
          'Distribuição dos itens por faixa',
          'Gestão dos Saldos dos Itens Contratuais',
          'Ciclo financeiro do contrato',
          'Relevância Econômica das Partes do Contrato / ABC',
        ]);
        assert.deepEqual(await page.locator('.fiscal-complementary .panel-heading h2').allTextContents(), [
          'Vigências e renovações',
          'Pagamento e medição',
          'Alertas contratuais',
          'Contratos fiscalizados',
        ]);
        assert.equal(await page.locator('.fiscal-contract-chart .recharts-bar-rectangle').count(), 1);
        assert.ok(
          (await page.locator('.fiscal-contract-chart [role="img"]').getAttribute('aria-label')).includes(
            '100%'
          )
        );
      } else {
        const risk = page.locator('.manager-risk-panel');
        assert.equal(await risk.locator('.manager-risk-cell').count(), 12);
        assert.ok((await page.locator('.manager-quality-visual').innerText()).includes('50%'));
        assert.ok((await page.locator('.manager-quality-visual').innerText()).includes('0%'));
        assert.equal(await page.locator('.manager-quality-ring-progress[stroke-dasharray^="0 "]').evaluate(el => getComputedStyle(el).strokeLinecap), 'butt');
        const cell = risk.getByRole('button', { name: '13/2025, Saldo: Crítico', exact: true });
        await cell.focus();
        assert.notEqual(await cell.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
        await page.keyboard.press('Enter');
        assert.ok(
          (await risk.locator('#manager-risk-detail').innerText()).includes('Há itens não verificáveis')
        );
        await risk.getByRole('button', { name: 'Fechar detalhes' }).click();
        assert.equal(await cell.evaluate((el) => document.activeElement === el), true);
        await risk.getByLabel('Dimensão').selectOption('sla');
        await risk.getByLabel('Classificação').selectOption('UNAVAILABLE');
        assert.equal(await risk.locator('tbody tr').count(), 2);
        await risk.getByLabel('Contrato ou fornecedor', { exact: true }).fill('sem correspondência');
        assert.ok((await risk.innerText()).includes('Nenhum contrato encontrado com os filtros da matriz.'));
        await risk.getByLabel('Contrato ou fornecedor', { exact: true }).fill('');
        await risk.getByLabel('Dimensão').selectOption('all');
        await risk.getByLabel('Classificação').selectOption('all');
      }
      // Panels/cards stay in the viewport; wider tables and charts use local scrolling.
      assert.ok(
        await page.locator('.fiscal-panel, .fiscal-kpi').evaluateAll((elements) =>
          elements.every((el) => {
            const box = el.getBoundingClientRect();
            return box.left >= -1 && box.right <= innerWidth + 1;
          })
        )
      );
      assert.equal(
        await page
          .locator('.fiscal-kpis')
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
        width > 1150 ? 6 : width > 650 ? 3 : 2
      );
      const pairs = page
        .locator(role === 'fiscal' ? '.fiscal-balances-grid' : '.manager-primary-grid')
        .first();
      const boxes = await pairs.evaluate((el) =>
        [...el.children].map((child) => {
          const r = child.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
        })
      );
      if (width > 1150) {
        assert.ok(Math.abs(boxes[0].top - boxes[1].top) < 1);
        assert.ok(Math.abs(boxes[0].width / boxes[1].width - 1.25) < 0.02);
      } else {
        assert.ok(boxes[1].top >= boxes[0].bottom);
        assert.ok(Math.abs(boxes[0].left - boxes[1].left) < 1);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${output}/${role}-${screen}-viewport.png` });
      await page.screenshot({ path: `${output}/${role}-${screen}-full.png`, fullPage: true });
      await chart.screenshot({ path: `${output}/${role}-${screen}-distribution.png` });
      if (role === 'fiscal')
        await page
          .locator('.fiscal-balances-grid')
          .screenshot({ path: `${output}/fiscal-${screen}-balances.png` });
      if (role === 'manager')
        await page
          .locator('.manager-risk-panel')
          .screenshot({ path: `${output}/manager-${screen}-matrix.png` });
      await filters.nth(0).selectOption('Fornecedor A');
      await filters.nth(1).selectOption('2');
      await items.locator('.saldo-filters input').fill('SERVIÇO GRUPO A');
      assert.deepEqual(await counts(), ['Adequado: 12', 'Atenção: 12', 'Crítico: 12', 'Não verificável: 12']);
      await filters.nth(2).selectOption('critico');
      assert.deepEqual(
        await counts(),
        role === 'fiscal'
          ? ['Adequado: 12', 'Atenção: 12', 'Crítico: 12', 'Não verificável: 12']
          : ['Adequado: 0', 'Atenção: 0', 'Crítico: 12', 'Não verificável: 0']
      );
      await chart.screenshot({ path: `${output}/${role}-${screen}-filtered.png` });
      await items.locator('.saldo-filters input').fill('sem correspondência');
      assert.deepEqual(await counts(), ['Adequado: 0', 'Atenção: 0', 'Crítico: 0', 'Não verificável: 0']);
      assert.ok((await chart.innerText()).includes('Nenhum item encontrado com os filtros atuais.'));
      assert.equal(await chart.locator('.recharts-sector').count(), 0);
      assert.equal(requests, initialRequests);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (role === 'fiscal') {
        const originalBalances = current.data.contractBalances;
        current.data.contractBalances = [0, -20, 150, null].map((value, index) => ({
          contractId: [2, 184, 205, 317][index],
          contractNumber: `Saldo ${index + 1}`,
          contractedValue: value === null ? 0 : 1000,
          consumedValue: value === null ? 0 : 1000 - value * 10,
          balanceValue: value === null ? 0 : value * 10,
          balancePct: value,
        }));
        await open();
        const graph = page.locator('.fiscal-contract-chart');
        const description = await graph.locator('.fiscal-contract-chart-scroll').getAttribute('aria-label');
        for (const value of ['Saldo 1: 0%', 'Saldo 2: -20%', 'Saldo 3: 150%'])
          assert.ok(description.includes(value));
        assert.ok(!description.includes('Saldo 4: 0%'));
        assert.ok((await graph.innerText()).includes('1 contrato(s) sem percentual disponível'));
        await graph.screenshot({ path: `${output}/fiscal-${screen}-balance-extremes.png` });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        current.data.contractBalances = originalBalances;
      }
      current.data.itemBalances.itens = [];
      current.data.itemBalances.resumo = { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 };
      for (const key of Object.keys(current.data.itemBalances.agregados))
        current.data.itemBalances.agregados[key] = 0;
      if (role === 'manager')
        current.data.contractRiskMatrix.forEach((row) => {
          row.saldo = { status: 'UNAVAILABLE', partialCoverage: false, reason: 'NO_ITEMS' };
        });
      await open();
      assert.ok((await chart.innerText()).includes('Sem itens cadastrados na carteira.'));
      current.data.itemBalances = { coverage: 'UNAVAILABLE' };
      if (role === 'manager') {
        current.meta.dataCoverage.itemBalances = 'UNAVAILABLE';
        current.data.contractRiskMatrix.forEach((row) => {
          row.saldo = { status: 'UNAVAILABLE', partialCoverage: false, reason: 'ITEM_SOURCE_UNAVAILABLE' };
        });
      }
      await open();
      assert.ok((await chart.innerText()).toLowerCase().includes('indisponível'));
      assert.equal(await legend.count(), 0);
      fail = true;
      await open();
      assert.ok((await page.getByRole('alert').first().innerText()).includes('Erro ao carregar o resumo'));
      assert.equal(await chart.count(), 0);
      assert.deepEqual(errors, []);
      report.push({
        role,
        screen,
        result: 'PASS',
        distribution: true,
        localFilters: true,
        panelOrderAndProportions: true,
        kpiColumns: true,
        realZero: true,
        unavailable: true,
        noItems: true,
        loadingError: true,
        noOverflow: true,
        noBackendCalls: true,
      });
      await page.close();
    }
  }
  for (const [screen, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 900, 1000],
    ['narrow', 390, 844],
  ]) {
    for (const role of ['Fiscal', 'Gerente_Contratos']) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route('**/api/**', (route) => route.abort());
      await page.goto(
        pathToFileURL(resolve(`docs/reference/prototypes/ETICE_Dashboard_${role}_React_Recharts.html`)).href
      );
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${output}/reference-${role}-${screen}.png`, fullPage: true });
      await page.screenshot({ path: `${output}/reference-${role}-${screen}-viewport.png` });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, report }, null, 2));
