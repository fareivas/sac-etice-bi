// Run against the existing Vite preview; fixtures are fulfilled by the test browser only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const fixtureModule = await import(pathToFileURL(resolve(process.argv[2])).href);
const fixtures = fixtureModule.fixtures ?? fixtureModule.default.fixtures;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const [scenario, fixture] of Object.entries(fixtures)) {
    for (const [screen, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Every API call is handled here; no request can reach the BI backend/database.
      await page.route('**/api/**', route => {
        assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
      });
      await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
      const section = page.locator('.fiscal-saldos');
      await section.waitFor();
      const totalsBefore = await section.locator('.saldo-summary').innerText();
      const contextBefore = await section.locator('.saldo-filter-meta').innerText();
      const items = fixture.data.itemBalances.itens;
      for (const item of items) {
        const button = page.getByRole('button', { name: new RegExp(`detalhes do item ID ${item.itemId}$`) });
        await button.focus();
        await page.keyboard.press('Enter');
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), await button.getAttribute('aria-controls'));
        const panel = page.getByRole('region', { name: `Detalhes do item ID ${item.itemId}`, exact: true });
        await panel.waitFor({ state: 'visible' });
        const text = (await panel.innerText()).replaceAll('\u00a0', ' ');
        const labels = { adequado: 'Adequado', atencao: 'Em atenção', critico: 'Crítico', nao_verificavel: 'Não verificável' };
        assert.ok(text.includes(`Classificação: ${labels[item.faixa]}`));
        assert.ok(text.includes(`Dimensão: ${fixture.data.itemBalances.criterio.dimensao}. Base: ${fixture.data.itemBalances.criterio.base}`));
        assert.ok(text.includes('Limiares provisórios retornados'));
        const criterion = fixture.data.itemBalances.criterio;
        const percent = value => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 20 }).format(value);
        const explanation = item.faixa === 'adequado' ? `maior ou igual ao limiar de atenção (${percent(criterion.limiar_atencao)})`
          : item.faixa === 'atencao' ? `acima do limiar crítico (${percent(criterion.limiar_critico)}) e abaixo do limiar de atenção (${percent(criterion.limiar_atencao)})`
            : item.faixa === 'critico' ? `menor ou igual ao limiar crítico (${percent(criterion.limiar_critico)})`
              : 'A classificação exige contratado positivo e saldo informado';
        assert.ok(text.includes(explanation));
        const renderedFields = await panel.locator('dl').evaluateAll(lists => Object.fromEntries(lists.flatMap(list =>
          [...list.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]))));
        const money = value => value === null ? 'Não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
        assert.equal(renderedFields['Valor contratado'], money(item.valueContracted));
        assert.equal(renderedFields['Valor consumido'], money(item.valueConsumed));
        assert.equal(renderedFields['Valor medido'], money(item.valueMeasured));
        assert.equal(renderedFields['Saldo comprometido em valor'], money(item.valueBalance));
        assert.equal(renderedFields['Saldo medido em valor'], money(item.valueMeasuredBalance));
        if (criterion.base === 'medido' && item.valueContracted !== null && item.valueMeasured === null)
          assert.ok(text.includes('considera medição ausente como zero quando há contratado'));

        if (item.itemId === 103) assert.ok(text.includes('R$ 0,00'));
        if (item.itemId === 104) assert.ok(text.includes('Não informado'));
        const details = button.locator('..');
        await details.scrollIntoViewIfNeeded();
        assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Detail text must fit its region');
        await details.screenshot({ path: `${output}/${scenario}-${screen}-${item.faixa}.png` });
        await button.focus();
        await page.keyboard.press('Space');
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
        assert.equal(await panel.isVisible(), false);
        assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
      }
      assert.equal(await section.locator('.saldo-summary').innerText(), totalsBefore);
      assert.equal(await section.locator('.saldo-filter-meta').innerText(), contextBefore);
      // Reach expansion from search through the approved sort and page-size controls; disabled controls are skipped.
      await section.getByRole('searchbox').focus();
      await page.keyboard.press('Tab');
      assert.equal(await section.getByLabel('Ordenar itens por', { exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await section.getByLabel('Itens por página', { exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Expandir detalhes do item ID 101');
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded')), 'true');
      const focus = await page.evaluate(() => {
        const el = document.activeElement; const r = el.getBoundingClientRect(); const css = getComputedStyle(el);
        return { x: r.x, width: r.width, viewport: innerWidth, outline: css.outlineStyle, outlineWidth: css.outlineWidth };
      });
      assert.ok(focus.x >= 0 && focus.x + focus.width <= focus.viewport + 1, 'Keyboard-focused control must remain in view');
      assert.notEqual(focus.outline, 'none');
      assert.notEqual(focus.outlineWidth, '0px');
      await page.locator('.fiscal-item-details').first().screenshot({ path: `${output}/${scenario}-${screen}-keyboard-focus.png` });
      await page.screenshot({ path: `${output}/${scenario}-${screen}-viewport.png` });
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      assert.ok(overflow.page <= overflow.viewport + 1, 'Page must not overflow; table scroll is local');
      assert.deepEqual(errors, []);
      report.push({ scenario, screen, viewport: `${width}x${height}`, result: 'PASS', items: items.map(item => item.faixa), focus, overflow });
      await page.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', cases: report.length, captures: report.length * 6, output, checks: ['Enter expands', 'Space collapses', 'Tab navigation', 'focus retained and visible', 'API-derived criteria', 'zero and missing values', 'totals and filters preserved', 'narrow layout without page overflow', 'no backend calls'] }, null, 2));
