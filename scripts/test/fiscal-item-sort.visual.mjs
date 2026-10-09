// Test-only browser fixtures, no calls to the database or official SAC.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fixtures, responseForRequest, expectedCsv } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/item-sort-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(); const report = [];
try {
  for (const [screen, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
    for (const variant of ['committedValue', 'measuredQuantity']) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = []; let requests = 0; let current = structuredClone(fixtures[variant]);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => {
        assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo')); requests++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseForRequest(current,
          new URL(route.request().url()).searchParams.get('includeExternal') === 'true')) });
      });
      await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
      const panel = page.locator('.fiscal-saldos');
      const key = panel.getByLabel('Ordenar itens por', { exact: true });
      const direction = panel.getByLabel('Direção da ordenação', { exact: true });
      const rowIds = async () => (await panel.locator('tbody tr button').evaluateAll(buttons => buttons.map(button => Number(button.getAttribute('aria-label').match(/ID (\d+)/)[1]))));
      const totals = await panel.locator('.saldo-summary').innerText();
      const distribution = await page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: 'Distribuição dos itens por faixa', exact: true }) }).innerText();
      const cards = await page.locator('.fiscal-kpis').innerText(); const initialRequests = requests;
      assert.deepEqual(await rowIds(), [101, 102, 103, 104, 105]); assert.equal(await direction.isDisabled(), true);
      const detail = panel.getByRole('button', { name: 'Expandir detalhes do item ID 101', exact: true });
      await detail.click();
      await key.focus(); assert.notEqual(await key.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
      assert.equal(await key.inputValue(), 'balance'); assert.deepEqual(await rowIds(), [105, 103, 102, 101, 104]);
      await page.keyboard.press('Tab'); assert.equal(await direction.evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('ArrowDown'); assert.equal(await direction.inputValue(), 'desc');
      assert.deepEqual(await rowIds(), [101, 102, 103, 105, 104]);
      const expanded = panel.getByRole('button', { name: 'Recolher detalhes do item ID 101', exact: true });
      assert.equal(await expanded.getAttribute('aria-expanded'), 'true');
      assert.equal(await panel.locator('tbody tr').first().getByRole('region', { name: 'Detalhes do item ID 101' }).isVisible(), true);
      assert.equal(await panel.locator('.saldo-summary').innerText(), totals);
      assert.equal(await page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: 'Distribuição dos itens por faixa', exact: true }) }).innerText(), distribution);
      assert.equal(await page.locator('.fiscal-kpis').innerText(), cards); assert.equal(requests, initialRequests);
      const download = async expected => {
        const event = page.waitForEvent('download');
        await panel.getByRole('button', { name: 'Exportar itens CSV', exact: true }).focus(); await page.keyboard.press('Enter');
        const file = await event; assert.equal(await file.failure(), null);
        assert.equal((await readFile(await file.path())).toString('utf8'), expectedCsv(current, expected));
      };
      await download([101, 102, 103, 105, 104]);
      await direction.focus(); await direction.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${screen}-${variant}-descending.png` });
      await key.selectOption('ratio'); assert.deepEqual(await rowIds(), [101, 102, 103, 105, 104]);
      await direction.selectOption('asc'); assert.deepEqual(await rowIds(), [105, 103, 102, 101, 104]);
      await key.selectOption('identity'); await direction.selectOption('desc'); assert.deepEqual(await rowIds(), [105, 104, 103, 102, 101]);
      await key.selectOption('source'); assert.deepEqual(await rowIds(), [101, 102, 103, 104, 105]);
      // Combine every local filter; sorting remains a separate choice.
      await key.selectOption('balance'); await direction.selectOption('desc');
      const filters = panel.locator('.saldo-filters select');
      await filters.nth(0).selectOption('Fornecedor de teste'); await filters.nth(1).selectOption('2'); await filters.nth(2).selectOption('adequado');
      await panel.locator('.saldo-filters input').fill('CAFÉ'); assert.deepEqual(await rowIds(), [101]); await download([101]);
      const refresh = async () => {
        await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => !document.querySelector('.fiscal-refresh button').disabled);
      };
      current.meta.generatedAt = '2026-10-09T01:35:42Z'; await refresh();
      assert.equal(await key.inputValue(), 'balance'); assert.equal(await direction.inputValue(), 'desc');
      assert.equal(await panel.locator('.saldo-filters input').inputValue(), 'CAFÉ'); assert.deepEqual(await rowIds(), [101]);
      current.data.fiscal.userId = 88; current.meta.filtersApplied.contratoId = [2]; await refresh();
      assert.equal(await key.inputValue(), 'source'); assert.equal(await direction.inputValue(), 'asc');
      assert.deepEqual(await rowIds(), [101, 102, 103, 104, 105]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
      report.push({ screen, variant, result: 'PASS', keyboard: true, originalAndNumericOrder: true, missingLast: true,
        detailsAssociated: true, aggregatesPreserved: true, filteredCsvOrder: true, refreshPreservesAndScopeResets: true, noBackendCalls: true });
      await page.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', cases: report.length, output, report }, null, 2));
