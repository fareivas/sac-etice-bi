import { expect, it } from 'vitest';
import { itemPageWindow } from './use-item-pagination';
it.each([0, 1, 10, 11, 25, 26, 50, 51])('handles first/last page boundaries for %i filtered items', total => {
  const items = Array.from({ length: total }, (_, i) => i + 1);
  for (const size of [10, 25, 50] as const) {
    const first = itemPageWindow(items, size, 1);
    expect(first.from).toBe(total ? 1 : 0);
    expect(first.to).toBe(Math.min(total, size));
    expect(first.pageItems).toEqual(items.slice(0, size));
    const last = itemPageWindow(items, size, 999);
    expect(last.page).toBe(Math.max(1, Math.ceil(total / size)));
    expect(last.to).toBe(total);
    expect(last.pageItems.length).toBe(total === 0 ? 0 : total % size || size);
    expect([...items]).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  }
});
it('slices the supplied sorted order without modifying the original list or losing records', () => {
  const items = Array.from({ length: 51 }, (_, i) => 51 - i);
  const pages = [1, 2, 3].flatMap(page => itemPageWindow(items, 25, page).pageItems);
  expect(pages).toEqual(items);
  expect(itemPageWindow(items, 25, 0).page).toBe(1);
});
