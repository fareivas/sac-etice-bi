import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';

type Balances = NonNullable<FiscalDashboardSummaryResponse['data']['contractBalances']>;
const percent = (value: number) =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;

/** Plots only the approved percentage returned by the API, without classifying contract risk. */
export function FiscalContractBalanceChart({ balances }: { balances: Balances }) {
  if (!balances.length) return null;
  const data = balances.flatMap((balance) =>
    balance.balancePct === null
      ? []
      : [
          {
            contract: balance.contractNumber ?? `Contrato ID ${balance.contractId}`,
            balancePct: balance.balancePct,
          },
        ]
  );
  if (!data.length)
    return (
      <p role="status" className="source-note">
        Percentuais de saldo indisponíveis; valores contratuais preservados na tabela.
      </p>
    );
  const chartData = data.map((row) => ({ ...row, label: `${row.contract} · ${percent(row.balancePct)}` }));
  const missing = balances.length - data.length;
  const domain = [
    Math.min(0, ...data.map((row) => row.balancePct)),
    Math.max(100, ...data.map((row) => row.balancePct)),
  ];
  return (
    <figure className="fiscal-contract-chart">
      <figcaption className="source-note">
        Percentual disponível informado pela API, sem classificação de risco. Valores completos na tabela.
        Carteira completa; filtros locais de itens não se aplicam.
      </figcaption>
      {missing > 0 && (
        <p role="status" className="source-note">
          {missing} contrato(s) sem percentual disponível; não representados como zero.
        </p>
      )}
      <div
        className="fiscal-contract-chart-scroll"
        role="img"
        aria-label={`Percentual de saldo por contrato: ${data.map((row) => `${row.contract}: ${percent(row.balancePct)}`).join('; ')}.`}
      >
        <div style={{ height: Math.max(275, data.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 8, right: 24, top: 12, bottom: 12 }}
              accessibilityLayer={false}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={domain} unit="%" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={125} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => (typeof value === 'number' ? percent(value) : String(value))} />
              <Bar
                dataKey="balancePct"
                name="Saldo disponível"
                fill="#164e63"
                radius={[0, 5, 5, 0]}
                isAnimationActive={false}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}
