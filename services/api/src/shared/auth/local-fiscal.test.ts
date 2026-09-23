import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { LocalFiscalAuthProvider } from './local-fiscal';

const event = { rawQueryString: 'userId=999', headers: { authorization: 'Bearer arbitrary' } } as unknown as APIGatewayProxyEventV2;

describe('local Fiscal auth harness', () => {
  it('uses only the explicit server identity and access flag', async () => {
    const provider = new LocalFiscalAuthProvider({
      NODE_ENV: 'development', LOCAL_FISCAL_USER_ID: '77', LOCAL_FISCAL_CAN_ACCESS_VIEW: 'true',
    });
    await expect(provider.authenticate(event)).resolves.toEqual({
      status: 'AUTHENTICATED', principal: { userId: 77 }, canAccessFiscalView: true,
    });
  });

  it('keeps access separate from identity', async () => {
    const provider = new LocalFiscalAuthProvider({
      NODE_ENV: 'test', LOCAL_FISCAL_USER_ID: '77', LOCAL_FISCAL_CAN_ACCESS_VIEW: 'false',
    });
    await expect(provider.authenticate(event)).resolves.toMatchObject({
      status: 'AUTHENTICATED', canAccessFiscalView: false,
    });
  });

  it.each([
    {},
    { NODE_ENV: 'development' },
    { NODE_ENV: 'development', LOCAL_FISCAL_USER_ID: '0', LOCAL_FISCAL_CAN_ACCESS_VIEW: 'true' },
    { NODE_ENV: 'test', LOCAL_FISCAL_USER_ID: '1', LOCAL_FISCAL_CAN_ACCESS_VIEW: 'TRUE' },
    { NODE_ENV: 'production', LOCAL_FISCAL_USER_ID: '77', LOCAL_FISCAL_CAN_ACCESS_VIEW: 'true' },
  ])('fails closed for absent, invalid, or production configuration', async (environment) => {
    await expect(new LocalFiscalAuthProvider(environment).authenticate(event))
      .resolves.toEqual({ status: 'UNAUTHENTICATED' });
  });
});
