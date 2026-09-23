import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { apiErrorResponseSchema, type ApiErrorResponse } from '@sac-etice-bi/contracts';
import { ApiError } from '../errors/index';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export function jsonResponse<T>(
  body: T,
  statusCode = 200,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(body),
  };
}

export interface ErrorResponseOptions {
  correlationId: string;
  generatedAt?: string;
  now?: () => Date;
}

export function errorResponse(
  error: ApiError,
  options: ErrorResponseOptions,
): APIGatewayProxyStructuredResultV2 {
  const body: ApiErrorResponse = apiErrorResponseSchema.parse({
    meta: {
      generatedAt: options.generatedAt ?? (options.now ?? (() => new Date()))().toISOString(),
      correlationId: options.correlationId,
    },
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  });

  return jsonResponse(body, error.statusCode);
}
