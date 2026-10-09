// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { FiscalItemBalance, FiscalItemBalances } from '@sac-etice-bi/contracts';
import { FiscalItemBalanceDetails } from './item-balance-details';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
type Criteria = Extract<FiscalItemBalances, { coverage: 'AVAILABLE' }>['criterio'];
const criteria: Criteria = { base: 'comprometido', dimensao: 'valor', limiar_atencao: .6, limiar_critico: .1 };
const item: FiscalItemBalance = {
  itemId: 10, contractId: 2, contractNumber: '13/2025', supplierName: 'Fornecedor',
  sequence: 1, specification: 'Serviço', unit: 'h', quantityContracted: 20,
  quantityConsumed: 6, quantityMeasured: 4, quantityBalance: 14, quantityMeasuredBalance: 16,
  valueContracted: 1000, valueConsumed: 300, valueMeasured: 200,
  valueBalance: 700, valueMeasuredBalance: 800, pctSaldo: .7, pctSaldoMedido: .8,
  faixa: 'adequado', statusVerificacao: 'verificado', blockedAt: null, blockReason: null,
};
function mount(value = item, criterion = criteria) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<FiscalItemBalanceDetails item={value} criteria={criterion} />));
  const button = host.querySelector('button')!;
  const panel = host.querySelector<HTMLElement>('[role="region"]')!;
  const toggle = () => act(() => button.click());
  const values = () => Object.fromEntries([...panel.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling?.textContent]));
  return { host, button, panel, toggle, values, close: () => { act(() => root.unmount()); host.remove(); } };
}

it('uses a focusable native button with expansion state and a unique controlled region', () => {
  const view = mount();
  try {
    expect(view.button.type).toBe('button');
    expect(view.button.tabIndex).toBe(0);
    expect(view.button.getAttribute('aria-expanded')).toBe('false');
    expect(view.button.getAttribute('aria-controls')).toBe(view.panel.id);
    expect(view.button.getAttribute('aria-label')).toContain('item ID 10');
    expect(view.panel.hidden).toBe(true);
    view.button.focus();
    expect(document.activeElement).toBe(view.button);
    view.toggle();
    expect(view.button.getAttribute('aria-expanded')).toBe('true');
    expect(view.button.textContent).toBe('Recolher detalhes');
    expect(view.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(view.button);
    const other = mount({ ...item, itemId: 11 });
    try { expect(other.panel.id).not.toBe(view.panel.id); } finally { other.close(); }
    view.toggle();
    expect(view.button.getAttribute('aria-expanded')).toBe('false');
    expect(view.panel.hidden).toBe(true);
  } finally { view.close(); }
});

it('shows every returned monetary and quantity value and separates verification from the balance band', () => {
  const view = mount();
  try {
    view.toggle();
    expect(view.values()).toEqual({
      'Valor contratado': 'R$ 1.000,00', 'Valor consumido': 'R$ 300,00', 'Valor medido': 'R$ 200,00',
      'Saldo comprometido em valor': 'R$ 700,00', 'Saldo medido em valor': 'R$ 800,00',
      Unidade: 'h', 'Quantidade contratada': '20', 'Quantidade consumida': '6', 'Quantidade medida': '4',
      'Saldo comprometido em quantidade': '14', 'Saldo medido em quantidade': '16',
    });
    expect(view.panel.textContent).toContain('Status de verificação: verificado');
    expect(view.panel.textContent).toContain('Este status é separado da classificação do saldo');
    expect(view.panel.textContent).toContain('Base: comprometido');
    expect(view.panel.textContent).toContain('Percentual retornado para esta base: 70%');
    expect(view.panel.textContent).toContain('Limiares provisórios retornados');
  } finally { view.close(); }
});

it.each([
  ['adequado', .8, 'maior ou igual ao limiar de atenção (80%)'],
  ['atencao', .5, 'acima do limiar crítico (20%) e abaixo do limiar de atenção (80%)'],
  ['critico', .2, 'menor ou igual ao limiar crítico (20%)'],
] as const)('explains %s using returned custom thresholds', (faixa, ratio, explanation) => {
  const view = mount({ ...item, faixa, valueBalance: ratio * 1000, pctSaldo: ratio },
    { ...criteria, limiar_atencao: .8, limiar_critico: .2 });
  try {
    view.toggle();
    expect(view.panel.textContent).toContain(explanation);
    expect(view.panel.textContent).not.toContain('60%');
    expect(view.panel.textContent).not.toContain('10%');
  } finally { view.close(); }
});

it('keeps the service band when the returned rounded percentage lies on a threshold', () => {
  const view = mount({ ...item, faixa: 'atencao', pctSaldo: .6, valueBalance: 600 });
  try {
    view.toggle();
    expect(view.panel.textContent).toContain('Classificação: Em atenção');
    expect(view.panel.textContent).toContain('Percentual retornado para esta base: 60%');
    expect(view.panel.textContent).toContain('usa a razão decimal sem arredondamento');
  } finally { view.close(); }
});

it.each([
  ['comprometido', 'valor', .7, 'saldo comprometido / valor contratado'],
  ['medido', 'valor', .8, 'saldo medido / valor contratado'],
  ['comprometido', 'quantidade', .7, 'saldo comprometido / quantidade contratada'],
  ['medido', 'quantidade', .8, 'saldo medido / quantidade contratada'],
] as const)('explains the %s/%s criteria without recalculating balances', (base, dimensao, ratio, formula) => {
  const view = mount(item, { ...criteria, base, dimensao });
  try {
    view.toggle();
    expect(view.panel.textContent).toContain(`Dimensão: ${dimensao}. Base: ${base}`);
    expect(view.panel.textContent).toContain(`Razão utilizada: ${formula}`);
    expect(view.panel.textContent).toContain(`Percentual retornado para esta base: ${ratio * 100}%`);
  } finally { view.close(); }
});

it.each([
  [{ valueContracted: null }, 'Valor contratado não informado'],
  [{ valueContracted: 0 }, 'Valor contratado não positivo'],
  [{ valueContracted: -1 }, 'Valor contratado não positivo'],
  [{ valueBalance: null }, 'Saldo comprometido não informado na dimensão valor'],
] as const)('explains missing or non-positive input without substituting zero: %j', (values, explanation) => {
  const view = mount({ ...item, ...values, faixa: 'nao_verificavel', pctSaldo: null });
  try {
    view.toggle();
    expect(view.panel.textContent).toContain('Classificação: Não verificável');
    expect(view.panel.textContent).toContain(explanation);
    expect(view.panel.textContent).toContain('Percentual retornado para esta base: Não calculável');
  } finally { view.close(); }
});

it('explains unverifiable measured quantities using the selected inputs', () => {
  const view = mount({ ...item, quantityContracted: null, quantityMeasuredBalance: null,
    faixa: 'nao_verificavel', pctSaldoMedido: null }, { ...criteria, base: 'medido', dimensao: 'quantidade' });
  try {
    view.toggle();
    expect(view.panel.textContent).toContain('Quantidade contratada não informada');
    expect(view.panel.textContent).toContain('Saldo medido não informado na dimensão quantidade');
    expect(view.panel.textContent).not.toContain('Valor contratado não positivo');
  } finally { view.close(); }
});

it('preserves observed zeros and missing measurements, explaining the service convention separately', () => {
  const view = mount({ ...item, valueConsumed: 0, quantityConsumed: 0, valueMeasured: null,
    quantityMeasured: null, valueMeasuredBalance: 1000, quantityMeasuredBalance: 20,
    unit: null, statusVerificacao: null }, { ...criteria, base: 'medido' });
  try {
    view.toggle();
    expect(view.values()['Valor consumido']).toBe('R$ 0,00');
    expect(view.values()['Quantidade consumida']).toBe('0');
    expect(view.values()['Valor medido']).toBe('Não informado');
    expect(view.values()['Quantidade medida']).toBe('Não informado');
    expect(view.values()['Saldo medido em valor']).toBe('R$ 1.000,00');
    expect(view.values().Unidade).toBe('Não informada');
    expect(view.panel.textContent).toContain('considera medição ausente como zero quando há contratado');
    expect(view.panel.textContent).toContain('Status de verificação: Não informado');
  } finally { view.close(); }
});

it('preserves provisional threshold precision and shows a real zero balance as critical', () => {
  const view = mount({ ...item, faixa: 'critico', valueBalance: 0, pctSaldo: 0 },
    { ...criteria, limiar_critico: .100001, limiar_atencao: .600001 });
  try {
    view.toggle();
    expect(view.panel.textContent).toContain('Classificação: Crítico');
    expect(view.panel.textContent).toContain('menor ou igual ao limiar crítico (10,0001%)');
    expect(view.panel.textContent).toContain('adequado ≥ 60,0001%');
    expect(view.values()['Saldo comprometido em valor']).toBe('R$ 0,00');
    expect(view.panel.textContent).toContain('Percentual retornado para esta base: 0%');
  } finally { view.close(); }
});
