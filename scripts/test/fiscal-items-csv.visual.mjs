// Isolated browser-only fixtures. All API requests are intercepted; no database access.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fixtures, responseForRequest, expectedCsv } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/items-csv-captures');
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
      const button = panel.getByRole('button', { name: 'Exportar itens CSV', exact: true });
      const controls = panel.locator('.saldo-filters select');
      const search = panel.locator('.saldo-filters input');
      const initialRequests = requests;
      const queueText = await page.locator('.fiscal-action-queue').innerText();
      const cards = await page.locator('.fiscal-kpis').innerText();
      const download = async ids => {
        await button.focus(); assert.equal(await button.evaluate(el => el === document.activeElement), true);
        assert.notEqual(await button.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
        const event = page.waitForEvent('download'); await page.keyboard.press('Enter'); const file = await event;
        assert.equal(file.suggestedFilename(), `itens-fiscal-${current.meta.dataReference}.csv`);
        assert.equal(await file.failure(), null); const bytes = await readFile(await file.path());
        assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
        assert.equal(bytes.toString('utf8'), expectedCsv(current, ids));
        return bytes.toString('utf8');
      };
      const all = await download([101, 102, 103, 104, 105]);
      assert.ok(all.includes('"-100";"-200"')); assert.ok(!all.includes("'-100"));
      assert.ok(all.includes('"\'=Serviço; ""café""\nNova linha"'));
      // Tab from the export control reaches the first native item filter.
      await page.keyboard.press('Tab'); assert.equal(await controls.nth(0).evaluate(el => el === document.activeElement), true);
      await controls.nth(0).selectOption('Fornecedor de teste');
      await controls.nth(1).selectOption('2'); await controls.nth(2).selectOption('adequado'); await search.fill('CAFÉ');
      assert.ok((await panel.innerText()).includes('1 de 5 itens encontrados'));
      const filtered = await download([101]); assert.ok(!filtered.includes(';"105";'));
      assert.equal(await search.inputValue(), 'CAFÉ'); assert.equal(await controls.nth(2).inputValue(), 'adequado');
      assert.equal(requests, initialRequests); assert.equal(await page.locator('.fiscal-action-queue').innerText(), queueText);
      assert.equal(await page.locator('.fiscal-kpis').innerText(), cards);
      assert.equal(await page.getByRole('button', { name: 'Exportar CSV', exact: true }).isEnabled(), true);
      await button.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${screen}-${variant}-filtered.png` });
      await search.fill('sem correspondência'); assert.equal(await button.isDisabled(), true);
      const refresh = async () => {
        await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click();
        await page.waitForLoadState('networkidle'); await page.waitForFunction(() => !document.querySelector('.fiscal-refresh button').disabled);
      };
      current.data.itemBalances.itens = [];
      current.data.itemBalances.resumo = { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 };
      current.data.itemBalances.agregados = { totalContratado: 0, saldoComprometido: 0, saldoMedido: 0, itemCount: 0,
        completeValueRows: 0, contractedValueRows: 0, committedBalanceRows: 0, measuredBalanceRows: 0 };
      await refresh(); assert.equal(await button.isDisabled(), true); assert.ok((await panel.innerText()).includes('Sem itens cadastrados'));
      current.data.itemBalances = { coverage: 'UNAVAILABLE' }; await refresh();
      assert.equal(await button.isDisabled(), true); assert.ok((await panel.innerText()).includes('Fonte de saldos por item indisponível'));
      assert.equal(await page.getByRole('button', { name: 'Exportar CSV', exact: true }).isEnabled(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
      report.push({ screen, variant, result: 'PASS', keyboard: true, exactDownload: true, combinedFilters: true,
        negativesAndMissingFields: true, disabledEmptyAndUnavailable: true, queueAndCardsPreserved: true, noBackendCalls: true });
      await page.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', cases: report.length, output, report }, null, 2));
