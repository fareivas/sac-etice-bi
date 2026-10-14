// VIS-007: isolated synthetic fixtures; all API requests are intercepted.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
        assert.deepEqual(mainTitles.slice(0, 3), [
          'Matriz Contrato × Dimensão de Risco', 'Carga e risco por fiscal', 'Intervenções gerenciais',
        ]);
        const matrixBox = await page.locator('.manager-focus-grid .manager-risk-panel').boundingBox();
        const loadBox = await page.locator('.manager-focus-grid .manager-fiscals-panel').boundingBox();
        const interventionBox = await panels.nth(0).locator('.panel-heading h2', { hasText: 'Intervenções gerenciais' }).boundingBox();
        assert.ok(matrixBox && loadBox && interventionBox);
        if (width > 700) {
          assert.ok(Math.abs(matrixBox.y - loadBox.y) < 2);
          assert.ok(matrixBox.x < loadBox.x);
        } else {
          assert.ok(matrixBox.y < loadBox.y);
        }
        assert.ok(interventionBox.y > matrixBox.y + matrixBox.height - 1);
      }

      await page.screenshot({ path: `${output}/${role}-${name}-principal.png`, fullPage: true });
      await tabs.nth(1).click();
      assert.equal(await panels.nth(0).isHidden(), true);
      assert.equal(await panels.nth(1).isVisible(), true);
      const complementaryTitles = await panels.nth(1).locator('.panel-heading h2').allTextContents();
      assert.equal(complementaryTitles[0], 'Gestão dos Saldos dos Itens Contratuais');
      if (role === 'manager') {
        assert.ok(complementaryTitles.includes('Qualidade preventiva da gestão'));
        assert.ok((await panels.nth(1).locator('.manager-secondary-metrics').innerText()).includes('Vencimento nos próximos 120 dias'));
        assert.ok((await panels.nth(1).locator('.manager-secondary-metrics').innerText()).includes('Alertas contratuais'));
      }
      const itemPanel = panels.nth(1).locator('.fiscal-saldos');
      const supplier = itemPanel.locator('.saldo-filters select').first();
      await supplier.selectOption('Fornecedor A');
      assert.equal(await supplier.inputValue(), 'Fornecedor A');
      await page.screenshot({ path: `${output}/${role}-${name}-complementar.png`, fullPage: true });
      await tabs.nth(1).focus(); await page.keyboard.press('Home');
      assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
      assert.equal(await tabs.nth(0).evaluate(element => element === document.activeElement), true);
      assert.ok(await page.locator(role === 'fiscal' ? '.fiscal-band-distribution .recharts-sector' : '.manager-band-distribution .recharts-sector').count() > 0);
      await page.keyboard.press('ArrowRight');
      assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
      assert.equal(await tabs.nth(1).evaluate(element => element === document.activeElement), true);
      await page.screenshot({ path: `${output}/${role}-${name}-teclado.png`, fullPage: false });
      assert.equal(await supplier.inputValue(), 'Fornecedor A');
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
