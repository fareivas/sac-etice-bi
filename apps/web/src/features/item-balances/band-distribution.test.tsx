import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BandDistribution } from './band-distribution';
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  PieChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  Pie: ({ data, innerRadius, outerRadius, paddingAngle, children }: { data: unknown[]; innerRadius: number; outerRadius: number; paddingAngle: number; children: React.ReactNode }) =>
    <g data-series={JSON.stringify(data)} data-inner={innerRadius} data-outer={outerRadius} data-padding={paddingAngle}>{children}</g>,
  Cell: ({ fill }: { fill: string }) => <path fill={fill} />,
  Tooltip: () => null,
}));
const props = { distribution: { adequado: 2, atencao: 1, critico: 0, nao_verificavel: 3 }, available: true,
  hasItems: true, title: 'Distribuição', scope: 'Recorte aprovado' };
it('renders approved doughnut geometry, real counts and all textual bands without actions', () => {
  const html = renderToStaticMarkup(<BandDistribution {...props} />);
  expect(html).toContain('data-inner="62"'); expect(html).toContain('data-outer="94"'); expect(html).toContain('data-padding="3"');
  for (const text of ['Adequado: 2', 'Atenção: 1', 'Crítico: 0', 'Não verificável: 3', 'Recorte aprovado']) expect(html).toContain(text);
  expect(html).not.toContain('<button'); expect(html.match(/<path /g)).toHaveLength(3);
  expect(renderToStaticMarkup(<BandDistribution {...props} outerRadius={96} />)).toContain('data-outer="96"');
});
it('distinguishes unavailable, real zero with no results and no registered items', () => {
  const unavailable = renderToStaticMarkup(<BandDistribution {...props} available={false} />);
  expect(unavailable).toContain('Distribuição indisponível'); expect(unavailable).not.toContain('Adequado:');
  const empty = { ...props, distribution: { adequado: 0, atencao: 0, critico: 0, nao_verificavel: 0 } };
  const zero = renderToStaticMarkup(<BandDistribution {...empty} />);
  expect(zero).toContain('Adequado: 0'); expect(zero).toContain('Nenhum item encontrado'); expect(zero).not.toContain('<svg');
  expect(renderToStaticMarkup(<BandDistribution {...empty} hasItems={false} />)).toContain('Sem itens cadastrados');
});
