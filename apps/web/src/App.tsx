import { useEffect } from 'react';
import { FiscalDashboard } from './features/fiscal';
import { ManagerDashboard } from './features/gerente-contratos';
import { ManagerAggregateDashboard } from './features/gerente-contratos/aggregate';

function ManagerRedirect() {
  useEffect(() => {
    window.history.replaceState(null, '', '/gerente-contratos/supervisao');
  }, []);
  return <ManagerDashboard />;
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return <FiscalDashboard />;
  if (path === '/gerente-contratos') return <ManagerRedirect />;
  if (path === '/gerente-contratos/supervisao') return <ManagerDashboard />;
  if (path === '/gerente-contratos/visao-agregada') return <ManagerAggregateDashboard />;
  return <main className="route-not-found"><h1>Página não encontrada</h1><p>A URL informada não corresponde a um dashboard.</p><a href="/">Ir para o Dashboard Fiscal</a></main>;
}
