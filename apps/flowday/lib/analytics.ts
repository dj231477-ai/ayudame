import 'server-only';
import type { FlowDayClient } from '@flowday/core/auth';
import { timeToMinutes } from '@/lib/datetime';

// Analytics personal (§C-1.2 #11). Calculado de datos existentes; sin medición que no tengamos
// (el "tiempo real" por transición se deja para cuando se registren timestamps por estado).

export interface Analytics {
  rangeDays: number;
  blocksTotal: number;
  verified: number;
  skipped: number;
  verificationRate: number;
  plannedVerifiedMinutes: number;
  creditsSpentUsd: number;
  byType: Record<string, number>;
  byHour: number[];
}

export async function computeAnalytics(supabase: FlowDayClient, userId: string): Promise<Analytics> {
  const rangeDays = 30;
  const sinceIso = new Date(Date.now() - rangeDays * 86_400_000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const [blocksRes, evidenceRes, usageRes] = await Promise.all([
    supabase.from('blocks').select('status, type, start_time, end_time').eq('user_id', userId).gte('date', sinceDate),
    supabase.from('evidence').select('verified, created_at').eq('user_id', userId).gte('created_at', sinceIso),
    supabase.from('usage_log').select('cost_charged, refunded, created_at').eq('user_id', userId).gte('created_at', sinceIso),
  ]);

  const blocks = blocksRes.data ?? [];
  const evidence = evidenceRes.data ?? [];
  const usage = usageRes.data ?? [];

  const verified = blocks.filter((b) => b.status === 'verified').length;
  const skipped = blocks.filter((b) => b.status === 'skipped').length;
  const decided = verified + skipped;

  const plannedVerifiedMinutes = blocks
    .filter((b) => b.status === 'verified')
    .reduce((acc, b) => acc + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);

  const byType: Record<string, number> = {};
  for (const b of blocks) byType[b.type] = (byType[b.type] ?? 0) + 1;

  const byHour = new Array<number>(24).fill(0);
  for (const e of evidence) {
    if (e.verified) {
      const h = new Date(e.created_at).getUTCHours();
      byHour[h] = (byHour[h] ?? 0) + 1;
    }
  }

  const creditsSpentUsd = usage
    .filter((u) => !u.refunded)
    .reduce((acc, u) => acc + Number(u.cost_charged), 0);

  return {
    rangeDays,
    blocksTotal: blocks.length,
    verified,
    skipped,
    verificationRate: decided > 0 ? verified / decided : 0,
    plannedVerifiedMinutes,
    creditsSpentUsd,
    byType,
    byHour,
  };
}
