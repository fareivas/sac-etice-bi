// Local Vite + browser-only fixtures. Intercepts all API requests, never the shared database.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fixture, responseForRequest } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/queue-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const [screen, width, height] of [['desktop', 1440, 1000], ['tablet', 900, 1000], ['narrow', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    let current = structuredClone(fixture);
    let apiRequests = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo'));
      apiRequests++;
      const includeExternal = new URL(route.request().url()).searchParams.get('includeExternal') === 'true';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseForRequest(current, includeExternal)) });
    });
    await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    const panel = page.locator('.fiscal-action-queue');
    const contract = panel.getByLabel('Contrato da fila', { exact: true });
    const status = panel.getByLabel('Status da pendência', { exact: true });
    const search = panel.getByLabel('Busca na fila', { exact: true });
    const exportCsv = panel.getByRole('button', { name: 'Exportar CSV', exact: true });
    const clear = panel.getByRole('button', { name: 'Limpar filtros da fila' });
    const count = panel.locator('.fiscal-queue-filter-meta [role="status"]');
    const waitCount = expected => page.waitForFunction(expected => document.querySelector('.fiscal-queue-filter-meta [role="status"]')?.textContent === expected, expected);
    const pendingCard = page.locator('.fiscal-legacy-kpis article').filter({ has: page.getByText('OS pendentes', { exact: true }) }).locator('strong');
    await waitCount('4 de 4 OS');
    const controls = await panel.locator('.fiscal-queue-filters > div').evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect(); return { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
    }));
    if (width > 1000) assert.ok(controls.every(box => Math.abs(box.top - controls[0].top) < 1));
    else if (width > 600) { assert.ok(Math.abs(controls[0].top - controls[1].top) < 1); assert.ok(controls[2].top >= controls[0].bottom); }
    else { assert.ok(controls[1].top >= controls[0].bottom); assert.ok(controls[2].top >= controls[1].bottom); }
    assert.ok(controls.every(box => box.left >= 0 && box.right <= width));
    assert.equal(await panel.locator('.fiscal-queue-actions button').count(), 2);
    assert.equal(await panel.locator('thead th').count(), 7);
    assert.equal(await panel.locator('thead th').first().evaluate(el => getComputedStyle(el).position), 'sticky');
    const clearBox = await clear.boundingBox(); const exportBox = await exportCsv.boundingBox();
    if (width > 600) assert.ok(Math.abs(clearBox.y - exportBox.y) < 1);
    else assert.ok(exportBox.y >= clearBox.y + clearBox.height);
    for (const details of await panel.locator('.fiscal-queue-guidance').all()) {
      assert.equal(await details.getAttribute('open'), null);
      await details.locator('summary').click();
      for (const note of await details.locator('p.source-note').all()) assert.ok(await note.isVisible());
    }
    await page.locator('.fiscal-operational-indicators > summary').click();
    for (const note of await panel.locator('p.source-note').all()) assert.ok(await note.isVisible());
    const exportNote = await exportCsv.getAttribute('aria-describedby');
    assert.ok((await page.locator(`[id="${exportNote}"]`).innerText()).includes('Cada linha representa uma pendência'));
    await panel.screenshot({ path: `${output}/${screen}-initial.png` });
    const initialRequests = apiRequests;
    const otherPanels = await page.locator('.fiscal-panel:not(.fiscal-action-queue)').allTextContents();
    const initialCards = await page.locator('.fiscal-kpis').textContent();
    assert.equal(await pendingCard.innerText(), '4');
    // Select filters and clear them entirely with native keyboard behavior.
    await contract.focus(); await page.keyboard.press('ArrowDown');
    await waitCount('2 de 4 OS');
    await page.keyboard.press('Tab');
    assert.equal(await status.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    await waitCount('1 de 4 OS');
    await page.keyboard.press('Tab');
    assert.equal(await search.evaluate(el => el === document.activeElement), true);
    await page.keyboard.type('documento');
    await page.waitForFunction(() => document.querySelector('.fiscal-queue-hidden')?.textContent === '2 pendências ocultas pelos filtros');
    assert.equal(await panel.locator('tbody tr').count(), 1);
    assert.ok((await panel.innerText()).includes('Documento divergente'));
    assert.ok(!(await panel.innerText()).includes('Conferir valor'));
    await page.keyboard.press('Tab');
    assert.equal(await clear.evaluate(el => el === document.activeElement), true);
    const focus = await clear.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
    assert.notEqual(focus.outline, 'none'); assert.notEqual(focus.width, '0px');
    await page.keyboard.press('Tab');
    assert.equal(await exportCsv.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    await panel.screenshot({ path: `${output}/${screen}-keyboard-filtered.png` });
    await page.keyboard.press('Enter');
    await waitCount('4 de 4 OS');
    assert.equal(await clear.isDisabled(), true);
    assert.deepEqual(await page.locator('.fiscal-panel:not(.fiscal-action-queue)').allTextContents(), otherPanels);
    assert.equal(await page.locator('.fiscal-kpis').textContent(), initialCards);
    assert.equal(apiRequests, initialRequests);
    // Description and status must match the SAME pendency.
    await status.selectOption('em_tratamento'); await search.fill('DÓCUMENTO');
    await waitCount('1 de 4 OS');
    assert.ok((await panel.innerText()).includes('OS ID 12'));
    assert.ok((await panel.innerText()).includes('Documento em revisão'));
    assert.ok(!(await panel.innerText()).includes('Documento ausente'));
    assert.ok(!(await panel.innerText()).includes('OS ID 11'));
    assert.ok((await panel.innerText()).includes('1 pendência oculta pelos filtros'));
    await panel.locator('tbody tr td').nth(2).scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${output}/${screen}-description-status.png` });
    assert.equal(await pendingCard.innerText(), '4');
    await exportCsv.focus();
    assert.equal(await exportCsv.evaluate(el => el === document.activeElement), true);
    assert.notEqual(await exportCsv.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    const downloadEvent = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), `fila-fiscal-${current.meta.dataReference}.csv`);
    assert.equal(await download.failure(), null);
    const downloaded = await readFile(await download.path());
    assert.deepEqual([...downloaded.subarray(0, 3)], [239, 187, 191]);
    const csv = downloaded.toString('utf8');
    assert.equal(csv.split('\r\n').length, 3);
    assert.ok(csv.includes('"12";"205";"13/2025";"Zeta";"202";"Documento em revisão";"em_tratamento"'));
    assert.ok(!csv.includes('Documento ausente'));
    assert.equal(await count.textContent(), '1 de 4 OS');
    assert.equal(await search.inputValue(), 'DÓCUMENTO');
    assert.equal(await pendingCard.innerText(), '4');
    assert.equal(apiRequests, initialRequests);
    const refresh = async () => {
      await page.getByLabel('Consultar fonte externa').click();
      await page.waitForLoadState('networkidle');
      await panel.waitFor();
    };
    // Same scope survives an asynchronous loading cycle.
    await refresh(); await waitCount('1 de 4 OS');
    assert.equal(await search.inputValue(), 'DÓCUMENTO');
    assert.equal(await status.inputValue(), 'em_tratamento');
    // A different user resets all local fields.
    current.data.fiscal.userId = 88;
    await refresh(); await waitCount('4 de 4 OS');
    assert.equal(await search.inputValue(), ''); assert.equal(await status.inputValue(), '');
    // An API-restricted scope cannot be broadened by clearing local filters.
    await search.fill('documento');
    current.meta.filtersApplied.contratoId = [184];
    current.data.priorityQueue = current.data.priorityQueue.filter(item => item.contractId === 184);
    current.data.cards.pendingServiceOrders = 2;
    current.data.cards.activeContracts = 1;
    current.data.contracts = current.data.contracts.filter(item => item.contractId === 184);
    current.data.contractBalances = [];
    current.data.itemBalances = { coverage: 'UNAVAILABLE' };
    await refresh(); await waitCount('2 de 2 OS');
    assert.equal(await search.inputValue(), '');
    await search.fill('sem correspondência'); await waitCount('0 de 2 OS');
    assert.ok((await panel.innerText()).includes('Nenhuma OS encontrada com os filtros atuais.'));
    assert.equal(await exportCsv.isDisabled(), true);
    await panel.screenshot({ path: `${output}/${screen}-no-results.png` });
    await clear.click(); await waitCount('2 de 2 OS');
    assert.ok(!(await panel.innerText()).includes('OS ID 12'));
    assert.equal(await pendingCard.innerText(), '2');
    // Empty and unavailable are independent states, including the global pending OS card.
    current.data.priorityQueue = []; current.data.cards.pendingServiceOrders = 0;
    await refresh(); await waitCount('0 de 0 OS');
    assert.ok((await panel.innerText()).includes('Fila apurada sem ocorrências'));
    assert.equal(await exportCsv.isDisabled(), true);
    await panel.screenshot({ path: `${output}/${screen}-empty.png` });
    current.data.priorityQueue = null; current.data.cards.pendingServiceOrders = 2;
    await refresh();
    await page.waitForFunction(() => document.querySelector('.fiscal-action-queue')?.textContent.includes('Fila indisponível'));
    assert.ok((await panel.innerText()).includes('Fila indisponível'));
    assert.equal(await panel.locator('.fiscal-queue-filters').count(), 0);
    assert.equal(await count.count(), 0);
    assert.equal(await exportCsv.isDisabled(), true);
    assert.equal(await pendingCard.innerText(), '2');
    await panel.screenshot({ path: `${output}/${screen}-unavailable.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    report.push({ screen, viewport: `${width}x${height}`, result: 'PASS', filtersViaKeyboard: true,
      hiddenPendencies: true, independentPanels: true, sourceScopeRespected: true, threeEmptyStates: true,
      csvDownloadViaKeyboard: true, csvBomAndFilteredContent: true, noBackendCalls: true });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', cases: report.length, output, report }, null, 2));
