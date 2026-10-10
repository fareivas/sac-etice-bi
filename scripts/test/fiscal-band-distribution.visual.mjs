// Local browser-only fixtures. Every API call is intercepted, no shared database access.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fixture, responseForRequest, expectedCsv } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/band-distribution-captures');
await mkdir(output, { recursive: true }); const browser = await chromium.launch(); const report = [];
try {
  for (const [screen, width, height] of [['desktop', 1440, 1000], ['tablet', 900, 1000], ['narrow', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; let requests = 0; let current = structuredClone(fixture);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo')); requests++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseForRequest(current,
        new URL(route.request().url()).searchParams.get('includeExternal') === 'true')) });
    });
    await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    const distribution = page.locator('.fiscal-band-distribution'); const items = page.locator('.fiscal-saldos');
    const button = band => distribution.locator(`button[data-band="${band}"]`);
    const counts = () => distribution.locator('button span').allTextContents();
    const filters = items.locator('.saldo-filters select'); const search = items.locator('.saldo-filters input');
    const paging = items.locator('.fiscal-item-pagination');
    const next = paging.getByRole('button', { name: 'Próxima página', exact: true });
    const expected = ['Adequado: 12', 'Atenção: 12', 'Crítico: 12', 'Não verificável: 12'];
    const initialRequests = requests; const cards = await page.locator('.fiscal-kpis').innerText(); const queue = await page.locator('.fiscal-action-queue').innerText();
    assert.deepEqual(await counts(), ['Adequado: 24', 'Atenção: 24', 'Crítico: 24', 'Não verificável: 24']);
    const scopeId = await button('adequado').getAttribute('aria-describedby');
    const scope = distribution.locator(`[id="${scopeId}"]`);
    assert.equal(await scope.count(), 1);
    assert.match(await scope.innerText(), /antes da faixa e da paginação/);
    assert.match(await scope.innerText(), /remover somente esse filtro/);
    await button('adequado').focus(); assert.notEqual(await button('adequado').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.keyboard.press('Space'); assert.equal(await filters.nth(2).inputValue(), 'adequado'); assert.equal(await button('adequado').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Tab'); assert.equal(await button('atencao').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter'); assert.equal(await filters.nth(2).inputValue(), 'atencao'); assert.equal(await button('adequado').getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Enter'); assert.equal(await filters.nth(2).inputValue(), '');
    await filters.nth(0).selectOption('Fornecedor A'); await filters.nth(1).selectOption('2'); await search.fill('SERVIÇO GRUPO A');
    assert.deepEqual(await counts(), expected);
    const key = items.getByLabel('Ordenar itens por', { exact: true }); const direction = items.getByLabel('Direção da ordenação', { exact: true });
    await key.selectOption('identity'); await direction.selectOption('desc');
    await paging.getByLabel('Itens por página', { exact: true }).selectOption('10'); await next.click();
    assert.ok((await paging.innerText()).includes('Página 2 de 5'));
    await button('critico').focus(); await page.keyboard.press('Enter');
    assert.equal(await filters.nth(2).inputValue(), 'critico'); assert.ok((await paging.innerText()).includes('Página 1 de 2'));
    assert.deepEqual(await counts(), expected); assert.ok((await button('critico').innerText()).includes('✓ Selecionada'));
    assert.equal(await key.inputValue(), 'identity'); assert.equal(await direction.inputValue(), 'desc');
    assert.equal(await filters.nth(0).inputValue(), 'Fornecedor A'); assert.equal(await filters.nth(1).inputValue(), '2'); assert.equal(await search.inputValue(), 'SERVIÇO GRUPO A');
    await distribution.screenshot({ path: `${output}/${screen}-critical-selected.png` });
    await next.click();
    const event = page.waitForEvent('download'); await items.getByRole('button', { name: 'Exportar itens CSV', exact: true }).focus(); await page.keyboard.press('Enter');
    const file = await event; assert.equal(await file.failure(), null);
    const ids = current.data.itemBalances.itens.filter(item => item.contractId === 2 && item.faixa === 'critico').map(item => item.itemId).reverse();
    assert.equal((await readFile(await file.path())).toString('utf8'), expectedCsv(current, ids));
    await button('critico').click(); assert.equal(await filters.nth(2).inputValue(), ''); assert.ok((await paging.innerText()).includes('Página 1 de 5'));
    await button('nao_verificavel').click(); await next.click(); await button('adequado').click();
    assert.ok((await paging.innerText()).includes('Página 1 de 2')); assert.deepEqual(await counts(), expected);
    await filters.nth(2).selectOption('atencao'); assert.equal(await button('atencao').getAttribute('aria-pressed'), 'true'); assert.equal(await button('adequado').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.fiscal-kpis').innerText(), cards); assert.equal(await page.locator('.fiscal-action-queue').innerText(), queue); assert.equal(requests, initialRequests);
    await search.fill('sem correspondência'); assert.deepEqual(await counts(), ['Adequado: 0', 'Atenção: 0', 'Crítico: 0', 'Não verificável: 0']);
    assert.equal(await button('atencao').isEnabled(), true); await button('atencao').click(); assert.equal(await filters.nth(2).inputValue(), ''); assert.equal(await search.inputValue(), 'sem correspondência');
    const refresh = async () => {
      await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => !document.querySelector('.fiscal-refresh button').disabled);
    };
    current.data.itemBalances.itens = []; await refresh();
    assert.ok((await distribution.innerText()).includes('Sem itens cadastrados na carteira.'));
    for (const band of ['adequado', 'atencao', 'critico', 'nao_verificavel']) assert.equal(await button(band).isDisabled(), true);
    current.data.itemBalances = { coverage: 'UNAVAILABLE' }; await refresh();
    assert.equal(await distribution.locator('button').count(), 0); assert.ok((await distribution.innerText()).includes('Indisponível'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
    report.push({ screen, result: 'PASS', keyboardAndPressed: true, selectionToggleSwitch: true, preBandCounts: true,
      filtersAndSortPreserved: true, pageReset: true, completeFilteredCsv: true, globalCardsPreserved: true, emptyStates: true, noBackendCalls: true });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ result: 'PASS', output, report }, null, 2));
