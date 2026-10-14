// GC-034: Chromium validation with intercepted synthetic HTTP responses only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { fiscal, manager, load, suppliers, responseForRequest } = await import(pathToFileURL(resolve(process.argv[2])).href);
const output = resolve(process.argv[3] ?? '/tmp/gc034-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of [1440, 900, 390]) for (const role of ['fiscal', 'manager']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; let requests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      requests++;
      const url = route.request().url();
      const body = url.includes('/fiscais/carga') ? load : url.includes('/fornecedores/resumo') ? suppliers :
        role === 'fiscal' ? responseForRequest(fiscal, new URL(url).searchParams.get('includeExternal') === 'true') : manager;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183'}${role === 'manager' ? '/gerente-contratos' : '/'}`, { waitUntil: 'networkidle' });
    const tabs = page.getByRole('tab');
    assert.equal(await tabs.count(), 2);
    if (role === 'manager') {
      const filters = page.getByRole('region', { name: 'Filtros globais da carteira' });
      assert.equal(await filters.locator('label').count(), 5);
      assert.equal(await filters.getByLabel('Janela de vencimento').inputValue(), '180');
      assert.equal(await filters.getByLabel('Gerência').isDisabled(), true);
      assert.ok((await filters.innerText()).includes('2 de 2 contratos'));
      await filters.getByRole('combobox', { name: 'Fiscal', exact: true }).selectOption('7');
      assert.ok((await filters.innerText()).includes('1 de 2 contratos'));
      assert.ok((await page.locator('.manager-fiscals-panel').innerText()).includes('OS pendentes por fiscal indisponíveis no recorte'));
      await page.screenshot({ path: `${output}/${role}-${width}-fiscal-filtrado.png`, fullPage: true });
      await filters.getByLabel('Risco: Saldo ou Vigência').selectOption('ATTENTION');
      assert.ok((await filters.innerText()).includes('0 de 2 contratos'));
      await filters.getByLabel('Risco: Saldo ou Vigência').selectOption('');
      await filters.getByRole('combobox', { name: 'Fiscal', exact: true }).selectOption('');
      await filters.getByLabel('Buscar fiscal, contrato ou fornecedor').fill('FISCAL A');
      assert.ok((await filters.innerText()).includes('1 de 2 contratos'));
      await filters.getByLabel('Buscar fiscal, contrato ou fornecedor').fill('');
      await filters.getByLabel('Janela de vencimento').selectOption('90');
      assert.ok((await filters.innerText()).includes('1 de 2 contratos'));
      await filters.getByLabel('Janela de vencimento').selectOption('365');
      assert.ok((await filters.innerText()).includes('2 de 2 contratos'));
      await filters.getByLabel('Janela de vencimento').selectOption('180');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/${role}-${width}-principal.png`, fullPage: true });
    const initialRequests = requests;
    await tabs.nth(1).click();
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/${role}-${width}-complementar.png`, fullPage: true });
    await tabs.nth(1).focus(); await page.keyboard.press('Home');
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
    assert.equal(requests, initialRequests);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${role}-${width}-teclado.png`, fullPage: true });
    results.push({ role, width, requests, overflow: false, errors });
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ result: 'PASS', cases: results }, null, 2));
  process.stdout.write(JSON.stringify({ result: 'PASS', cases: results.length, output }) + '\n');
} finally { await browser.close(); }
