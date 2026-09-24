import { describe, expect, it } from 'vitest';
import { countLabel, queueLabel } from './summary';

describe('Fiscal summary presentation', () => {
  it('keeps real zero separate from unavailable counts', () => {
    expect(countLabel(0)).toBe('0');
    expect(countLabel(null)).toBe('Indisponível');
  });

  it('keeps empty evaluated queue separate from unavailable queue', () => {
    expect(queueLabel([])).toContain('Nenhuma ocorrência');
    expect(queueLabel(null)).toBe('Fila indisponível');
  });
});
