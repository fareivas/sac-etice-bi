// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiscalContractBalanceChart } from './contract-balance-chart';
const balance = (id: number, value: number | null) => ({
  contractId: id,
  contractNumber: null,
  contractedValue: 1000,
  consumedValue: 1,
  balanceValue: 999,
  balancePct: value,
});
it('plots returned percentages including zero without recalculating or classifying risk', () => {
  const html = renderToStaticMarkup(
    <FiscalContractBalanceChart balances={[balance(1, 0), balance(2, 50)]} />
  );
  expect(html).toContain('Contrato ID 1: 0%');
  expect(html).toContain('Contrato ID 2: 50%');
  expect(html).not.toContain('99,9%');
  expect(html).toContain('fiscal-model-fill');
  expect(html).not.toContain('<svg');
  expect(html).toContain('Percentual disponível da API, sem classificação de risco');
  expect(html).not.toContain('<button');
});
it('keeps negative and above-100 values in the scale, omitting only missing percentages', () => {
  const html = renderToStaticMarkup(
    <FiscalContractBalanceChart balances={[balance(1, -20), balance(2, 150), balance(3, null)]} />
  );
  expect(html).toContain('data-domain="[-20,150]"');
  expect(html).toContain('Contrato ID 1: -20%');
  expect(html).toContain('Contrato ID 2: 150%');
  expect(html).not.toContain('Contrato ID 3: 0%');
  expect(html).toContain('1 contrato(s) sem percentual disponível');
});
it('distinguishes no contracts and unavailable percentages without fabricated bars', () => {
  expect(renderToStaticMarkup(<FiscalContractBalanceChart balances={[]} />)).toBe('');
  const html = renderToStaticMarkup(<FiscalContractBalanceChart balances={[balance(1, null)]} />);
  expect(html).toContain('Percentuais de saldo indisponíveis');
  expect(html).not.toContain('<svg');
});
it('retains every known row for compact local scrolling', () => {
  const html = renderToStaticMarkup(<FiscalContractBalanceChart balances={Array.from({ length: 20 }, (_, i) => balance(i + 1, i))} />);
  expect(html.match(/class="fiscal-model-bar"/g)).toHaveLength(20);
  expect(html).toContain('Contrato ID 20: 19%');
  expect(html).not.toContain('<svg');
});

it('exposes exact contract names and percentages accessibly without treating unavailable values as zero', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<FiscalContractBalanceChart balances={[
    { ...balance(1, 0), contractNumber: 'CT-001' }, balance(2, -20), balance(3, 150), balance(4, null),
  ]} />);
  const chart = host.querySelector('[role="img"]')!;
  expect(chart.getAttribute('aria-label')).toBe('Percentual de saldo por contrato: CT-001: 0%; Contrato ID 2: -20%; Contrato ID 3: 150%.');
  expect([...chart.querySelectorAll('.fiscal-model-bar b')].map(node => node.textContent)).toEqual(['0%', '-20%', '150%']);
  const fills = chart.querySelectorAll<HTMLElement>('.fiscal-model-fill');
  expect(fills[0].style.width).toBe('0%');
  expect(parseFloat(fills[1].style.width)).toBeCloseTo(20 / 170 * 100);
  expect(parseFloat(fills[2].style.width)).toBeCloseTo(150 / 170 * 100);
  expect(parseFloat(fills[1].style.left)).toBe(0);
  expect(parseFloat(fills[2].style.left)).toBeCloseTo(20 / 170 * 100);
  expect(host.textContent).toContain('1 contrato(s) sem percentual disponível');
});
it('keeps all-unavailable percentages distinct from a real zero and from an empty portfolio', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<FiscalContractBalanceChart balances={[balance(1, null), balance(2, null)]} />);
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Percentuais de saldo indisponíveis.');
  expect(host.querySelector('[role="img"], .fiscal-model-fill')).toBeNull();
  expect(host.textContent).not.toContain('0%');
});
