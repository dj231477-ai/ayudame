import { authorizeInternal } from '@/lib/internal-auth';
import { createServiceClient } from '@/lib/supabase/service';

// Métricas operativas y de negocio (§C-17.2). Solo service (INTERNAL_ADMIN_SECRET).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!authorizeInternal(request)) {
    return Response.json({ error: { code: 'unauthorized', message: 'invalid secret' } }, { status: 401 });
  }
  const svc = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: platform }, { data: aiToday }, { data: subs }] = await Promise.all([
    svc.rpc('get_platform_metrics'),
    svc.from('ai_daily_usage').select('provider, request_count, token_count').eq('date', today),
    svc.from('subscriptions').select('plan, status'),
  ]);

  const activeByPlan: Record<string, number> = {};
  for (const s of subs ?? []) {
    if (s.status === 'active') activeByPlan[s.plan] = (activeByPlan[s.plan] ?? 0) + 1;
  }

  return Response.json({
    platform: platform ?? {},
    ai_usage_today: aiToday ?? [],
    active_subscriptions_by_plan: activeByPlan,
    generated_at: new Date().toISOString(),
  });
}
