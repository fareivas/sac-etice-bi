import { describe, expect, it } from 'vitest';
import { API_ERROR_STATUS, ApiError, createApiError, createInternalError } from './index';

describe('API errors', () => {
  it('mapeia os códigos DEC-008 aos status documentados', () => {
    expect(API_ERROR_STATUS).toEqual({
      INVALID_FILTER: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN_SCOPE: 403,
      RESOURCE_NOT_FOUND: 404,
      DATA_VERSION_CONFLICT: 409,
      EXTERNAL_SOURCE_UNAVAILABLE: 424,
      INTERNAL_ERROR: 500,
    });
    for (const [code, status] of Object.entries(API_ERROR_STATUS)) {
      expect(new ApiError(code as keyof typeof API_ERROR_STATUS).statusCode).toBe(status);
    }
  });

  it('mantém details tipados em erros esperados', () => {
    const error = createApiError('INVALID_FILTER', [{ field: 'unidadeId', reason: 'Deve ser positivo.' }]);
    expect(error.details).toEqual([{ field: 'unidadeId', reason: 'Deve ser positivo.' }]);
    expect(error.message).toBe('Filtros inválidos.');
  });

  it('guarda a causa interna de INTERNAL_ERROR sem detalhes públicos', () => {
    const cause = 'SQL, stack e credenciais internas';
    const error = createInternalError(cause);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Erro interno.');
    expect(error.details).toEqual([]);
    expect(error.internalCause).toBe(cause);
    expect(JSON.stringify(error)).not.toContain('SQL, stack e credenciais');
  });
});
