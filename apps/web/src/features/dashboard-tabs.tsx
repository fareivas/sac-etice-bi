import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type Tab = 'main' | 'complementary';
const tabs: readonly Tab[] = ['main', 'complementary'];
const labels = { main: 'Visão principal', complementary: 'Consultas complementares' };

export function DashboardTabs({ id, main, complementary }: {
  id: string;
  main: ReactNode;
  complementary: ReactNode;
}) {
  const [active, setActive] = useState<Tab>('main');
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ main: null, complementary: null });
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: Tab) => {
    const index = tabs.indexOf(current);
    const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
      : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length]
      : event.key === 'Home' ? tabs[0]
      : event.key === 'End' ? tabs[tabs.length - 1] : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div className="dashboard-tabs" role="tablist" aria-label="Seções do dashboard">
        {tabs.map((tab) => (
          <button
            key={tab}
            ref={(element) => { refs.current[tab] = element; }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab}`}
            aria-controls={`${id}-panel-${tab}`}
            aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
            onKeyDown={(event) => onKeyDown(event, tab)}
          >
            {labels[tab]}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab}
          role="tabpanel"
          id={`${id}-panel-${tab}`}
          aria-labelledby={`${id}-tab-${tab}`}
          hidden={active !== tab}
          className="dashboard-tab-panel"
        >
          {tab === 'main' ? main : complementary}
        </div>
      ))}
    </>
  );
}
