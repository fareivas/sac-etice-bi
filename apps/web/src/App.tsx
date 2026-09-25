import { FiscalDashboard } from './features/fiscal';
import { ManagerDashboard } from './features/gerente-contratos';

export function App() { return window.location.pathname.startsWith('/gerente-contratos') ? <ManagerDashboard /> : <FiscalDashboard />; }
