import type { FiscalDashboardSummaryResponse } from '@sac-etice-bi/contracts';

type Balances = NonNullable<FiscalDashboardSummaryResponse['data']['contractBalances']>;
const percent = (value: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;

/** Compact model bars: approved API values, with a shared signed scale and no risk classification. */
export function FiscalContractBalanceChart({ balances }: { balances: Balances }) {
  if (!balances.length) return null;
  const data = balances.flatMap(row => row.balancePct === null ? [] : [{
    contractId: row.contractId, contract: row.contractNumber ?? `Contrato ID ${row.contractId}`, value: row.balancePct,
  }]);

  if (!data.length) return <p role="status" className="source-note">Percentuais de saldo indisponíveis.</p>;
  const min = Math.min(0, ...data.map(row => row.value));
  const max = Math.max(100, ...data.map(row => row.value));
  const missing = balances.length - data.length;
  return <figure className="fiscal-contract-chart">
    <figcaption className="source-note">Percentual disponível da API, sem classificação de risco.</figcaption>
    {missing > 0 && <p role="status" className="source-note">{missing} contrato(s) sem percentual disponível; não representados como zero.</p>}
    <div className="fiscal-contract-chart-scroll" role="img" data-domain={JSON.stringify([min, max])}
      aria-label={`Percentual de saldo por contrato: ${data.map(row => `${row.contract}: ${percent(row.value)}`).join('; ')}.`}>
      {data.map(row => <div className="fiscal-model-bar" key={row.contractId}>
        <span className="fiscal-model-bar-label">{row.contract}</span>
        <div className="fiscal-model-track" aria-hidden="true">
          {min < 0 && <i className="fiscal-model-origin" style={{ left: `${-min / (max - min) * 100}%` }} />}
          <i className="fiscal-model-fill" style={{ left: `${(Math.min(0, row.value) - min) / (max - min) * 100}%`, width: `${Math.abs(row.value) / (max - min) * 100}%` }} />
        </div><b>{percent(row.value)}</b>
      </div>)}
    </div>
    {(min < 0 || max > 100) && <p className="source-note">Escala comum ampliada para preservar saldos negativos ou acima de 100%, sem limitar os valores recebidos.</p>}
  </figure>;
}
