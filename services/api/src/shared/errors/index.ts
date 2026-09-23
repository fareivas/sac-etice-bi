import type { ApiErrorCode, ApiErrorDetails } from '@sac-etice-bi/contracts';

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  INVALID_FILTER: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_SCOPE: 403,
  RESOURCE_NOT_FOUND: 404,
  DATA_VERSION_CONFLICT: 409,
  EXTERNAL_SOURCE_UNAVAILABLE: 424,
  INTERNAL_ERROR: 500,
};

const SAFE_MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_FILTER: 'Filtros inválidos.',
  UNAUTHENTICATED: 'Autenticação necessária.',
  FORBIDDEN_SCOPE: 'Acesso fora do escopo permitido.',
  RESOURCE_NOT_FOUND: 'Recurso não encontrado.',
  DATA_VERSION_CONFLICT: 'Conflito de versão dos dados.',
  EXTERNAL_SOURCE_UNAVAILABLE: 'Fonte externa indisponível.',
  INTERNAL_ERROR: 'Erro interno.',
};

/** Erro esperado da API; cause é interno e nunca faz parte da resposta pública. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly details: ApiErrorDetails;
  readonly internalCause?: unknown;

  constructor(
    readonly code: ApiErrorCode,
    options: { details?: ApiErrorDetails; internalCause?: unknown } = {},
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = 'ApiError';
    this.statusCode = API_ERROR_STATUS[code];
    this.details = code === 'INTERNAL_ERROR' ? [] : (options.details ?? []);
    this.internalCause = options.internalCause;
    Object.defineProperty(this, 'internalCause', { enumerable: false });
  }
}

export function createApiError(
  code: ApiErrorCode,
  details?: ApiErrorDetails,
): ApiError {
  return new ApiError(code, { details });
}

/** Mantém a causa para tratamento interno sem incluí-la no payload público. */
export function createInternalError(internalCause?: unknown): ApiError {
  return new ApiError('INTERNAL_ERROR', { internalCause });
}
