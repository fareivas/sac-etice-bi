import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const module = await import(pathToFileURL(resolve(process.argv[2])).href);
const fixtures = module.fixtures ?? module.default.fixtures;
const output = resolve(process.argv[3] ?? '/tmp/sac-fiscal-visual/expiry-captures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const [scenario, { summary, labels }] of Object.entries(fixtures)) {
    for (const [screen, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
      for (const timezoneId of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
        const page = await browser.newPage({ viewport: { width, height }, timezoneId });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.setFixedTime(new Date('2040-01-01T23:00:00Z'));
        await page.route('**/api/**', route => {
          assert.ok(route.request().url().includes('/fiscais/me/dashboard/resumo'));
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary) });
        });
        await page.goto(process.env.FISCAL_PREVIEW_URL ?? 'http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
        for (const title of ['Alertas contratuais', 'Contratos fiscalizados']) {
          const panel = page.locator('.fiscal-panel').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
          await panel.waitFor();
          const renderedLabels = await panel.locator('.fiscal-contract-expiry small').allTextContents();
          assert.deepEqual(renderedLabels, labels);
          const dates = title === 'Alertas contratuais' ? summary.data.contractAlerts : summary.data.contracts;
          const expectedDates = (dates ?? []).filter(row => row.expiryDate !== null).map(row => row.expiryDate.split('-').reverse().join('/'));
          assert.deepEqual(await panel.locator('.fiscal-contract-expiry time').allTextContents(), expectedDates);
          const text = await panel.innerText();
          assert.ok(text.includes('vigência contratual, não ao prazo de decisão fiscal'));
          assert.ok(text.includes(summary.meta.dataReference.split('-').reverse().join('/')));
          if (!labels.length) assert.ok(text.includes('Indisponível'));
          // Bring the expiry column into view without changing the table's existing mobile scroll behavior.
          await panel.locator('.fiscal-table-wrap').evaluate(el => { el.scrollLeft = el.scrollWidth; });
          for (const cell of await panel.locator('.fiscal-contract-expiry').all()) {
            assert.ok(await cell.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
          }
          if (timezoneId === 'Pacific/Kiritimati') {
            await panel.screenshot({ path: `${output}/${scenario}-${screen}-${title === 'Alertas contratuais' ? 'alerts' : 'contracts'}.png` });
          }
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        report.push({ scenario, screen, timezoneId, fixedBrowserTime: '2040-01-01T23:00:00Z',
          reference: summary.meta.dataReference, labels, result: 'PASS' });
        await page.close();
      }
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: 'PASS', cases: report.length, output,
  checks: ['expiry and reference calendar dates', 'dates preserved', 'opposite timezones and browser clock ignored',
    'unavailable historical lists', 'desktop and narrow layout', 'no backend or database calls'] }, null, 2));
