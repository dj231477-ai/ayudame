import 'server-only';
import type { FlowDayClient } from '@flowday/core/auth';
import { createServiceClient } from '@/lib/supabase/service';

// Gamificación compartida (Team). INV-1: visibilidad mutua dentro de un challenge común.
export interface LeaderboardEntry {
  user_id: string;
  name: string | null;
  streak: number;
}
export interface ChallengeView {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  owner_id: string;
  leaderboard: LeaderboardEntry[];
}

export async function userPlan(supabase: FlowDayClient, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('plan').eq('id', userId).single();
  return data?.plan ?? 'free';
}

export async function listChallengesWithLeaderboard(
  supabase: FlowDayClient,
): Promise<ChallengeView[]> {
  // RLS: el usuario solo ve challenges donde es owner o miembro (§C-8 mig.103).
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id, name, start_date, end_date, owner_id');
  const list = challenges ?? [];
  if (list.length === 0) return [];

  // Streaks de miembros: lectura con service_role, justificada por pertenencia común (INV-1).
  const svc = createServiceClient();
  const out: ChallengeView[] = [];
  for (const c of list) {
    const { data: members } = await svc
      .from('challenge_members')
      .select('user_id')
      .eq('challenge_id', c.id);
    const ids = (members ?? []).map((m) => m.user_id);
    let leaderboard: LeaderboardEntry[] = [];
    if (ids.length > 0) {
      const { data: profs } = await svc.from('profiles').select('id, full_name, streak').in('id', ids);
      leaderboard = (profs ?? [])
        .map((p) => ({ user_id: p.id, name: p.full_name, streak: p.streak }))
        .sort((a, b) => b.streak - a.streak);
    }
    out.push({ ...c, leaderboard });
  }
  return out;
}
