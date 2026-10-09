import { useState } from 'react';

export type ItemPageSize = 10 | 25 | 50;
const initial = (context: string | null, selection: string) => ({ context, selection, size: 25 as ItemPageSize, page: 1 });

export function itemPageWindow<T>(items: readonly T[], size: ItemPageSize, requestedPage: number) {
  const total = items.length;
  const pageCount = Math.ceil(total / size);
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, pageCount));
  const offset = (page - 1) * size;
  return { total, pageCount, page, from: total ? offset + 1 : 0, to: Math.min(offset + size, total), pageItems: items.slice(offset, offset + size) };
}

/** Keeps paging independent from the complete filtered/sorted list used by aggregates and CSV. */
export function useItemPagination<T>(items: readonly T[], available: boolean, context: string | null, selection: string) {
  const [stored, setStored] = useState(() => initial(null, selection));
  let state = stored;
  if (context !== null && state.context !== context) {
    state = initial(context, selection);
    setStored(state);
  } else if (context !== null && state.selection !== selection) {
    state = { ...state, selection, page: 1 };
    setStored(state);
  }
  const window = itemPageWindow(items, state.size, state.page);
  if (available && state.page !== window.page) {
    state = { ...state, page: window.page };
    setStored(state);
  }
  return { ...window, size: state.size,
    setSize: (size: ItemPageSize) => setStored(current => ({ ...current, size, page: 1 })),
    previous: () => setStored(current => ({ ...current, page: Math.max(1, current.page - 1) })),
    next: () => setStored(current => ({ ...current, page: Math.min(Math.max(1, window.pageCount), current.page + 1) })),
  };
}
