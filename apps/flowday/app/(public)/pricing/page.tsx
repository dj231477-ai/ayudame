import { isFlagEnabled } from '@flowday/core/flags';
import { CREDIT_PACKAGES, PLAN_PRICING } from '@flowday/core/credits/pricing';
import { PricingClient } from '@/components/PricingClient';

// SPEC §C-13.6, §C-9.7: pricing visible según flags (tiers se activan por umbrales).
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [proActive, teamActive] = await Promise.all([
    isFlagEnabled('pro_tier_active'),
    isFlagEnabled('team_tier_active'),
  ]);
  const packages = (Object.keys(CREDIT_PACKAGES) as Array<keyof typeof CREDIT_PACKAGES>).map((id) => ({
    id,
    price_usd: CREDIT_PACKAGES[id].price_usd,
    credits_usd: CREDIT_PACKAGES[id].credits_usd,
  }));

  return (
    <PricingClient
      packages={packages}
      plans={PLAN_PRICING}
      proActive={proActive}
      teamActive={teamActive}
    />
  );
}
