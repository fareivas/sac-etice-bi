// GC-035: synthetic HTTP responses and local React/Recharts prototypes only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { fiscal, manager, load, suppliers, responseForRequest } = await import(pathToFileURL(resolve(process.argv[2])).href);
const output = resolve(process.argv[3] ?? '/tmp/gc035-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
const expected = {
  fiscal: ['Minha fila de ação', 'Saúde da carteira', 'Saldos por contrato', 'Vigências e renovações', 'Pagamento e medição',
    'Ciclo financeiro do contrato', 'Relevância Econômica das Partes do Contrato'],
  manager: ['Carga, criticidade e desempenho por fiscal', 'Qualidade preventiva da gestão',
    'Matriz Contrato × Dimensão de Risco', 'Fornecedores estratégicos: valor × risco',
    'Intervenções gerenciais priorizadas', 'Curva ABC dos principais fornecedores',
    'Distribuição dos itens por faixa de saldo', 'Gestão dos Saldos dos Itens Contratuais',
    'Eficiência do Ciclo Financeiro — carteira gerenciada'],
  aggregate: ['Matriz Contrato × Dimensão de Risco', 'Carga e risco por fiscal',
    'Intervenções gerenciais priorizadas', 'Horizonte de vencimentos · 180 dias', 'Exposição financeira',
    'Qualidade da gestão', 'Eficiência do Ciclo Financeiro — carteira gerenciada',
    'Curva ABC de Fornecedores', 'Curva ABC de Clientes'],
};
const report = [];
try {
  for (const width of [1440, 900, 390]) for (const role of ['fiscal', 'manager', 'aggregate']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const url = route.request().url();
      const body = url.includes('/fiscais/carga') ? load : url.includes('/fornecedores/resumo') ? suppliers :
        role === 'fiscal' ? responseForRequest(fiscal, new URL(url).searchParams.get('includeExternal') === 'true') : manager;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const path = role === 'manager' ? '/gerente-contratos/supervisao' :
      role === 'aggregate' ? '/gerente-contratos/visao-agregada' : '/';
    await page.goto(`${process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183'}${path}`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(await page.getByRole('tablist').count(), 0);
    assert.deepEqual(await page.locator(role === 'aggregate' ? '.aggregate-card h2' : '.panel-heading h2').allTextContents(), expected[role]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (role === 'manager') {
      assert.equal(await page.locator('.manager-header p').innerText(),
        'Supervisão de fiscais, fornecedores estratégicos e prevenção de riscos');
      assert.deepEqual(await page.locator('.manager-decision-tag').allTextContents(),
        ['Decisão imediata', 'Capacidade', 'Concentração', 'Antecipação']);
      assert.equal(await page.locator('.manager-decision-item').count(), 4);
      assert.equal(await page.locator('.manager-combined-chart').count(), 1);
      assert.equal(await page.locator('.manager-radar').count(), 1);
      assert.equal(await page.locator('.manager-strategic-chart').count(), 1);
      assert.equal(await page.locator('.manager-strategic-chart svg').count(), 0);
      assert.deepEqual(await page.locator('.manager-saldo-kpis > div > span').allTextContents(),
        ['Total contratado', 'Saldo disponível', 'Saldo consolidado', 'Itens críticos']);
      assert.equal(await page.locator('.manager-saldo-tools > summary').count(), 1);
      assert.deepEqual(await page.locator('.manager-suppliers > .fiscal-table-wrap thead th').allTextContents(),
        ['Classe', 'Fornecedor', 'Valor 12m', '%', '% acum.', 'Contratos', 'Risco', 'Tendência']);
      assert.equal(await page.evaluate(() => {
        const kpis = document.querySelector('.manager-kpis')?.getBoundingClientRect();
        const alerts = document.querySelector('.manager-decision')?.getBoundingClientRect();
        const filters = document.querySelector('.manager-global-filters')?.getBoundingClientRect();
        const charts = document.querySelector('.manager-first-grid')?.getBoundingClientRect();
        return !!kpis && !!alerts && !!filters && !!charts && kpis.top < alerts.top &&
          alerts.top < filters.top && filters.top < charts.top;
      }), true);
      assert.deepEqual(await page.locator('.manager-interventions thead th').allTextContents(),
        ['Prior.', 'Fiscal', 'Contrato / fornecedor', 'Sinal antecipado', 'Impacto',
          'Antecedência', 'Ação gerencial', 'Prazo']);
      assert.ok(await page.locator('.manager-interventions tbody tr').count() >= 1);
      assert.ok((await page.locator('.manager-interventions').innerText()).includes('Alertas:'));
      assert.equal(await page.locator('.manager-interventions').getByText('P1', { exact: true }).count(), 0);
      assert.deepEqual(await page.locator('.fiscal-saldos thead th').allTextContents(),
        ['Status', 'Fiscal', 'Contrato / fornecedor', 'Item', 'Total', 'Executado', 'Saldo', '% saldo', 'Direcionamento gerencial']);
      const filters = page.getByRole('region', { name: 'Filtros globais da carteira' });
      assert.equal(await filters.locator('label').count(), 5);
      await filters.getByRole('combobox', { name: 'Fiscal', exact: true }).focus();
      assert.equal(await filters.getByRole('combobox', { name: 'Fiscal', exact: true }).evaluate(el => el === document.activeElement), true);
    } else if (role === 'aggregate') {
      assert.deepEqual(await page.locator('.aggregate-block').first().locator('thead th').allTextContents(),
        ['Prior.', 'Fiscal', 'Contrato / Empresa', 'Risco', 'Impacto', 'Ação gerencial', 'Prazo']);
      assert.ok((await page.locator('.aggregate-block').first().innerText()).includes('Alertas:'));
      assert.equal(await page.locator('.aggregate-block').first().getByText('P1', { exact: true }).count(), 0);
      assert.equal(await page.locator('.aggregate-kpi').count(), 6);
      assert.equal(await page.locator('.aggregate-phase').count(), 7);
      assert.equal(await page.locator('.aggregate-filters label').count(), 5);
      await page.locator('.aggregate-filters select').first().focus();
      assert.equal(await page.locator('.aggregate-filters select').first().evaluate(el => el === document.activeElement), true);
    } else {
      assert.equal(await page.locator('.fiscal-saldos, .fiscal-band-distribution, .fiscal-contract-balances, .fiscal-operational-indicators').count(), 0);
      assert.equal(await page.locator('.fiscal-page > :last-child h2').innerText(), 'Relevância Econômica das Partes do Contrato');
      await page.locator('.fiscal-queue-tools > summary').click();
      await page.locator('.fiscal-action-queue select').first().focus();
      assert.equal(await page.locator('.fiscal-action-queue select').first().evaluate(el => el === document.activeElement), true);
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${role}-${width}-atual.png`, fullPage: true });
    if (role === 'aggregate') {
      const horizon = page.locator('.aggregate-expiry');
      assert.equal(await horizon.locator('dt').count(), 5);
      assert.deepEqual(await horizon.locator('.aggregate-alert strong').allTextContents(), ['Indisponível', 'Indisponível']);
      await page.getByRole('combobox', { name: 'Janela de vencimento', exact: true }).selectOption('90');
      assert.ok((await horizon.innerText()).includes('Janela efetiva: D0–90'));
      assert.equal(await horizon.getByText('Fora do recorte', { exact: true }).count(), 2);
      await page.getByRole('combobox', { name: 'Janela de vencimento', exact: true }).selectOption('365');
      assert.ok((await horizon.innerText()).includes('Janela efetiva: D0–180'));
      await page.getByRole('searchbox').fill('sem correspondência GC037');
      assert.equal(await horizon.locator('[data-expiry-contract-id]').count(), 0);
      assert.ok((await horizon.innerText()).includes('Nenhum contrato no recorte selecionado'));
      await page.getByRole('searchbox').fill('');
      const originalIds = await horizon.locator('[data-expiry-contract-id]').evaluateAll(rows => rows.map(row => row.dataset.expiryContractId));
      const fiscalSelect = page.getByRole('combobox', { name: 'Fiscal', exact: true });
      const fiscalOption = await fiscalSelect.locator('option').nth(1).getAttribute('value');
      if (fiscalOption) {
        await fiscalSelect.selectOption(fiscalOption);
        const allowed = load.data.inspectors.find(row => String(row.userId) === fiscalOption).contractIds;
        for (const id of await horizon.locator('[data-expiry-contract-id]').evaluateAll(rows => rows.map(row => Number(row.dataset.expiryContractId)))) assert.ok(allowed.includes(id));
        await fiscalSelect.selectOption('');
      }
      await page.getByRole('combobox', { name: 'Risco: Saldo ou Vigência', exact: true }).selectOption('CRITICAL');
      for (const id of await horizon.locator('[data-expiry-contract-id]').evaluateAll(rows => rows.map(row => Number(row.dataset.expiryContractId)))) {
        const row = manager.data.contractRiskMatrix.find(row => row.contractId === id);
        assert.ok(row.saldo.status === 'CRITICAL' || row.vigencia === 'CRITICAL');
      }
      await page.getByRole('combobox', { name: 'Risco: Saldo ou Vigência', exact: true }).selectOption('');
      assert.deepEqual(await horizon.locator('[data-expiry-contract-id]').evaluateAll(rows => rows.map(row => row.dataset.expiryContractId)), originalIds);
      for (const scenario of ['boundaries', 'partial', 'empty', 'unavailable', 'null-contracts', 'scope-unavailable']) {
        const data = structuredClone(manager);
        const sample = data.data.contracts[0];
        const offsets = [-1, 0, 30, 31, 60, 61, 90, 91, 120, 121, 180, 181];
        data.data.contracts = offsets.map((days, index) => ({ ...sample, contractId: 100 + index, contractNumber: `GC037-${index}`, supplierName: index === 1 ? null : 'Fornecedor verificável',
          expiryDate: new Date(Date.parse(`${data.meta.dataReference}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10) }));
        if (scenario === 'partial') data.data.contracts.push({ ...sample, contractId: 999, expiryDate: null });
        if (scenario === 'empty') data.data.contracts = [];
        if (scenario === 'unavailable' || scenario === 'null-contracts') {
          data.meta.dataCoverage.portfolio = 'UNAVAILABLE'; data.data.contracts = null;
          data.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE'; data.data.contractRiskMatrix = null;
        } else {
          const matrixSample = manager.data.contractRiskMatrix[0];
          data.data.contractRiskMatrix = data.data.contracts.map(contract => ({ ...matrixSample,
            contractId: contract.contractId, contractNumber: contract.contractNumber, supplierName: contract.supplierName }));
        }
        await page.route('**/api/**', route => {
          const url = route.request().url();
          const body = url.includes('/fiscais/carga') ? load : data;
          return route.fulfill({ status: scenario === 'scope-unavailable' && url.includes('/fiscais/carga') ? 500 : 200,
            contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.reload({ waitUntil: 'networkidle' });
        if (scenario === 'scope-unavailable') await page.getByRole('searchbox').fill('GC037');
        const unavailable = ['unavailable', 'null-contracts', 'scope-unavailable'].includes(scenario);
        assert.equal(await horizon.locator('[data-expiry-contract-id]').count(), unavailable || scenario === 'empty' ? 0 : 10);
        assert.equal(await horizon.locator('.aggregate-expiry-summary strong').innerText(), unavailable || scenario === 'partial' ? 'Indisponível' : scenario === 'empty' ? '0' : '10');
        if (scenario === 'partial') assert.ok((await horizon.innerText()).includes('Cobertura parcial'));
        if (!unavailable && scenario !== 'empty') assert.deepEqual(await horizon.locator('dd').allTextContents(), ['2', '2', '2', '2', '2']);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await horizon.screenshot({ path: `${output}/aggregate-${width}-${scenario}.png` });
      }
      assert.deepEqual(errors, []);
    }
    await page.close();

    const reference = await browser.newPage({ viewport: { width, height: 900 } });
    await reference.route(/^https?:\/\//, route => route.abort());
    const filename = role === 'manager' ? 'ETICE_Dashboard_Gerente_Contratos_React_Recharts.html' :
      role === 'aggregate' ? 'ETICE_Dashboard_Gerente_Contratos_Autocontido_v4_ABC.html' :
        'ETICE_Dashboard_Fiscal_Autocontido_v4_ABC.html';
    await reference.goto(pathToFileURL(resolve(role === 'fiscal' ? 'docs/reference' : 'docs/reference/prototypes', filename)).href, { waitUntil: 'load' });
    await reference.screenshot({ path: `${output}/${role}-${width}-prototipo.png`, fullPage: true });
    await reference.close();
    report.push({ role, width, errors, overflow: false, panels: expected[role] });
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ result: 'PASS', cases: report }, null, 2));
  process.stdout.write(JSON.stringify({ result: 'PASS', cases: report.length, output }) + '\n');
} finally { await browser.close(); }
