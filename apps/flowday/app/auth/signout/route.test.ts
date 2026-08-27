import { describe, it, expect, beforeEach, vi } from 'vitest';

// SPEC §C-13.8: cierre de sesión revoca la sesión y redirige (303).

const signOut = vi.fn(() => Promise.resolve({ error: null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { signOut } }),
}));

import { POST } from './route';

beforeEach(() => signOut.mockClear());

describe('POST /auth/signout (§C-13.8)', () => {
  it('revoca la sesión y redirige a / con 303', async () => {
    const res = await POST(new Request('https://app.test/auth/signout', { method: 'POST' }) as never);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://app.test/');
  });
});
