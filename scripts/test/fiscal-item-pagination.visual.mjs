// Browser-only controlled responses. No access to the database or official SAC.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fixture, responseForRequest, expectedCsv } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/item-pagination-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(); const report = [];
try {
  for (const [screen, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; let requests = 0; let current = structuredClone(fixture);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo')); requests++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseForRequest(current,
        new URL(route.request().url()).searchParams.get('includeExternal') === 'true')) });
    });
    await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    const panel = page.locator('.fiscal-saldos'); const nav = panel.getByRole('navigation', { name: 'Paginação local dos itens' });
    const size = nav.getByLabel('Itens por página', { exact: true });
    const previous = nav.getByRole('button', { name: 'Página anterior', exact: true });
    const next = nav.getByRole('button', { name: 'Próxima página', exact: true });
    const rowIds = () => panel.locator('tbody tr button').evaluateAll(buttons => buttons.map(button => Number(button.getAttribute('aria-label').match(/ID (\d+)/)[1])));
    assert.equal(await size.inputValue(), '25'); assert.equal((await rowIds()).length, 25);
    assert.ok((await nav.innerText()).includes('1–25 de 51 itens filtrados · Página 1 de 3'));
    const totals = await panel.locator('.saldo-summary').innerText();
    const distribution = await page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: 'Distribuição dos itens por faixa', exact: true }) }).innerText();
    const initialRequests = requests;
    await size.focus(); assert.notEqual(await size.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.keyboard.press('ArrowUp'); assert.equal(await size.inputValue(), '10');
    await page.keyboard.press('Tab'); assert.equal(await next.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.ok((await nav.innerText()).includes('21–30 de 51 itens filtrados · Página 3 de 6'));
    assert.deepEqual(await rowIds(), Array.from({ length: 10 }, (_, i) => 1021 + i));
    await next.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${screen}-page-three.png` });
    await previous.focus(); await page.keyboard.press('Enter');
    assert.ok((await nav.innerText()).includes('Página 2 de 6'));
    const detail = panel.getByRole('button', { name: 'Expandir detalhes do item ID 1011', exact: true });
    await detail.click(); assert.equal(await panel.getByRole('region', { name: 'Detalhes do item ID 1011' }).isVisible(), true);
    await next.click(); assert.equal(await panel.getByRole('region', { name: 'Detalhes do item ID 1011' }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Expandir detalhes do item ID 1021', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.equal(await panel.locator('.saldo-summary').innerText(), totals);
    assert.equal(await page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: 'Distribuição dos itens por faixa', exact: true }) }).innerText(), distribution);
    assert.equal(requests, initialRequests);
    const refresh = async () => {
      await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => !document.querySelector('.fiscal-refresh button').disabled);
    };
    await refresh(); assert.ok((await nav.innerText()).includes('Página 3 de 6')); assert.equal(await size.inputValue(), '10');
    current.data.itemBalances.itens = current.data.itemBalances.itens.slice(0, 11); await refresh();
    assert.ok((await nav.innerText()).includes('11–11 de 11 itens filtrados · Página 2 de 2')); assert.equal(await next.isDisabled(), true);
    current = structuredClone(fixture); await refresh(); assert.ok((await nav.innerText()).includes('Página 2 de 6'));
    const key = panel.getByLabel('Ordenar itens por', { exact: true });
    const direction = panel.getByLabel('Direção da ordenação', { exact: true });
    await key.selectOption('identity'); await direction.selectOption('desc');
    assert.ok((await nav.innerText()).includes('Página 1 de 6'));
    await next.click(); assert.deepEqual(await rowIds(), Array.from({ length: 10 }, (_, i) => 1041 - i));
    const download = async ids => {
      const event = page.waitForEvent('download');
      await panel.getByRole('button', { name: 'Exportar itens CSV', exact: true }).focus(); await page.keyboard.press('Enter');
      const file = await event; assert.equal(await file.failure(), null);
      assert.equal((await readFile(await file.path())).toString('utf8'), expectedCsv(current, ids));
    };
    await download(Array.from({ length: 51 }, (_, i) => 1051 - i));
    assert.ok((await panel.locator('.fiscal-items-export').innerText()).includes('não apenas a página atual'));
    await size.selectOption('50'); assert.ok((await nav.innerText()).includes('Página 1 de 2')); await next.click();
    assert.deepEqual(await rowIds(), [1001]); assert.equal(await next.isDisabled(), true);
    const filters = panel.locator('.saldo-filters select');
    await filters.nth(0).selectOption('Fornecedor A'); await filters.nth(1).selectOption('2'); await filters.nth(2).selectOption('adequado');
    await panel.locator('.saldo-filters input').fill('Serviço');
    assert.ok((await nav.innerText()).includes('1–30 de 30 itens filtrados · Página 1 de 1'));
    await download(Array.from({ length: 30 }, (_, i) => 1030 - i));
    await panel.locator('.saldo-filters input').fill('sem correspondência');
    assert.ok((await nav.innerText()).includes('0–0 de 0 itens filtrados · Página 0 de 0'));
    assert.ok((await panel.innerText()).includes('Nenhum item encontrado com os filtros atuais.'));
    assert.equal(await previous.isDisabled(), true); assert.equal(await next.isDisabled(), true);
    current.data.fiscal.userId = 88; current.meta.filtersApplied.contratoId = [2, 184]; await refresh();
    assert.equal(await size.inputValue(), '25'); assert.ok((await nav.innerText()).includes('Página 1 de 3'));
    current.data.itemBalances.itens = []; await refresh();
    assert.ok((await panel.innerText()).includes('Sem itens cadastrados')); assert.ok((await nav.innerText()).includes('0–0 de 0'));
    current.data.itemBalances = { coverage: 'UNAVAILABLE' }; await refresh();
    assert.equal(await nav.count(), 0); assert.ok((await panel.innerText()).includes('Fonte de saldos por item indisponível'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
    report.push({ screen, result: 'PASS', keyboard: true, boundaries: true, refreshAndReduction: true, scopeReset: true,
      aggregatesPreserved: true, filtersAndSortResetPage: true, completeOrderedCsv: true, detailsAssociated: true, emptyStates: true, noBackendCalls: true });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', cases: report.length, output, report }, null, 2));
