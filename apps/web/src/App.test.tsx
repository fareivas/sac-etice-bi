// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./features/fiscal', () => ({ FiscalDashboard: () => <div>Dashboard Fiscal</div> }));
vi.mock('./features/gerente-contratos', () => ({ ManagerDashboard: () => <div>Dashboard Supervisão</div> }));
vi.mock('./features/gerente-contratos/aggregate', () => ({ ManagerAggregateDashboard: () => <div>Dashboard Visão agregada</div> }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function mount(path: string) {
  window.history.replaceState(null, '', path);
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<App />));
  return { host, unmount: () => act(() => root.unmount()) };
}
afterEach(() => window.history.replaceState(null, '', '/'));

it.each([
  ['/', 'Dashboard Fiscal'],
  ['/gerente-contratos/supervisao', 'Dashboard Supervisão'],
  ['/gerente-contratos/visao-agregada', 'Dashboard Visão agregada'],
])('routes %s to its independent dashboard', (path, expected) => {
  const view = mount(path);
  try { expect(view.host.textContent).toBe(expected); } finally { view.unmount(); }
});

it('redirects the legacy manager URL to supervision', () => {
  const view = mount('/gerente-contratos');
  try {
    expect(window.location.pathname).toBe('/gerente-contratos/supervisao');
    expect(view.host.textContent).toBe('Dashboard Supervisão');
  } finally { view.unmount(); }
});

it('reports unknown URLs explicitly', () => {
  const view = mount('/gerente-contratos/desconhecido');
  try { expect(view.host.textContent).toContain('Página não encontrada'); } finally { view.unmount(); }
});
