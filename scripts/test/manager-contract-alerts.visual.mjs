// GC-033: isolated synthetic fixtures; all API requests are intercepted.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { fiscal, manager, load, suppliers, responseForRequest } = await import(pathToFileURL(resolve(process.argv[2])).href);
const output = resolve(process.argv[3] ?? '/tmp/vis006');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
const report = [];
try {
  for (const [name, width, height] of [['1440', 1440, 1000], ['900', 900, 1000], ['390', 390, 844]]) {
    for (const role of ['fiscal', 'manager']) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = []; let requests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => {
        requests++;
        const url = route.request().url();
        if (url.includes('/fiscais/carga'))
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(load) });
        if (url.includes('/fornecedores/resumo'))
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(suppliers) });
        assert.ok(url.includes('/dashboard/resumo'));
        const body = role === 'fiscal' ? responseForRequest(fiscal, new URL(url).searchParams.get('includeExternal') === 'true') : manager;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(`${process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183'}${role === 'manager' ? '/gerente-contratos' : '/'}`, { waitUntil: 'networkidle' });
      const tabs = page.getByRole('tab'); const panels = page.getByRole('tabpanel', { includeHidden: true });
      assert.equal(await tabs.count(), 2);
      assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
      assert.equal(await panels.nth(1).isHidden(), true);
      for (let i = 0; i < 2; i++) {
        assert.equal(await tabs.nth(i).getAttribute('aria-controls'), await panels.nth(i).getAttribute('id'));
        assert.equal(await panels.nth(i).getAttribute('aria-labelledby'), await tabs.nth(i).getAttribute('id'));
      }
      const initial = requests;
      const mainTitles = await panels.nth(0).locator('.panel-heading h2').allTextContents();
      assert.ok(mainTitles.includes(role === 'fiscal' ? 'Distribuição dos itens por faixa' : 'Curva ABC de Fornecedores'));
      assert.ok(!mainTitles.includes('Gestão dos Saldos dos Itens Contratuais'));
      if (role === 'manager') {
        assert.deepEqual(await panels.nth(0).locator('.manager-kpis .fiscal-kpi > span').allTextContents(), [
          'Contratos monitorados', 'Contratos críticos', 'Valor contratado', 'Renovações atrasadas',
          'SLA abaixo da meta', 'Intervenções gerenciais',
        ]);
        assert.deepEqual(mainTitles, [
          'Matriz Contrato × Dimensão de Risco', 'Carga e risco por fiscal',
          'Intervenções e pendências contratuais', 'Forecast 180 dias', 'Exposição financeira',
          'Qualidade da gestão', 'Eficiência do Ciclo Financeiro — carteira gerenciada',
          'Curva ABC de Fornecedores', 'Curva ABC de Clientes',
        ]);
        assert.deepEqual(await panels.nth(0).locator('.manager-overview-grid > section h2').allTextContents(),
          ['Forecast 180 dias', 'Exposição financeira', 'Qualidade da gestão']);
        assert.deepEqual(await panels.nth(0).locator('.manager-abc-pair > section h2').allTextContents(),
          ['Curva ABC de Fornecedores', 'Curva ABC de Clientes']);
        assert.equal(await panels.nth(0).locator('.manager-strategic, .manager-band-distribution').count(), 0);
        assert.equal(await panels.nth(0).locator('.manager-quality-bar').count(), 2);
        assert.deepEqual(await panels.nth(0).locator('.manager-exposure-rows span').allTextContents(),
          ['SLA / glosas', 'Medições', 'Pagamento']);
        assert.ok((await panels.nth(0).locator('.manager-exposure-rows').innerText()).includes('Indisponível'));
        assert.equal(await panels.nth(0).locator('.manager-cycle-flow > div').count(), 7);
        const matrixBox = await page.locator('.manager-focus-grid .manager-risk-panel').boundingBox();
        const loadBox = await page.locator('.manager-focus-grid .manager-fiscals-panel').boundingBox();
        const interventionBox = await panels.nth(0).locator('.panel-heading h2', { hasText: 'Intervenções e pendências contratuais' }).boundingBox();
        assert.ok(matrixBox && loadBox && interventionBox);
        if (width > 700) {
          assert.ok(Math.abs(matrixBox.y - loadBox.y) < 2);
          assert.ok(matrixBox.x < loadBox.x);
        } else {
          assert.ok(matrixBox.y < loadBox.y);
        }
        assert.ok(interventionBox.y > matrixBox.y + matrixBox.height - 1);
        const overviewBoxes = await panels.nth(0).locator('.manager-overview-grid > section').evaluateAll(elements =>
          elements.map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y }; }));
        const abcBoxes = await panels.nth(0).locator('.manager-abc-pair > section').evaluateAll(elements =>
          elements.map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y }; }));
        if (width > 650) {
          assert.ok(Math.max(...overviewBoxes.map(box => box.y)) - Math.min(...overviewBoxes.map(box => box.y)) < 2);
          assert.ok(overviewBoxes[0].x < overviewBoxes[1].x && overviewBoxes[1].x < overviewBoxes[2].x);
          assert.ok(Math.abs(abcBoxes[0].y - abcBoxes[1].y) < 2 && abcBoxes[0].x < abcBoxes[1].x);
        } else {
          assert.ok(overviewBoxes[0].y < overviewBoxes[1].y && overviewBoxes[1].y < overviewBoxes[2].y);
          assert.ok(abcBoxes[0].y < abcBoxes[1].y);
        }

      }

      await page.screenshot({ path: `${output}/${role}-${name}-principal.png`, fullPage: true });
      if (role === 'manager') {
        const controls = page.getByRole('group', { name: 'Filtros das pendências contratuais' });
        assert.equal(await controls.getByRole('combobox').count(), 3);
        assert.ok((await page.locator('.manager-alert-actions').innerText()).includes('3 de 3'));
        assert.deepEqual(await page.locator('.manager-alert-group h3').allTextContents(),
          ['13/2025 2 pendências', '20/2022 1 pendência']);
        await controls.getByLabel('Contrato').selectOption('2');
        await controls.getByLabel('Tipo').selectOption('value:designacao_ausente');
        await controls.getByLabel('Estado').selectOption('em_tratamento');
        await controls.getByLabel('Pesquisar pendências').fill('FISCAL ARVORE');
        assert.ok((await page.locator('.manager-alert-actions').innerText()).includes('1 de 3'));
        assert.equal(await page.locator('.manager-alert-group tbody tr').count(), 1);
        assert.ok((await page.locator('.manager-alert-group').innerText()).includes('Antiguidade: 5 dias'));
        assert.ok((await page.locator('.manager-risk-observations').innerText()).includes('13/2025'));
        const [download] = await Promise.all([
          page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar pendências CSV' }).click(),
        ]);
        const csv = await readFile(await download.path(), 'utf8');
        assert.ok(csv.includes('Conferir registro do fiscal Árvore'));
        assert.ok(!csv.includes('Vigência próxima'));
        assert.ok(!csv.includes('Revisar vigência'));
        await page.screenshot({ path: `${output}/${role}-${name}-filtrado.png`, fullPage: true });
      }

      await tabs.nth(1).click();
      assert.equal(await panels.nth(0).isHidden(), true);
      assert.equal(await panels.nth(1).isVisible(), true);
      const complementaryTitles = await panels.nth(1).locator('.panel-heading h2').allTextContents();
      assert.equal(complementaryTitles[0], 'Gestão dos Saldos dos Itens Contratuais');
      if (role === 'manager') {
        assert.ok(complementaryTitles.includes('Fornecedores estratégicos: valor × risco'));
        assert.ok(complementaryTitles.includes('Distribuição dos itens por faixa de saldo'));
        assert.ok(!complementaryTitles.includes('Qualidade da gestão'));
        assert.ok((await panels.nth(1).locator('.manager-secondary-metrics').innerText()).includes('Vencimento nos próximos 120 dias'));
        assert.ok((await panels.nth(1).locator('.manager-secondary-metrics').innerText()).includes('Alertas contratuais'));
      }
      const itemPanel = panels.nth(1).locator('.fiscal-saldos');
      const supplier = itemPanel.locator('.saldo-filters select').first();
      await supplier.selectOption('Fornecedor A');
      assert.equal(await supplier.inputValue(), 'Fornecedor A');
      if (role === 'manager') assert.ok((await page.locator('.manager-alert-actions').innerText()).includes('1 de 3'));
      await page.screenshot({ path: `${output}/${role}-${name}-complementar.png`, fullPage: true });
      await tabs.nth(1).focus(); await page.keyboard.press('Home');
      assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
      assert.equal(await tabs.nth(0).evaluate(element => element === document.activeElement), true);
      assert.ok(await page.locator(role === 'fiscal' ? '.fiscal-band-distribution .recharts-sector' : '.manager-fiscal-chart-wrap svg').count() > 0);
      await page.keyboard.press('ArrowRight');
      assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
      assert.equal(await tabs.nth(1).evaluate(element => element === document.activeElement), true);
      if (role === 'manager') assert.ok(await panels.nth(1).locator('.manager-band-distribution .recharts-sector').count() > 0);
      await page.screenshot({ path: `${output}/${role}-${name}-teclado.png`, fullPage: false });
      assert.equal(await supplier.inputValue(), 'Fornecedor A');
      if (role === 'manager') {
        assert.ok((await page.locator('.manager-alert-actions').innerText()).includes('1 de 3'));
        await tabs.nth(0).click();
        await page.getByRole('button', { name: 'Limpar filtros' }).click();
        assert.ok((await page.locator('.manager-alert-actions').innerText()).includes('3 de 3'));
      }
      assert.equal(requests, initial);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      report.push({ role, viewport: name, requests, mainTitles, complementaryTitles, result: 'PASS' });
      await page.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, cases: report.length, result: 'PASS' }));
