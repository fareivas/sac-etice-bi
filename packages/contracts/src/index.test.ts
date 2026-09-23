import { describe, expect, it } from 'vitest';
import { apiMessageSchema } from './index';

describe('apiMessageSchema', () => {
  it('aceita uma mensagem textual', () => {
    expect(apiMessageSchema.parse({ message: 'Olá' })).toEqual({ message: 'Olá' });
  });

  it('rejeita uma mensagem que não é texto', () => {
    expect(apiMessageSchema.safeParse({ message: 123 }).success).toBe(false);
  });
});
