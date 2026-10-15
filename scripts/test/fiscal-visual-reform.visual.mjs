// Browser-only HTTP interception; no backend, database or official SAC access.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { fiscal, responseForRequest } = await import(pathToFileURL(resolve(process.argv[2])).href);
const output = resolve(process.argv[3] ?? '/tmp/fiscal-visual-reform');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const width of [1440, 900, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; let current = structuredClone(fiscal); let requests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      requests++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseForRequest(current,
        new URL(route.request().url()).searchParams.get('includeExternal') === 'true')) });
    });
    await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183', { waitUntil: 'networkidle' });
    const filters = page.locator('.fiscal-overview-controls'); const expiry = page.locator('.fiscal-operational-expiry');
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.locator('.fiscal-kpis .fiscal-kpi > span').allTextContents(),
      ['Contratos sob fiscalização', 'Saldo disponível', 'Vencimentos', 'SLA', 'Medições', 'Pagamentos']);
    assert.equal(await page.locator('.fiscal-health-row').count(), 5);
    assert.equal(await page.locator('.fiscal-health [role="progressbar"]').count(), 0);
    assert.equal(await filters.getByRole('combobox', { name: 'Risco', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.fiscal-operational-grid > section').count(), 3);
    assert.equal(await page.locator('.fiscal-header p').innerText(), 'Visão operacional da carteira individual de contratos');
    assert.deepEqual(await page.locator('.panel-heading h2').allTextContents(), [
      'Minha fila de ação', 'Saúde da carteira', 'Saldos por contrato', 'Vigências e renovações', 'Pagamento e medição',
      'Ciclo financeiro do contrato', 'Relevância Econômica das Partes do Contrato / ABC',
      'Saldo consolidado por contrato', 'Distribuição dos itens por faixa', 'Gestão dos Saldos dos Itens Contratuais',
    ]);
    const layout = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height }; };
      const panels = [...document.querySelectorAll('.fiscal-page > .fiscal-panel')];
      const cycle = panels.find(node => node.querySelector('h2').textContent === 'Ciclo financeiro do contrato').getBoundingClientRect();
      const abc = panels.find(node => node.querySelector('h2').textContent === 'Relevância Econômica das Partes do Contrato / ABC').getBoundingClientRect();
      return { page: box('.fiscal-page'), queue: box('.fiscal-action-queue'), health: box('.fiscal-health'),
        operational: box('.fiscal-operational-grid'), indicators: box('.fiscal-operational-indicators'),
        cycle: { top: cycle.top, bottom: cycle.bottom, width: cycle.width }, abc: { top: abc.top, bottom: abc.bottom, width: abc.width } };
    });
    assert.ok(layout.cycle.top >= layout.operational.bottom);
    assert.ok(layout.abc.top >= layout.cycle.bottom);
    assert.ok(layout.indicators.top >= layout.abc.bottom);
    assert.ok(Math.abs(layout.cycle.width - layout.abc.width) < 1);
    assert.ok(Math.abs(layout.cycle.width - (layout.page.width - (width > 650 ? 40 : 24))) < 1);
    if (width === 1440) {
      const boxes = await page.locator('.fiscal-operational-grid > section').evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
      assert.ok(boxes.every(box => Math.abs(box.top - boxes[0].top) < 1 && Math.abs(box.width - boxes[0].width) < 1 && Math.abs(box.height - boxes[0].height) < 1));
      const kpis = await page.locator('.fiscal-kpis .fiscal-kpi').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
      assert.ok(kpis.every(top => Math.abs(top - kpis[0]) < 1));
      assert.ok(Math.abs(layout.queue.top - layout.health.top) < 1);
      assert.ok(Math.abs(layout.queue.height - layout.health.height) < 1);
      assert.ok(layout.queue.left < layout.health.left);
      assert.ok(Math.abs(layout.queue.width / (layout.queue.width + layout.health.width) - 1.4 / 2.4) < 0.01);
    } else {
      assert.ok(layout.health.top >= layout.queue.bottom);
    }
    const strip = page.getByRole('region', { name: 'Atualização, referência e cobertura' });
    assert.ok((await strip.innerText()).includes('Última atualização do dashboard:'));
    assert.ok((await strip.innerText()).includes('Referência:'));
    assert.equal(await strip.locator('.fiscal-metadata-details').getAttribute('open'), null);
    assert.ok((await strip.locator('.fiscal-metadata-details').textContent()).includes('Horário de geração da resposta, não de atualização do banco.'));
    assert.equal(await strip.locator('.coverage-note').count(), 1);
    const cycle = page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: 'Ciclo financeiro do contrato', exact: true }) });
    assert.equal(await cycle.locator('.fiscal-model-phase').count(), 7);
    assert.equal(await cycle.locator('.fiscal-model-metrics > div').count(), 5);
    assert.deepEqual(await cycle.locator('.fiscal-model-phase strong, .fiscal-model-metrics b').allTextContents(), Array(12).fill('Indisponível'));
    assert.ok((await cycle.locator('.fiscal-model-alert').innerText()).includes('Ação: Indisponível'));
    assert.equal(await page.locator('.relevance .fiscal-model-info').count(), 2);
    assert.equal(await page.locator('.fiscal-operational-balances svg').count(), 0);
    assert.equal(await page.locator('.fiscal-queue-tools').getAttribute('open'), null);
    const consolidated = page.locator('.fiscal-contract-balances');
    if (width === 1440) assert.ok(await consolidated.evaluate(node => node.getBoundingClientRect().height < 250));
    for (const row of current.data.contractAlerts ?? []) {
      const alert = page.locator(`[data-contract-alert-id="${row.alertId}"]`);
      const expectedDate = row.expiryDate === null ? 'Indisponível' : new Date(`${row.expiryDate}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      assert.equal(await alert.locator('strong').first().innerText(), 'Alerta contratual');
      assert.deepEqual(await alert.locator('dd').allTextContents(), [row.contractNumber ?? `Contrato ID ${row.contractId}`, expectedDate]);
      const details = alert.locator('details'); const toggle = details.locator('summary');
      assert.equal(await details.getAttribute('open'), null);
      assert.equal(await details.locator('p').textContent(), row.description ?? 'Descrição indisponível');
      await toggle.focus(); await page.keyboard.press('Enter');
      assert.notEqual(await details.getAttribute('open'), null);
      assert.equal(await details.locator('p').innerText(), row.description ?? 'Descrição indisponível');
      await noOverflow();
      await alert.screenshot({ path: `${output}/fiscal-${width}-alert-${row.alertId}-expanded.png` });
      await page.keyboard.press('Enter');
      assert.equal(await details.getAttribute('open'), null);
    }
    for (const item of current.data.priorityQueue ?? []) {
      const details = page.locator(`[data-queue-order-id="${item.serviceOrderId}"] .fiscal-order-details`);
      assert.equal(await details.getAttribute('open'), null);
      assert.equal(await details.locator('li').count(), item.pendencies.length);
      await details.locator('summary').focus(); await page.keyboard.press('Enter');
      assert.notEqual(await details.getAttribute('open'), null);
      for (const [index, pendency] of item.pendencies.entries()) assert.ok((await details.locator('li').nth(index).innerText()).includes(pendency.description?.trim() || 'Decisão fiscal pendente no Processo 1'));
      await noOverflow();
      await page.locator('.fiscal-executive-grid').screenshot({ path: `${output}/fiscal-${width}-os-${item.serviceOrderId}-expanded.png` });
      await page.keyboard.press('Enter');
    }
    await noOverflow();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `${output}/fiscal-${width}-initial.png`, fullPage: true });
    await page.screenshot({ path: `${output}/fiscal-${width}-viewport.png` });
    await cycle.screenshot({ path: `${output}/react-${width}-cycle.png` });
    await page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: 'Relevância Econômica das Partes do Contrato / ABC', exact: true }) }).screenshot({ path: `${output}/react-${width}-abc.png` });
    await cycle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/react-${width}-lower.png` });
    const reference = await browser.newPage({ viewport: { width, height: 1000 } });
    await reference.route(/^https?:\/\//, route => route.abort());
    await reference.goto(pathToFileURL(resolve('docs/reference/ETICE_Dashboard_Fiscal_Autocontido_v4_ABC.html')).href);
    await reference.screenshot({ path: `${output}/original-${width}-full.png`, fullPage: true });
    await reference.screenshot({ path: `${output}/original-${width}-upper.png` });
    await reference.locator('.payflow').scrollIntoViewIfNeeded();
    await reference.screenshot({ path: `${output}/original-${width}-lower.png` });
    await reference.locator('.payflow').locator('..').screenshot({ path: `${output}/original-${width}-cycle.png` });
    await reference.locator('section.card').filter({ has: reference.getByRole('heading', { name: 'Relevância Econômica das Partes do Contrato', exact: true }) }).screenshot({ path: `${output}/original-${width}-abc.png` });
    const fidelity = await reference.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily,
      filters: getComputedStyle(document.querySelector('.filters')).gridTemplateColumns.split(' ').length,
      phases: document.querySelectorAll('.phase').length, metrics: document.querySelectorAll('.metricbox').length }));
    assert.equal(await page.locator('.fiscal-dashboard').evaluate(node => getComputedStyle(node).fontFamily), fidelity.font);
    assert.equal(await page.locator('.fiscal-overview-controls').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), fidelity.filters);
    await reference.close();
    const kpis = await page.locator('.fiscal-kpis').innerText();
    const queue = await page.locator('.fiscal-action-queue').innerText();
    const items = await page.locator('.fiscal-saldos').innerText(); const before = requests;
    const first = current.data.contracts[0];
    await filters.getByRole('combobox', { name: 'Contrato', exact: true }).selectOption(String(first.contractId));
    assert.equal(await expiry.locator('.fiscal-contract-expiry').count(), 1);
    if (first.supplierName !== null) await filters.getByRole('combobox', { name: 'Fornecedor', exact: true }).selectOption(first.supplierName);
    await filters.getByRole('searchbox').fill(first.contractNumber ?? String(first.contractId));
    assert.equal(await expiry.locator('.fiscal-contract-expiry').count(), 1);
    await filters.getByRole('combobox', { name: 'Janela de vencimento', exact: true }).selectOption('30');
    const days = (Date.parse(first.expiryDate) - Date.parse(current.meta.dataReference)) / 86400000;
    assert.equal(await expiry.locator('.fiscal-contract-expiry').count(), first.expiryDate !== null && days >= 0 && days <= 30 ? 1 : 0);
    await filters.getByRole('searchbox').fill('sem correspondência visual');
    assert.equal(await expiry.locator('.fiscal-contract-expiry').count(), 0);
    assert.ok((await expiry.innerText()).includes('Nenhum contrato no recorte operacional'));
    assert.equal(await page.locator('.fiscal-kpis').innerText(), kpis);
    assert.equal(await page.locator('.fiscal-action-queue').innerText(), queue);
    assert.equal(await page.locator('.fiscal-saldos').innerText(), items);
    assert.equal(requests, before); await noOverflow();
    await page.locator('.fiscal-operational-grid').screenshot({ path: `${output}/fiscal-${width}-filtered-empty.png` });
    for (const scenario of ['available', 'partial', 'long-content', 'empty-queue', 'empty', 'unavailable']) {
      current = structuredClone(fiscal);
      if (scenario === 'available') { const sample = current.data.contractBalances[0]; current.data.contractBalances = current.data.contracts.map(row => ({ ...sample, contractId: row.contractId, contractNumber: row.contractNumber })); }
      if (scenario === 'long-content') { current.data.contractAlerts[0].description = 'Descrição original extensa de validação.\n'.repeat(80); current.data.priorityQueue[0].pendencies[0].description = 'Pendência extensa sem alteração do texto original.\n'.repeat(80); }
      if (scenario === 'partial') { current.data.contracts[0].expiryDate = null; current.data.contractBalances = []; }
      if (scenario === 'empty-queue' || scenario === 'empty') { current.data.priorityQueue = []; current.data.cards.pendingServiceOrders = 0; }
      if (scenario === 'empty') { current.data.contracts = []; current.data.contractBalances = []; current.data.contractAlerts = []; current.data.cards.activeContracts = 0; }
      if (scenario === 'unavailable') { current.data.priorityQueue = null; current.data.cards.pendingServiceOrders = null; current.meta.dataCoverage.pendingServiceOrders = 'UNAVAILABLE'; }
      if (scenario === 'unavailable') for (const key of ['contracts', 'contractBalances', 'contractAlerts']) {
        current.meta.dataCoverage[key] = 'UNAVAILABLE'; current.data[key] = null;
      }
      await page.reload({ waitUntil: 'networkidle' });
      const values = await page.locator('.fiscal-kpis strong').allTextContents();
      assert.equal(values[1], scenario === 'available' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(current.data.contractBalances.reduce((sum, row) => sum + row.balanceValue, 0)) : scenario === 'empty' ? 'R$\u00a00,00' : 'Indisponível');
      assert.equal(values[2], ['available', 'long-content', 'empty-queue', 'empty'].includes(scenario) ? '0' : 'Indisponível');
      if (scenario === 'unavailable') {
        assert.equal(await expiry.locator('.fiscal-contract-expiry').count(), 0);
        assert.equal(await filters.getByRole('combobox', { name: 'Contrato', exact: true }).isDisabled(), true);
      }
      if (scenario === 'long-content') {
        const alert = page.locator('.fiscal-alert-description').first();
        await alert.locator('summary').focus(); await page.keyboard.press('Enter');
        assert.equal(await alert.locator('p').textContent(), current.data.contractAlerts[0].description);
        const order = page.locator('.fiscal-order-details').first();
        await order.locator('summary').focus(); await page.keyboard.press('Enter');
        assert.ok((await order.locator('li').first().textContent()).startsWith(current.data.priorityQueue[0].pendencies[0].description));
      }
      if (['empty-queue', 'empty', 'unavailable'].includes(scenario)) {
        assert.equal(await page.locator('[data-queue-order-id]').count(), 0);
        assert.ok((await page.locator('.fiscal-action-queue .table-empty').innerText()).includes(scenario === 'unavailable' ? 'Fila indisponível' : 'Fila apurada sem ocorrências'));
      }
      if (width === 1440) {
        const sizes = await page.locator('.fiscal-executive-grid > section').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
        assert.ok(Math.abs(sizes[0] - sizes[1]) < 1);
        const operational = await page.locator('.fiscal-operational-grid > section').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
        assert.ok(operational.every(height => Math.abs(height - operational[0]) < 1));
      }
      await page.locator('.fiscal-executive-grid').screenshot({ path: `${output}/fiscal-${width}-${scenario}-executive.png` });
      await noOverflow(); await page.locator('.fiscal-operational-grid').screenshot({ path: `${output}/fiscal-${width}-${scenario}.png` });
    }
    assert.deepEqual(errors, []); report.push({ width, scenarios: ['initial', 'filters', 'available', 'partial', 'long-content', 'empty-queue', 'empty', 'unavailable'], overflow: false, errors });
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ result: 'PASS', cases: report }, null, 2));
  process.stdout.write(JSON.stringify({ result: 'PASS', widths: report.length, output }) + '\n');
} finally { await browser.close(); }
