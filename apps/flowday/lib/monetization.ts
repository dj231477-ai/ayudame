import 'server-only';
import { getFlag, setFlag } from '@flowday/core/flags';
import { getMailer } from '@flowday/core/email';
import { createServiceClient } from '@/lib/supabase/service';

// Triggers de monetización [NORMATIVO en efectos — SPEC §C-9.7].
// Umbrales por defecto (ILUSTRATIVO); ajustables sin tocar código.

interface PlatformMetrics {
  total_users: number;
  monthly_active_users: number;
  monthly_photo_verifications: number;
  monthly_cost_usd: number;
}

async function flagTrue(key: string): Promise<boolean> {
  return (await getFlag(key)) === true;
}

export async function runMonetizationTriggers(): Promise<{ applied: string[] }> {
  const svc = createServiceClient();
  const { data } = await svc.rpc('get_platform_metrics');
  const m = (data ?? {}) as Partial<PlatformMetrics>;
  const applied: string[] = [];

  if ((m.total_users ?? 0) >= 100 && !(await flagTrue('pro_tier_active'))) {
    await setFlag('pro_tier_active', true);
    applied.push('pro_tier_active');
  }
  if ((m.monthly_active_users ?? 0) >= 500 && !(await flagTrue('team_tier_active'))) {
    await setFlag('team_tier_active', true);
    applied.push('team_tier_active');
  }
  if ((m.monthly_cost_usd ?? 0) > 20) {
    await sendUpgradeEmail('active_free_users');
    applied.push('upgrade_email');
  }
  return { applied };
}

/**
 * §C-9.7: encola email transaccional + registra evento. Baseline: registra el evento y
 * notifica a ops vía Mailer (Resend). La segmentación por usuario se afina en crecimiento.
 */
async function sendUpgradeEmail(segment: string): Promise<void> {
  const svc = createServiceClient();
  await svc.from('monetization_events').insert({
    event_type: 'upgrade_email_sent',
    payload: { segment },
  });
  const to = process.env.OPS_EMAIL ?? 'ops@flowday.app';
  await getMailer().send(
    to,
    'FlowDay: campaña de upgrade',
    `<p>Segmento <strong>${segment}</strong>: el coste mensual de IA superó el umbral. Lanza la campaña de upgrade.</p>`,
  );
}
