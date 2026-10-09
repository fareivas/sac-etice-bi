import { useId, useState } from 'react';
import type { FiscalItemBalance, FiscalItemBalances } from '@sac-etice-bi/contracts';

type Criteria = Extract<FiscalItemBalances, { coverage: 'AVAILABLE' }>['criterio'];
const money = (value: number | null) => value === null ? 'Não informado' :
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const quantity = (value: number | null) => value === null ? 'Não informado' :
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 }).format(value);
const percent = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 20 }).format(value);
const bandLabels = { adequado: 'Adequado', atencao: 'Em atenção', critico: 'Crítico', nao_verificavel: 'Não verificável' } as const;

function ClassificationExplanation({ item, criteria }: { item: FiscalItemBalance; criteria: Criteria }) {
  const isQuantity = criteria.dimensao === 'quantidade';
  const isMeasured = criteria.base === 'medido';
  const contracted = isQuantity ? item.quantityContracted : item.valueContracted;
  const balance = isQuantity
    ? isMeasured ? item.quantityMeasuredBalance : item.quantityBalance
    : isMeasured ? item.valueMeasuredBalance : item.valueBalance;
  const ratio = isMeasured ? item.pctSaldoMedido : item.pctSaldo;
  const contractedLabel = isQuantity ? 'Quantidade contratada' : 'Valor contratado';
  const missing: string[] = [];
  if (contracted === null) missing.push(`${contractedLabel} ${isQuantity ? 'não informada' : 'não informado'}`);
  else if (contracted <= 0) missing.push(`${contractedLabel} ${isQuantity ? 'não positiva' : 'não positivo'}`);
  if (balance === null) missing.push(`Saldo ${isMeasured ? 'medido' : 'comprometido'} não informado na dimensão ${criteria.dimensao}`);
  const reason = item.faixa === 'adequado' ? `Saldo / contratado maior ou igual ao limiar de atenção (${percent(criteria.limiar_atencao)}).`
    : item.faixa === 'atencao' ? `Saldo / contratado acima do limiar crítico (${percent(criteria.limiar_critico)}) e abaixo do limiar de atenção (${percent(criteria.limiar_atencao)}).`
      : item.faixa === 'critico' ? `Saldo / contratado menor ou igual ao limiar crítico (${percent(criteria.limiar_critico)}).`
        : missing.length ? `${missing.join('; ')}. A classificação exige contratado positivo e saldo informado na dimensão e base selecionadas.`
          : 'O serviço retornou saldo não verificável; os valores exibidos não permitem identificar a causa com mais precisão.';
  return <div className="fiscal-item-classification">
    <h3>Classificação: {bandLabels[item.faixa]}</h3>
    <p>Dimensão: {isQuantity ? 'quantidade' : 'valor'}. Base: {isMeasured ? 'medido' : 'comprometido'}. Razão utilizada: saldo {isMeasured ? 'medido' : 'comprometido'} / {isQuantity ? 'quantidade contratada' : 'valor contratado'}.</p>
    <p>{reason}</p>
    <p>Percentual retornado para esta base: {ratio === null ? 'Não calculável' : percent(ratio)}. A faixa vem do serviço, que usa a razão decimal sem arredondamento; os valores monetários e percentuais exibidos são arredondados pela API.</p>
    <p>Limiares provisórios retornados: crítico ≤ {percent(criteria.limiar_critico)}; atenção &gt; {percent(criteria.limiar_critico)} e &lt; {percent(criteria.limiar_atencao)}; adequado ≥ {percent(criteria.limiar_atencao)}.</p>
  </div>;
}

export function FiscalItemBalanceDetails({ item, criteria }: { item: FiscalItemBalance; criteria: Criteria }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return <div className="fiscal-item-details">
    <button type="button" aria-expanded={expanded} aria-controls={panelId}
      aria-label={`${expanded ? 'Recolher' : 'Expandir'} detalhes do item ID ${item.itemId}`}
      onClick={() => setExpanded(current => !current)}>{expanded ? 'Recolher detalhes' : 'Expandir detalhes'}</button>
    <div id={panelId} role="region" aria-label={`Detalhes do item ID ${item.itemId}`} hidden={!expanded}>
      {expanded && <>
        <h3>Valores do item</h3>
        <dl>
          <dt>Valor contratado</dt><dd>{money(item.valueContracted)}</dd>
          <dt>Valor consumido</dt><dd>{money(item.valueConsumed)}</dd>
          <dt>Valor medido</dt><dd>{money(item.valueMeasured)}</dd>
          <dt>Saldo comprometido em valor</dt><dd>{money(item.valueBalance)}</dd>
          <dt>Saldo medido em valor</dt><dd>{money(item.valueMeasuredBalance)}</dd>
        </dl>
        <h3>Quantidades do item</h3>
        <dl>
          <dt>Unidade</dt><dd>{item.unit?.trim() || 'Não informada'}</dd>
          <dt>Quantidade contratada</dt><dd>{quantity(item.quantityContracted)}</dd>
          <dt>Quantidade consumida</dt><dd>{quantity(item.quantityConsumed)}</dd>
          <dt>Quantidade medida</dt><dd>{quantity(item.quantityMeasured)}</dd>
          <dt>Saldo comprometido em quantidade</dt><dd>{quantity(item.quantityBalance)}</dd>
          <dt>Saldo medido em quantidade</dt><dd>{quantity(item.quantityMeasuredBalance)}</dd>
        </dl>
        {(item.valueMeasured === null || item.quantityMeasured === null) && <p>No cálculo do saldo medido, o serviço considera medição ausente como zero quando há contratado. O campo de medição original permanece não informado.</p>}
        <ClassificationExplanation item={item} criteria={criteria} />
        <h3>Verificação cadastral</h3>
        <p>Status de verificação: {item.statusVerificacao?.trim() || 'Não informado'}. Este status é separado da classificação do saldo.</p>
      </>}
    </div>
  </div>;
}
