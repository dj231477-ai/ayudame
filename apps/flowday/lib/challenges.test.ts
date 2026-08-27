import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../tests/helpers/supabase-mock';

// SPEC §C-1.2 #10, §C-8 (mig.103): gamificación Team con leaderboard por streak.

let mockClient: MockClient;
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));

import { userPlan, listChallengesWithLeaderboard } from './challenges';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('userPlan', () => {
  it('devuelve el plan del perfil', async () => {
    const sb = createMockClient({ tableResults: { profiles: { data: { plan: 'team' } } } });
    expect(await userPlan(sb as never, 'u1')).toBe('team');
  });

  it('cae a free si no hay perfil', async () => {
    const sb = createMockClient({ tableResults: { profiles: { data: null } } });
    expect(await userPlan(sb as never, 'u1')).toBe('free');
  });
});

describe('listChallengesWithLeaderboard (§C-1.2 #10)', () => {
  it('sin challenges devuelve lista vacía', async () => {
    const sb = createMockClient({ tableResults: { challenges: { data: [] } } });
    expect(await listChallengesWithLeaderboard(sb as never)).toEqual([]);
  });

  it('construye leaderboard ordenado por streak descendente', async () => {
    const sb = createMockClient({
      tableResults: {
        challenges: { data: [{ id: 'c1', name: 'Reto', start_date: '2026-06-01', end_date: '2026-06-30', owner_id: 'u1' }] },
      },
    });
    // El cliente service_role (interno) lee members y profiles.
    mockClient = createMockClient({
      tableResults: {
        challenge_members: { data: [{ user_id: 'u1' }, { user_id: 'u2' }] },
        profiles: { data: [
          { id: 'u1', full_name: 'Ana', streak: 3 },
          { id: 'u2', full_name: 'Beto', streak: 7 },
        ] },
      },
    });
    const out = await listChallengesWithLeaderboard(sb as never);
    expect(out).toHaveLength(1);
    expect(out[0]!.leaderboard.map((e) => e.name)).toEqual(['Beto', 'Ana']);
    expect(out[0]!.leaderboard[0]!.streak).toBe(7);
  });
});
