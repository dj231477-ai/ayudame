import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from '../../tests/helpers/supabase-mock';
import { STIPENDS } from '@flowday/core/credits/pricing';

// SPEC §C-13.1 paso 4, INV-3, INV-6: acreditación idempotente del stipend de alta.

let mockClient: ReturnType<typeof createMockClient>;
vi.mock('@flowday/core/auth', () => ({ createServiceClient: () => mockClient }));

import { runSignupOnboarding } from './onboarding';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('runSignupOnboarding (§C-13.1)', () => {
  it('acredita el stipend Free vía RPC grant_signup_stipend con el monto de pricing (INV-3)', async () => {
    await runSignupOnboarding('u1');
    const rpc = mockClient.log.find((l) => l.op === 'rpc' && l.name === 'grant_signup_stipend');
    expect(rpc?.args).toEqual({ p_user_id: 'u1', p_amount: STIPENDS.free });
  });

  it('no propaga si el RPC falla (el callback de auth no debe romperse)', async () => {
    mockClient = createMockClient({ rpcResults: { grant_signup_stipend: { error: { code: 'x' } } } });
    await expect(runSignupOnboarding('u1')).resolves.toBeUndefined();
  });
});
