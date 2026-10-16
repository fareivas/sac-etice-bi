// Complementary GC-035 visual checks. All /api/** traffic is fulfilled from synthetic fixtures.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const fixtures = await import(pathToFileURL(resolve(process.argv[2])).href);
const output = resolve(process.argv[3] ?? '/tmp/gc035-recent-states');
const preview = process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
const results = [];
const fiscalError = 'A carga de fiscais retornou data de referência ou fuso diferente do resumo. Recarregue o dashboard.';
const supplierError = 'A consulta de fornecedores retornou data de referência ou fuso diferente do resumo. Recarregue o dashboard.';
const noContracts = 'Nenhum contrato no recorte global atual.';
const noFiscals = 'Nenhum fiscal com designação ativa nos contratos do recorte global atual.';
const noItems = 'Nenhum item contratual disponível no recorte global atual.';
const noLocalItems = 'Nenhum item encontrado com os filtros atuais.';
const scenarios = [
  'global-items-empty', 'local-items-empty', 'real-zero', 'measured-missing',
  'fiscals-outside', 'contracts-without-fiscals', 'contracts-empty', 'load-unavailable',
  'load-date-manager', 'load-timezone-manager', 'load-date-aggregate', 'load-timezone-aggregate',
  'suppliers-retry',
];
const summaryFor = scenario => scenario === 'global-items-empty' ? fixtures.noItems
  : scenario === 'real-zero' ? fixtures.zeroItem
    : scenario === 'measured-missing' ? fixtures.measuredMissing
      : scenario === 'local-items-empty' ? fixtures.localItems : fixtures.manager;
const loadFor = scenario => scenario === 'fiscals-outside' ? fixtures.outsideLoad
  : scenario === 'contracts-without-fiscals' ? fixtures.emptyLoad
    : scenario === 'load-unavailable' ? fixtures.unavailableLoad
      : scenario.includes('load-date') ? fixtures.dateLoad
        : scenario.includes('load-timezone') ? fixtures.timezoneLoad : fixtures.load;
const isAggregate = scenario => scenario.endsWith('-aggregate');
const waitText = async (page, text) => {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible' });
};
const noPageOverflow = async page => assert.equal(await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth), true, 'Transbordamento horizontal da página');
const focus = async locator => {
  await locator.focus();
  assert.equal(await locator.evaluate(element => element === document.activeElement), true, 'Controle sem foco');
};
const globalSearch = async (page, value) => {
  const search = page.locator('.manager-global-filters input[type="search"]');
  await focus(search);
  await search.fill(value);
  assert.equal(await search.inputValue(), value);
};
const fiscalPanels = async (page, message) => {
  await waitText(page, message);
  const chart = page.locator('.manager-combined-chart');
  assert.ok((await chart.innerText()).includes(message), 'Mensagem ausente no gráfico');
  const details = page.locator('.manager-operational-details');
  await details.locator('summary').click();
  assert.ok((await details.innerText()).includes(message), 'Mensagem ausente na tabela operacional');
};
const localTableScroll = async (page, width) => {
  if (width !== 390) return;
  const wrap = page.locator('.fiscal-saldos > .fiscal-table-wrap');
  assert.equal(await wrap.evaluate(element => element.scrollWidth > element.clientWidth), true,
    'Tabela de itens sem rolagem local em 390 px');
  assert.equal(await wrap.evaluate(element => { element.scrollLeft = element.scrollWidth; return element.scrollLeft > 0; }), true,
    'Rolagem local da tabela de itens não funcionou');
  await wrap.evaluate(element => { element.scrollLeft = 0; });
};

try {
  for (const width of [1440, 900, 390]) for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    let supplierRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) errors.push(`Requisição API falhou: ${request.url()}`);
    });
    const origin = new URL(preview).origin;
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = url.pathname.endsWith('/fiscais/carga') ? loadFor(scenario)
        : url.pathname.endsWith('/fornecedores/resumo')
          ? scenario === 'suppliers-retry' && supplierRequests++ === 0 ? fixtures.badSuppliers : fixtures.goodSuppliers
          : summaryFor(scenario);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    try {
      const path = isAggregate(scenario) ? '/gerente-contratos/visao-agregada' : '/gerente-contratos/supervisao';
      await page.goto(`${preview}${path}`, { waitUntil: 'networkidle' });
      await noPageOverflow(page);
      if (isAggregate(scenario)) {
        await waitText(page, fiscalError);
        assert.ok((await page.locator('.aggregate-card').allInnerTexts()).some(text => text.includes(fiscalError)));
        assert.equal((await page.locator('body').innerText()).includes('Fiscal A'), false);
        assert.ok((await page.locator('body').innerText()).includes('Visão agregada'));
        const filters = page.getByRole('region', { name: 'Filtros globais da carteira' });
        const fiscalFilter = filters.getByRole('combobox', { name: 'Fiscal', exact: true });
        const windowFilter = filters.getByRole('combobox', { name: 'Janela de vencimento' });
        assert.equal(await fiscalFilter.isDisabled(), true);
        assert.equal(await windowFilter.isEnabled(), true);
        await focus(windowFilter);
        await page.keyboard.press('Tab');
        assert.equal(await filters.getByRole('searchbox').evaluate(element => element === document.activeElement), true,
          'Tab não alcançou a busca global após Janela de vencimento');
      } else {
        await waitText(page, 'Dashboard do Gerente de Contratos');
        const table = page.locator('.fiscal-saldos');
        switch (scenario) {
          case 'global-items-empty':
            await waitText(page, noItems);
            assert.ok((await table.innerText()).includes('Os totais zerados representam um recorte sem itens; não comprovam saldo contratual zero.'));
            assert.match(await page.locator('.manager-saldo-kpis').innerText(), /R\$\s*0,00/);
            assert.ok((await page.locator('.manager-band-distribution').innerText()).includes(noItems));
            break;
          case 'local-items-empty': {
            const details = page.locator('.manager-saldo-tools');
            await details.locator('summary').click();
            const band = details.getByRole('combobox', { name: 'Faixa' });
            await focus(band);
            await band.selectOption('nao_verificavel');
            await page.keyboard.press('Tab');
            assert.equal(await details.locator('input[type="search"]').evaluate(element => element === document.activeElement), true,
              'Tab não alcançou a busca local após Faixa');
            await waitText(page, noLocalItems);
            assert.ok((await table.innerText()).includes('Os totais zerados representam filtros locais sem resultados.'));
            assert.match(await page.locator('.manager-saldo-kpis').innerText(), /R\$\s*0,00/);
            break;
          }
          case 'real-zero':
            await page.locator('.fiscal-saldos tbody tr').first().waitFor();
            assert.match(await page.locator('.fiscal-saldos tbody tr').first().innerText(), /R\$\s*0,00/);
            assert.equal((await table.innerText()).includes('Os totais zerados representam'), false);
            break;
          case 'measured-missing': {
            const cells = page.locator('.fiscal-saldos tbody tr').first().locator('td');
            assert.equal(await cells.nth(5).innerText(), 'Indisponível');
            assert.match(await cells.nth(6).innerText(), /R\$\s*1\.000,00/);
            const details = page.locator('.manager-saldo-tools');
            await details.locator('summary').click();
            assert.ok((await details.innerText()).includes('medição ausente é considerada zero apenas no cálculo do saldo medido'));
            break;
          }
          case 'fiscals-outside':
            await globalSearch(page, '13/2025');
            await fiscalPanels(page, noFiscals);
            assert.equal((await page.locator('.manager-combined-chart').innerText()).includes('Fiscal B'), false);
            break;
          case 'contracts-without-fiscals':
            await fiscalPanels(page, noFiscals);
            break;
          case 'contracts-empty':
            await globalSearch(page, 'sem correspondência visual');
            await fiscalPanels(page, noContracts);
            break;
          case 'load-unavailable':
            await waitText(page, 'Distribuição dos fiscais indisponível.');
            assert.ok((await page.locator('.manager-combined-chart').innerText()).includes('Distribuição dos fiscais indisponível.'));
            await page.locator('.manager-operational-details summary').click();
            assert.ok((await page.locator('.manager-operational-details').innerText()).includes('Distribuição dos fiscais indisponível para esta referência.'));
            assert.equal((await page.locator('.manager-fiscals-panel').innerText()).includes(noFiscals), false);
            break;
          case 'load-date-manager':
          case 'load-timezone-manager':
            await waitText(page, fiscalError);
            assert.ok((await page.locator('.manager-fiscals-panel').innerText()).includes(fiscalError));
            assert.equal((await page.locator('.manager-fiscals-panel').innerText()).includes('Fiscal A'), false);
            assert.ok((await page.locator('.manager-kpis').innerText()).includes('Contratos monitorados'));
            break;
          case 'suppliers-retry': {
            await waitText(page, supplierError);
            const panel = page.locator('.manager-suppliers');
            assert.equal((await panel.innerText()).includes('Fornecedor A'), false);
            assert.ok((await panel.innerText()).includes('Total de fornecedores indisponível.'));
            const retry = panel.getByRole('button', { name: 'Tentar novamente' });
            await focus(retry);
            await retry.click();
            await waitText(page, '1–2 de 2 fornecedores');
            assert.ok((await panel.innerText()).includes('Fornecedor A'));
            assert.equal((await panel.innerText()).includes(supplierError), false);
            break;
          }
        }
        await localTableScroll(page, width);
      }
      await noPageOverflow(page);
      assert.deepEqual(errors, []);
      results.push({ scenario, width, result: 'PASS', errors });
    } catch (error) {
      results.push({ scenario, width, result: 'FAIL', error: error instanceof Error ? error.message : String(error), errors });
    } finally {
      try { await page.screenshot({ path: `${output}/${scenario}-${width}.png`, fullPage: true }); }
      catch (error) { results.at(-1).captureError = error instanceof Error ? error.message : String(error); results.at(-1).result = 'FAIL'; }
      await page.close();
    }
  }
} finally {
  await browser.close();
  const failed = results.filter(item => item.result === 'FAIL').length;
  await writeFile(`${output}/report.json`, JSON.stringify({ result: failed ? 'FAIL' : 'PASS', failed, cases: results }, null, 2));
  process.stdout.write(JSON.stringify({ result: failed ? 'FAIL' : 'PASS', failed, cases: results.length, output }) + '\n');
  if (failed) process.exitCode = 1;
}
