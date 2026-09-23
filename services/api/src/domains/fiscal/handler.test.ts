import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from './handler';

describe('handler fiscal', () => {
  it('retorna a resposta provisória atual', async () => {
    const response = await handler(
      {} as APIGatewayProxyEventV2,
      {} as Context,
      () => undefined,
    );

    expect(response).toEqual({
      statusCode: 501,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Dashboard ainda não implementado.' }),
    });
  });
});
