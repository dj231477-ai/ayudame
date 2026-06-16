// =============================================================================
// pricing.ts — ÚNICA fuente de precios y constantes monetarias  [NORMATIVO]
// INV-3: MARGIN y los costos por acción existen en EXACTAMENTE un lugar. Cero
// hardcodeo monetario fuera de este archivo. SPEC §C-9.2, §C-9.3, §C-9.4.
// =============================================================================

export const MARGIN = 1.0; // 100% (§C-9.4)

// Precio cobrado al usuario (margen incluido), en USD (§C-9.4):
export const ACTION_COSTS = {
  photo_verify: 0.006,
  chat_message: 0.0016,
  daily_briefing: 0.001,
  weekly_analysis: 0.008,
  embedding: 0.0001,
} as const;
export type ActionKey = keyof typeof ACTION_COSTS;

// Coste real derivado (lo que pagamos al proveedor) (§C-9.4):
export const ACTION_COSTS_REAL = Object.fromEntries(
  Object.entries(ACTION_COSTS).map(([k, v]) => [k, +(v / (1 + MARGIN)).toFixed(6)]),
) as Record<ActionKey, number>;

// 1 "crédito" mostrado al usuario = $0.01 de saldo (§C-9.3). La DB guarda USD.
export const CREDIT_DISPLAY_UNIT = 0.01;

// Stipend mensual de créditos gratis por plan (USD) (§C-9.2).
// Vive aquí por INV-3 (constante monetaria, fuente única); el backend lo aplica
// vía grant_signup_stipend / add_credits.
export const STIPENDS = {
  free: 0.3,
  pro: 1.0,
  team: 2.0, // por usuario
} as const;
export type PlanKey = keyof typeof STIPENDS;

// Paquetes de créditos de compra puntual (§C-9.3).
export const CREDIT_PACKAGES = {
  starter: { price_usd: 3, credits_usd: 1.5 },
  growth: { price_usd: 9, credits_usd: 4.5 },
  power: { price_usd: 24, credits_usd: 12.0 },
} as const;
export type CreditPackageKey = keyof typeof CREDIT_PACKAGES;

// Precios de suscripción de plan (§C-9.2). Base en USD; Stripe convierte a moneda local (§C-21.5).
export const PLAN_PRICING = {
  pro: { monthly_usd: 5, yearly_usd: 40 },
  team: { monthly_per_seat_usd: 12, min_seats: 3 },
} as const;

/** Convierte saldo en USD a "créditos" para mostrar en UI (§C-9.3). */
export function usdToCredits(usd: number): number {
  return Math.round(usd / CREDIT_DISPLAY_UNIT);
}
