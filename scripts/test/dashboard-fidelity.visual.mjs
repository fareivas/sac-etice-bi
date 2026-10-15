// Historical manager-only script. Fiscal validation: fiscal-visual-reform.visual.mjs.
// VIS-002: fixtures live only in intercepted browser responses, never in production.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const imported = await import(pathToFileURL(resolve(process.argv[2])).href);
const { manager } = imported.default ?? imported;
const output = resolve(process.argv[3] ?? '/tmp/vis002');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
    for (const [screen, width, height] of [['desktop', 1440, 1000], ['tablet', 900, 1000], ['narrow', 390, 844]]) {
        const role = 'manager';
        const page = await browser.newPage({ viewport: { width, height } });
        const errors = [];
        let requests = 0;
        let current = structuredClone(manager);
        let fail = false;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', route => {
            requests++;
            const url = route.request().url();
            if (url.includes('/fiscais/carga') || url.includes('/fornecedores/resumo')) {
                return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            }
            assert.ok(url.includes('/dashboard/resumo'));
            return route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(current) });
        });
        const url = `${process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5183'}/gerente-contratos`;
        const open = () => page.goto(url, { waitUntil: 'networkidle' });
        await open();
        const chart = page.locator('.manager-band-distribution');
        const legend = chart.locator('.item-band-chart-legend');
        const items = page.locator('.fiscal-saldos');
        const filters = items.locator('.saldo-filters select');
        const counts = () => legend.locator('li').allTextContents();
        const initialRequests = requests;
        assert.deepEqual(await counts(), ['Adequado: 24', 'Atenção: 24', 'Crítico: 24', 'Não verificável: 24']);
        assert.equal(await chart.locator('.recharts-sector').count(), 4);
        assert.equal(await chart.locator('.item-band-chart button').count(), 0);
        assert.deepEqual((await page.locator('.panel-heading h2').allTextContents()).slice(0, 9), ['Carga e risco por fiscal',
            'Qualidade preventiva da gestão', 'Matriz Contrato × Dimensão de Risco', 'Fornecedores estratégicos: valor × risco',
            'Intervenções gerenciais', 'Curva ABC de Fornecedores', 'Distribuição dos itens por faixa de saldo',
            'Gestão dos Saldos dos Itens Contratuais', 'Eficiência do Ciclo Financeiro — carteira gerenciada']);
        assert.equal(await page.locator('[data-quality-ring]').count(), 2);
        assert.ok((await page.locator('.manager-complementary').innerText()).includes('Curva ABC de Clientes'));
        await page.screenshot({ path: `${output}/${role}-${screen}-full.png`, fullPage: true });
        await chart.screenshot({ path: `${output}/${role}-${screen}-distribution.png` });
        await filters.nth(0).selectOption('Fornecedor A');
        await filters.nth(1).selectOption('2');
        await items.locator('.saldo-filters input').fill('SERVIÇO GRUPO A');
        assert.deepEqual(await counts(), ['Adequado: 12', 'Atenção: 12', 'Crítico: 12', 'Não verificável: 12']);
        await filters.nth(2).selectOption('critico');
        assert.deepEqual(await counts(), ['Adequado: 0', 'Atenção: 0', 'Crítico: 12', 'Não verificável: 0']);
        await chart.screenshot({ path: `${output}/${role}-${screen}-filtered.png` });
        await items.locator('.saldo-filters input').fill('sem correspondência');
        assert.deepEqual(await counts(), ['Adequado: 0', 'Atenção: 0', 'Crítico: 0', 'Não verificável: 0']);
        assert.ok((await chart.innerText()).includes('Nenhum item encontrado com os filtros atuais.'));
        assert.equal(await chart.locator('.recharts-sector').count(), 0);
        assert.equal(requests, initialRequests);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        current.data.itemBalances.itens = [];
        current.data.itemBalances.resumo = { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 };
        for (const key of Object.keys(current.data.itemBalances.agregados))
            current.data.itemBalances.agregados[key] = 0;
        await open();
        assert.ok((await chart.innerText()).includes('Sem itens cadastrados na carteira.'));
        current.data.itemBalances = { coverage: 'UNAVAILABLE' };
        current.meta.dataCoverage.itemBalances = 'UNAVAILABLE';
        await open();
        assert.ok((await chart.innerText()).toLowerCase().includes('indisponível'));
        assert.equal(await legend.count(), 0);
        fail = true;
        await open();
        assert.ok((await page.getByRole('alert').first().innerText()).includes('Erro ao carregar o resumo'));
        assert.equal(await chart.count(), 0);
        assert.deepEqual(errors, []);
        report.push({ role, screen, result: 'PASS', distribution: true, localFilters: true, realZero: true, unavailable: true,
            noItems: true, loadingError: true, noOverflow: true, noBackendCalls: true });
        await page.close();
    }
}
finally {
    await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, report }, null, 2));
