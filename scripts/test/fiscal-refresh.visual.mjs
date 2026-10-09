// Isolated browser responses only. No API/database writes or requests to the official SAC.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { fixture, responseForRequest } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/refresh-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const [screen, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; let requests = 0; let hold = false; const pending = [];
    page.on('pageerror', error => errors.push(error.message));
    const respond = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json',
      body: status === 200 ? JSON.stringify(responseForRequest(data, new URL(route.request().url()).searchParams.get('includeExternal') === 'true')) : JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }) });
    await page.route('**/api/**', async route => {
      assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo'));
      requests++;
      if (hold) pending.push(route); else await respond(route, fixture);
    });
    const waitPending = async number => {
      const deadline = Date.now() + 10000;
      while (pending.length < number) { assert.ok(Date.now() < deadline, 'Missing pending request'); await new Promise(done => setTimeout(done, 25)); }
    };
    await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    const refresh = page.getByRole('button', { name: 'Atualizar dados', exact: true });
    const queue = page.locator('.fiscal-action-queue');
    const contract = queue.getByLabel('Contrato da fila', { exact: true });
    const itemContract = page.locator('.saldo-filters label').filter({ hasText: /^Contrato/ }).locator('select');
    const timestamp = page.locator('.fiscal-refresh span');
    const waitCount = value => page.waitForFunction(value => document.querySelector('.fiscal-queue-filter-meta [role="status"]')?.textContent === value, value);
    await contract.selectOption('205'); await itemContract.selectOption('2'); await waitCount('1 de 4 OS');
    const initialTimestamp = await timestamp.innerText();
    hold = true; const previousRequests = requests;
    // Reach refresh from the preceding external checkbox using Tab, activate with Enter.
    await page.getByLabel('Consultar fonte externa').focus(); await page.keyboard.press('Tab');
    assert.equal(await refresh.evaluate(el => el === document.activeElement), true);
    assert.notEqual(await refresh.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.keyboard.press('Enter'); await waitPending(1);
    assert.equal(await refresh.isDisabled(), true);
    await refresh.evaluate(el => { el.click(); el.click(); });
    assert.equal(requests, previousRequests + 1);
    assert.ok((await page.locator('body').innerText()).includes('Atualizando dados'));
    assert.equal(await contract.inputValue(), '205'); assert.equal(await itemContract.inputValue(), '2');
    assert.equal(await timestamp.innerText(), initialTimestamp);
    await page.screenshot({ path: `${output}/${screen}-loading.png`, fullPage: false });
    const newer = structuredClone(fixture); newer.meta.generatedAt = '2026-10-09T01:35:42Z';
    await respond(pending.shift(), newer); await page.waitForFunction(() => !document.querySelector('.fiscal-refresh button').disabled);
    assert.ok((await timestamp.innerText()).includes('08/10/2026, 22:35:42'));
    assert.equal(await contract.inputValue(), '205'); assert.equal(await itemContract.inputValue(), '2');
    // Fail a refresh and verify prior response remains available.
    await refresh.click(); await waitPending(1); await respond(pending.shift(), newer, 500);
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes('Os dados não foram atualizados'));
    assert.equal(await contract.inputValue(), '205'); assert.equal(await refresh.isDisabled(), false);
    const failureTimestamp = await timestamp.innerText();
    await refresh.focus(); await page.screenshot({ path: `${output}/${screen}-failure.png`, fullPage: false });
    // Recover; the selected contract disappears without silently showing other OS.
    await page.keyboard.press('Enter'); await waitPending(1);
    const missing = structuredClone(newer); missing.meta.generatedAt = '2026-10-09T02:35:42Z';
    missing.data.priorityQueue = missing.data.priorityQueue.filter(row => row.contractId !== 205);
    await respond(pending.shift(), missing); await waitCount('0 de 3 OS');
    assert.equal(await contract.inputValue(), '205');
    assert.ok((await queue.innerText()).includes('O contrato selecionado não está disponível'));
    assert.equal(await page.getByRole('alert').count(), 0); assert.notEqual(await timestamp.innerText(), failureTimestamp);
    // Supersede the old request through the existing query control, returning a new scope.
    await refresh.click(); await waitPending(1);
    await page.getByLabel('Consultar fonte externa').click(); await waitPending(2);
    const scoped = structuredClone(newer); scoped.data.fiscal.userId = 88;
    scoped.meta.filtersApplied.contratoId = [184];
    scoped.data.priorityQueue = scoped.data.priorityQueue.filter(row => row.contractId === 184);
    scoped.data.cards.pendingServiceOrders = 2;
    await respond(pending[1], scoped); await waitCount('2 de 2 OS');
    await respond(pending[0], fixture); pending.length = 0;
    await page.waitForLoadState('networkidle');
    assert.equal(await contract.inputValue(), '');
    assert.ok((await queue.innerText()).includes('2 de 2 OS')); assert.ok(!(await queue.innerText()).includes('OS ID 12'));
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    report.push({ screen, result: 'PASS', keyboard: true, retainedData: true, failureAndRecovery: true,
      repeatClicksBlocked: true, missingOptionsRetained: true, staleScopeIgnored: true, responseTimezone: true, noBackendCalls: true });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', report, output }, null, 2));
