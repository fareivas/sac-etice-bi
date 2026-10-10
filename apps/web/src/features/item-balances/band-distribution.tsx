import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export const itemBands = [
  { key: 'adequado', label: 'Adequado', color: '#16a34a' },
  { key: 'atencao', label: 'Atenção', color: '#f59e0b' },
  { key: 'critico', label: 'Crítico', color: '#dc2626' },
  { key: 'nao_verificavel', label: 'Não verificável', color: '#64748b' },
] as const;
type Distribution = Record<typeof itemBands[number]['key'], number>;

/** Informativo: os filtros aprovados continuam nos controles de cada dashboard. */
export function BandDistribution({ distribution, available, hasItems, title, scope, outerRadius = 94 }: {
  distribution: Distribution; available: boolean; hasItems: boolean; title: string; scope: string; outerRadius?: number;
}) {
  if (!available) return <div className="panel-unavailable" role="status">Distribuição indisponível: fonte de itens indisponível.</div>;
  const data = itemBands.map(band => ({ ...band, value: distribution[band.key] }));
  const total = data.reduce((sum, band) => sum + band.value, 0);
  return <figure className="item-band-chart" aria-label={title}>
    <figcaption className="source-note">{scope}</figcaption>
    {total > 0 ? <div className="item-band-chart-canvas" role="img" aria-label={`${title}. ${data.map(band => `${band.label}: ${band.value}`).join('; ')}. ${scope}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart accessibilityLayer={false}>
          <Pie data={data.filter(band => band.value > 0)} dataKey="value" nameKey="label" innerRadius={62} outerRadius={outerRadius}
            paddingAngle={3} isAnimationActive={false}>
            {data.filter(band => band.value > 0).map(band => <Cell key={band.key} fill={band.color} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div> : <p className="table-empty" role="status">{hasItems ? 'Nenhum item encontrado com os filtros atuais.' : 'Sem itens cadastrados na carteira.'}</p>}
    <ul className="item-band-chart-legend" aria-label="Contagens por faixa">
      {data.map(band => <li key={band.key}><i style={{ background: band.color }} aria-hidden="true" />{band.label}: {band.value}</li>)}
    </ul>
  </figure>;
}
