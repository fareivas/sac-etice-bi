// VIS-004: all dashboard requests are intercepted with isolated schema-valid fixtures.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fiscal, manager, suppliers, loads, responseForRequest } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/vis004');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const [screen, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 900, 1000],
    ['narrow', 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    let current = loads.multiple;
    let fail = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/fiscais/carga'))
        return route.fulfill({
          status: fail ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify(current),
        });
      if (url.includes('/fornecedores/resumo'))
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(suppliers),
        });
      assert.ok(url.includes('/dashboard/resumo'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/fiscais/me/')
            ? responseForRequest(fiscal, new URL(url).searchParams.get('includeExternal') === 'true')
            : manager
        ),
      });
    });
    const url = process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183';
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('.fiscal-action-queue').screenshot({ path: `${output}/fiscal-${screen}.png` });
    const panel = page.locator('.manager-fiscals-panel');
    for (const [scenario, response] of Object.entries(loads)) {
      current = response;
      await page.goto(`${url}/gerente-contratos`, { waitUntil: 'networkidle' });
      const chart = panel.locator('.manager-fiscal-chart-wrap');
      const rows = response.data.inspectors;
      if (rows?.length) {
        const names = await panel.locator('tbody tr td:first-child').allTextContents();
        assert.equal(names.length, rows.length);
        assert.deepEqual(await chart.locator('.manager-fiscal-name').allTextContents(), names);
        const tableValues = await panel
          .locator('tbody tr')
          .evaluateAll((elements) =>
            elements.flatMap((el) => [el.cells[1].textContent, el.cells[2].textContent])
          );
        assert.deepEqual(await chart.locator('.manager-fiscal-value').allTextContents(), tableValues);
        assert.equal(await chart.locator('g[aria-label]').count(), rows.length);
        const max = Math.max(0, ...rows.flatMap((row) => [row.activeContracts, row.pendingOrders]));
        const widths = await chart
          .locator('rect')
          .evaluateAll((elements) => elements.map((el) => Number(el.getAttribute('width'))));
        tableValues.forEach((value, index) =>
          assert.ok(Math.abs(widths[index] - (max === 0 ? 0 : (Number(value) / max) * 450)) < 0.001)
        );
        assert.ok((await chart.locator('desc').textContent()).includes('iniciada em zero'));
        assert.ok(
          (await chart.locator('.manager-fiscal-chart-legend').innerText()).includes(
            'OS pendentes na carteira'
          )
        );
        assert.equal(
          await panel
            .locator('tbody tr td:nth-child(4)')
            .evaluateAll((elements) => elements.every((el) => el.textContent === 'Indisponível')),
          true
        );
        if (scenario === 'zero') {
          assert.deepEqual(widths, [0, 0]);
          assert.equal(
            await chart.locator('.manager-fiscal-chart-scroll').evaluate((el) => el.clientHeight < 130),
            true
          );
        }
        await panel.locator('.manager-fiscal-explanation summary').click();
        assert.ok(
          (await panel.locator('.manager-fiscal-explanation').innerText()).includes(
            'não representam necessariamente atribuições individuais'
          )
        );
        assert.ok(
          (await panel.locator('.manager-fiscal-explanation').innerText()).includes(
            'não devem ser somadas como OS únicas'
          )
        );
        await panel.locator('.manager-fiscal-explanation summary').click();
        await panel.screenshot({ path: `${output}/manager-${screen}-${scenario}.png` });
        const scroll = chart.locator('.manager-fiscal-chart-scroll');
        await page.keyboard.press('Tab');
        assert.equal(await scroll.evaluate(el => el === document.activeElement), true);
        assert.notEqual(await scroll.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
        if (scenario === 'many') {
          assert.ok(
            await scroll.evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 320)
          );
          await page.keyboard.press('End');
          await page.waitForFunction(
            () => document.querySelector('.manager-fiscal-chart-scroll').scrollTop > 0
          );
          assert.ok(names.some((name) => name.includes('Nome integral preservado na tabela')));
          await scroll.screenshot({ path: `${output}/manager-${screen}-many-end.png` });
        }
        if (width === 390) {
          await scroll.evaluate((el) => {
            el.scrollLeft = 0;
          });
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(
            () => document.querySelector('.manager-fiscal-chart-scroll').scrollLeft > 0
          );
        }
      } else {
        assert.equal(await chart.count(), 0);
        assert.ok(
          (await panel.innerText()).includes(
            rows === null ? 'Distribuição dos fiscais indisponível' : 'Nenhum fiscal designado'
          )
        );
        await panel.screenshot({ path: `${output}/manager-${screen}-${scenario}.png` });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      report.push({
        profile: 'manager',
        screen,
        scenario,
        result: 'PASS',
        completeTable: true,
        noBackendCalls: true,
      });
    }
    fail = true;
    await page.goto(`${url}/gerente-contratos`, { waitUntil: 'networkidle' });
    assert.ok((await panel.innerText()).includes('Erro ao carregar distribuição dos fiscais'));
    assert.equal(await panel.locator('.manager-fiscal-chart-wrap').count(), 0);
    assert.ok((await page.locator('.manager-kpis').innerText()).includes('Contratos ativos'));
    assert.deepEqual(errors, []);
    await page.close();
    report.push({ profile: 'manager', screen, scenario: 'error', result: 'PASS', noBackendCalls: true });
    for (const [role, title] of [
      ['Fiscal', 'Minha fila de ação'],
      ['Gerente_Contratos', 'Carga, criticidade e desempenho por fiscal'],
    ]) {
      const reference = await browser.newPage({ viewport: { width, height } });
      await reference.route('**/api/**', (route) => route.abort());
      await reference.goto(
        pathToFileURL(resolve(`docs/reference/prototypes/ETICE_Dashboard_${role}_React_Recharts.html`)).href
      );
      await reference.waitForTimeout(1500);
      await reference
        .locator('section.card')
        .filter({ has: reference.getByRole('heading', { name: title, exact: true }) })
        .screenshot({ path: `${output}/reference-${role}-${screen}.png` });
      await reference.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', output, cases: report.length }, null, 2));
