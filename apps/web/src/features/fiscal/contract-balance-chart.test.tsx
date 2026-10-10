import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiscalContractBalanceChart } from './contract-balance-chart';
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  BarChart: ({ data, children }: { data: unknown[]; children: React.ReactNode }) => (
    <svg data-values={JSON.stringify(data)}>{children}</svg>
  ),
  XAxis: ({ domain }: { domain: number[] }) => <g data-domain={JSON.stringify(domain)} />,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  LabelList: () => null,
  Bar: ({ fill }: { fill: string }) => <path fill={fill} />,
}));
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
  expect(html).toContain('fill="#164e63"');
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
it('sizes the chart by available records while retaining every row for local scrolling', () => {
  const render = (values: (number | null)[]) =>
    renderToStaticMarkup(
      <FiscalContractBalanceChart balances={values.map((value, i) => balance(i + 1, value))} />
    );
  expect(render([0, null])).toContain('height:110px');
  expect(render([0, 50])).toContain('height:142px');
  const many = render(Array.from({ length: 20 }, (_, i) => i));
  expect(many).toContain('height:934px');
  expect(many).toContain('Contrato ID 20: 19%');
});
