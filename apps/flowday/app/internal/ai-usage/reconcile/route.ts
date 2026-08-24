import { logger, newRequestId } from '@flowday/core/observability/logger';
import { authorizeInternal } from '@/lib/internal-auth';
import { createServiceClient } from '@/lib/supabase/service';

// =============================================================================
// Reconciliación de uso de IA  [SPEC §C-12.2]
// El incremento PRIMARIO de ai_daily_usage lo hace la app dentro de callAI (§C-10.4);
// este job (disparado por ai-usage-tracker.json, horario) sólo NORMALIZA los contadores
// del día por proveedor contra la fuente autoritativa (usage_log no reembolsado) y corrige
// derivas/valores inválidos. No es la fuente primaria (corrige la ambigüedad del original).
// Interno: protegido con INTERNAL_ADMIN_SECRET vía x-internal-secret (§C-11.7, INV-4).
// La fecha se evalúa en UTC para alinear con ai_daily_usage.date (= current_date, UTC).
// =============================================================================
export const dynamic = 'force-dynamic';

interface Correction {
  provider: string;
  request_count_from: number;
  request_count_to: number;
  token_count_clamped?: boolean;
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  if (!authorizeInternal(request)) {
    return Response.json({ error: { code: 'unauthorized', message: 'invalid secret' } }, { status: 401 });
  }

  const svc = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00.000Z`;

  try {
    // Fuente autoritativa: nº de consumos NO reembolsados del día por proveedor (§C-9.6).
    const { data: logs, error: logErr } = await svc
      .from('usage_log')
      .select('provider, refunded')
      .gte('created_at', dayStart);
    if (logErr) throw logErr;

    const authoritative = new Map<string, number>();
    for (const r of logs ?? []) {
      if (r.refunded) continue;
      authoritative.set(r.provider, (authoritative.get(r.provider) ?? 0) + 1);
    }

    // Estado actual del contador denormalizado.
    const { data: usageRows, error: usageErr } = await svc
      .from('ai_daily_usage')
      .select('provider, request_count, token_count')
      .eq('date', today);
    if (usageErr) throw usageErr;

    const current = new Map<string, { request_count: number; token_count: number }>();
    for (const u of usageRows ?? []) {
      current.set(u.provider, { request_count: u.request_count, token_count: u.token_count });
    }

    const providers = new Set<string>([...authoritative.keys(), ...current.keys()]);
    const corrections: Correction[] = [];
    const upserts: Array<{ provider: string; date: string; request_count: number; token_count: number }> = [];

    for (const provider of providers) {
      const want = authoritative.get(provider) ?? 0;
      const have = current.get(provider);
      const haveReq = have?.request_count ?? 0;
      let tokenCount = have?.token_count ?? 0;
      let tokenClamped = false;
      if (tokenCount < 0) {
        tokenCount = 0; // normaliza valores inválidos (integridad de contadores, E4)
        tokenClamped = true;
      }
      if (!have || haveReq !== want || tokenClamped) {
        upserts.push({ provider, date: today, request_count: want, token_count: tokenCount });
        corrections.push({
          provider,
          request_count_from: haveReq,
          request_count_to: want,
          ...(tokenClamped ? { token_count_clamped: true } : {}),
        });
      }
    }

    if (upserts.length > 0) {
      const { error: upErr } = await svc
        .from('ai_daily_usage')
        .upsert(upserts, { onConflict: 'provider,date' });
      if (upErr) throw upErr;
    }

    logger.info({
      event: 'ai_usage.reconciled',
      request_id: requestId,
      route: '/internal/ai-usage/reconcile',
    });
    return Response.json({
      ok: true,
      date: today,
      providers: providers.size,
      corrected: corrections.length,
      corrections,
    });
  } catch {
    logger.error({
      event: 'ai_usage.reconcile_failed',
      request_id: requestId,
      route: '/internal/ai-usage/reconcile',
      error: { code: 'internal' },
    });
    return Response.json({ error: { code: 'internal', message: 'reconcile failed' } }, { status: 500 });
  }
}
