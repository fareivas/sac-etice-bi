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
    'Intervenções gerenciais priorizadas', 'Forecast 180 dias', 'Exposição financeira',
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
      const forecast = page.locator('.aggregate-forecast');
      const assertForecast = async () => {
        assert.deepEqual(await forecast.locator('.aggregate-alert strong').allTextContents(), ['Indisponível', 'Indisponível']);
        assert.equal(await forecast.locator('table, dl, [data-expiry-contract-id], .aggregate-expiry-summary').count(), 0);
        const text = await forecast.innerText();
        assert.ok(text.includes('de contratos com risco de saldo ou vigência'));
        assert.ok(text.includes('exigem renovação/aditivo/licitação'));
        assert.ok(text.includes('Fonte e regra de previsão indisponíveis'));
        assert.ok(text.includes('Fonte e regra de decisão indisponíveis'));
      };
      await assertForecast();
      for (const days of ['90', '365']) {
        await page.getByRole('combobox', { name: 'Janela de vencimento', exact: true }).selectOption(days);
        await assertForecast();
      }
      await page.getByRole('searchbox').fill('sem correspondência GC037');
      await assertForecast();
      await page.getByRole('searchbox').fill('');
      for (const scenario of ['partial', 'empty', 'unavailable']) {
        const data = structuredClone(manager);
        if (scenario === 'partial') {
          data.data.contracts.push({ ...data.data.contracts[0], contractId: 999, expiryDate: null });
          data.data.contractRiskMatrix.push({ ...data.data.contractRiskMatrix[0], contractId: 999 });
        }
        if (scenario === 'empty') { data.data.contracts = []; data.data.contractRiskMatrix = []; }
        if (scenario === 'unavailable') {
          data.meta.dataCoverage.portfolio = 'UNAVAILABLE'; data.data.contracts = null;
          data.meta.dataCoverage.contractRiskMatrix = 'UNAVAILABLE'; data.data.contractRiskMatrix = null;
        }
        await page.route('**/api/**', route => {
          const url = route.request().url();
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/fiscais/carga') ? load : data) });
        });
        await page.reload({ waitUntil: 'networkidle' });
        await assertForecast();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await forecast.screenshot({ path: `${output}/aggregate-${width}-${scenario}.png` });
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
