// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DashboardTabs } from './dashboard-tabs';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('associates tabs and panels, preserves mounted controls, and navigates with mouse and keyboard', () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DashboardTabs id="test" main={<input aria-label="Principal" defaultValue="A" />}
    complementary={<input aria-label="Complementar" defaultValue="B" />} />));
  try {
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...host.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual(['Visão principal', 'Consultas complementares']);
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(panels.map(panel => panel.hidden)).toEqual([false, true]);
    for (let i = 0; i < 2; i++) {
      expect(tabs[i].getAttribute('aria-controls')).toBe(panels[i].id);
      expect(panels[i].getAttribute('aria-labelledby')).toBe(tabs[i].id);
    }
    const input = panels[1].querySelector('input')!; input.value = 'Preservado';
    act(() => tabs[1].click());
    expect(panels.map(panel => panel.hidden)).toEqual([true, false]);
    expect(input.value).toBe('Preservado');
    act(() => { tabs[1].focus(); tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
    expect(document.activeElement).toBe(tabs[0]);
    expect(panels.map(panel => panel.hidden)).toEqual([false, true]);
    act(() => tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(panels.map(panel => panel.hidden)).toEqual([true, false]);
    act(() => tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    act(() => tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
  } finally { act(() => root.unmount()); host.remove(); }
});
