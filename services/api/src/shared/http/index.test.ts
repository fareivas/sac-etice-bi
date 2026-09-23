import { describe, expect, it } from 'vitest';
import { apiErrorResponseSchema } from '@sac-etice-bi/contracts';
import { createApiError, createInternalError } from '../errors/index';
import { errorResponse, jsonResponse } from './index';

describe('HTTP response helpers', () => {
  it('serializa uma resposta JSON com content-type e status', () => {
    const response = jsonResponse({ ok: true }, 201);
    expect(response.statusCode).toBe(201);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(response.body).toBe('{"ok":true}');
  });

  it('serializa envelope de erro válido com status correspondente e relógio injetado', () => {
    const response = errorResponse(createApiError('INVALID_FILTER', [{ field: 'timezone' }]), {
      correlationId: 'corr-123',
      now: () => new Date('2026-09-23T12:00:00.000Z'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const body = JSON.parse(response.body ?? 'null');
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      meta: { generatedAt: '2026-09-23T12:00:00.000Z', correlationId: 'corr-123' },
      error: {
        code: 'INVALID_FILTER',
        message: 'Filtros inválidos.',
        details: [{ field: 'timezone' }],
      },
    });
  });

  it('usa generatedAt informado e não expõe causa interna', () => {
    const response = errorResponse(createInternalError(new Error('SQL secret')), {
      correlationId: 'corr-456',
      generatedAt: '2026-09-23T09:00:00-03:00',
      now: () => { throw new Error('não deve consultar relógio quando generatedAt é informado'); },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('SQL secret');
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      meta: { generatedAt: '2026-09-23T09:00:00-03:00', correlationId: 'corr-456' },
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno.', details: [] },
    });
  });

  it('respeita o status HTTP de cada código DEC-008', () => {
    const statuses = [
      ['INVALID_FILTER', 400], ['UNAUTHENTICATED', 401], ['FORBIDDEN_SCOPE', 403],
      ['RESOURCE_NOT_FOUND', 404], ['DATA_VERSION_CONFLICT', 409],
      ['EXTERNAL_SOURCE_UNAVAILABLE', 424], ['INTERNAL_ERROR', 500],
    ] as const;
    for (const [code, status] of statuses) {
      const error = code === 'INTERNAL_ERROR' ? createInternalError() : createApiError(code);
      expect(errorResponse(error, { correlationId: 'id', generatedAt: '2026-09-23T12:00:00Z' }).statusCode)
        .toBe(status);
    }
  });
});
