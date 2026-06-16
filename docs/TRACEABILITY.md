# Matriz de trazabilidad — Requisito → Código

> Mapea el SPEC (`FlowDay-SPEC.md`) a su implementación. Cada archivo relevante también
> incluye comentarios `[SPEC §X]`. Se actualiza por fase (§C-22).

## Invariantes del sistema (§C-2)

| Invariante | Implementación |
|---|---|
| INV-1 Aislamiento por usuario | RLS en cada tabla (`packages/db/migrations/*`), tests `apps/flowday/tests/rls.integration.test.ts` |
| INV-2 Pre-cobro antes de IA | `packages/core/src/credits/check.ts` (`checkAndDeductCredits`) |
| INV-3 Fuente única de precios | `packages/core/src/credits/pricing.ts` |
| INV-4 Secretos jamás en cliente | `packages/core/src/auth/index.ts` (guard), `scripts/check-no-secrets.mjs`, `apps/flowday/lib/supabase/service.ts` (`server-only`) |
| INV-5 Eventos verificados | Fase 2/3 (webhooks); helper `packages/core/src/events/idempotency.ts` |
| INV-6 Idempotencia de efectos | `packages/core/src/events/idempotency.ts`, `processed_events` (mig. 009), `grant_signup_stipend` (mig. 010) |
| INV-7 Visión nunca en CPU local | Fase 1 (`packages/core/src/ai/router.ts`) |
| INV-8 Datos de producto vs orquestación | `apps/flowday/docker/oracle/` (Fase 2), n8n con su Postgres propio |
| INV-9 Migraciones ordenadas e inmutables | `packages/db/README.md`, numeración `000+`/`100+` |
| INV-10 Mobile-first | `apps/flowday/tailwind.config.ts` (`xs:375px`), `brand.ts` breakpoints |
| INV-11 Historial append-only | `apps/flowday/db/migrations/101_evidence.sql` (sin UPDATE/DELETE) |
| INV-12 Zona horaria del usuario | `profiles.timezone` (mig. 000); reconciliación cron en Fase 2 |

## Modelo de datos (§C-7) → migraciones

| Requisito | Archivo |
|---|---|
| profiles (§C-7.1) | `packages/db/migrations/000_profiles.sql` |
| credits (§C-7.1) | `packages/db/migrations/001_credits.sql` |
| usage_log (§C-7.1) | `packages/db/migrations/002_usage_log.sql` |
| credit_purchases (§C-7.1) | `packages/db/migrations/003_credit_purchases.sql` |
| push_subscriptions (§C-7.1) | `packages/db/migrations/004_push_subscriptions.sql` |
| ai_daily_usage (§C-7.1) | `packages/db/migrations/005_ai_daily_usage.sql` |
| monetization_events (§C-7.1) | `packages/db/migrations/006_monetization_events.sql` |
| feature_flags (§C-7.1, F7) | `packages/db/migrations/007_feature_flags.sql` |
| subscriptions (§C-7.1, F8) | `packages/db/migrations/008_subscriptions.sql` |
| processed_events (§C-7.1, F10) | `packages/db/migrations/009_processed_events.sql` |
| RPCs deduct/refund/add/increment/metrics (§C-7.4, F1-F3) | `packages/db/migrations/010_rpc_functions.sql` |
| blocks (§C-7.2) | `apps/flowday/db/migrations/100_blocks.sql` |
| evidence (§C-7.2) | `apps/flowday/db/migrations/101_evidence.sql` |
| habits (§C-7.2) | `apps/flowday/db/migrations/102_habits.sql` |
| challenges (§C-7.2) | `apps/flowday/db/migrations/103_challenges.sql` |
| Storage bucket (§C-7.3, F9) | `packages/db/storage/buckets.sql` |

## Seguridad (§C-8)

| Requisito | Archivo |
|---|---|
| Modelo de claves / clientes (§C-8.1, §C-8.6) | `packages/core/src/auth/index.ts` |
| Patrón RLS por tabla (§C-8.2) | cada migración de tabla de usuario |
| Tablas internas sin políticas (§C-8.3) | mig. 005/006/007/009 |
| Vista public_profiles (§C-8.4, S6) | `packages/db/views/public_profiles.sql` |
| Storage de evidencia (§C-8.5) | `packages/db/storage/buckets.sql` |
| Headers de seguridad (§C-8.7) | `apps/flowday/next.config.mjs` |

## Créditos y monetización (§C-9)

| Requisito | Archivo |
|---|---|
| Precios fuente única (§C-9.4) | `packages/core/src/credits/pricing.ts` |
| Stipends por plan (§C-9.2) | `pricing.ts` (`STIPENDS`) + `grant_signup_stipend` |
| Paquetes de créditos (§C-9.3) | `pricing.ts` (`CREDIT_PACKAGES`) |
| Pre-cobro (§C-9.5) | `packages/core/src/credits/check.ts` |
| Reembolso por fallo (§C-9.6) | `check.ts` (`refundCredits`), `refund_credits` RPC |

## Errores / i18n (§C-14.2) y observabilidad (§C-17)

| Requisito | Archivo |
|---|---|
| Catálogo de errores + i18n (§C-14.2) | `packages/core/src/errors/index.ts` |
| Logger estructurado (§C-17.1) | `packages/core/src/observability/logger.ts` |
| Health / readiness (§C-17.3) | `apps/flowday/app/api/v1/health/route.ts`, `.../ready/route.ts` |

## Flujos (§C-13) y retención (§C-15)

| Requisito | Archivo |
|---|---|
| Onboarding + stipend (§C-13.1) | `apps/flowday/app/auth/callback/route.ts`, `apps/flowday/lib/auth/onboarding.ts`, trigger `handle_new_user` |
| Retención por plan (§C-15.2) | `packages/core/src/retention/policy.ts` |

## Testing / CI (§C-18)

| Requisito | Archivo |
|---|---|
| Tests pricing/errores (§C-18.2) | `packages/core/src/**/**.test.ts` |
| Tests RLS aislamiento (§C-18.2) | `apps/flowday/tests/rls.integration.test.ts` |
| Gate anti-secretos (§C-18.5, INV-4) | `scripts/check-no-secrets.mjs`, `.github/workflows/ci.yml` |

## Fase 1 — Núcleo de producto (§C-10, §C-11, §C-13)

| Requisito | Archivo |
|---|---|
| Router IA: getAIProvider/callAI (§C-10.3/4) | `packages/core/src/ai/router.ts` |
| Tipos IA (§C-10.2) | `packages/core/src/ai/types.ts` |
| Anti-inyección buildPrompt (§C-10.5, S3) | `packages/core/src/ai/prompt.ts` + test |
| Reintentos backoff (§C-10.4) | `packages/core/src/ai/retry.ts` |
| getDailyUsage/incrementUsage (§C-10.3, F2, E4) | `packages/core/src/ai/usage.ts` |
| Providers (gemini/groq/cerebras/ollama/claude) (§C-10.6) | `packages/core/src/ai/providers/*` |
| Rate limiting Upstash (§C-11.1, S5, D-1) | `packages/core/src/ratelimit/index.ts` |
| Web Push VAPID (§C-5.2, AR-6) | `packages/core/src/notifications/push.ts` |
| API bloques CRUD (§C-11.2) | `apps/flowday/app/api/v1/blocks/route.ts`, `.../blocks/[id]/route.ts` |
| Máquina de estados (§C-13.2) | `apps/flowday/lib/blocks/state-machine.ts` + test |
| verify-photo (§C-11.3) | `apps/flowday/app/api/v1/verify-photo/route.ts`, `apps/flowday/lib/verify-photo.ts` |
| VERIFY_PROMPT + parseo (§C-13.4) | `apps/flowday/lib/verify-prompt.ts` + test |
| Cola re-verify (§C-14.3, D-2) | `apps/flowday/db/migrations/104_verification_queue.sql` |
| Streak ≤1/día (§C-13.3) | `apps/flowday/lib/verify-photo.ts` (updateStreak) |
| Créditos API (§C-11.4) | `apps/flowday/app/api/v1/credits/route.ts`, `.../credits/usage/route.ts` |
| Estados UI carga/error/vacío (§C-14.1) | `packages/ui/src/{Skeleton,ErrorCard,EmptyState}` |
| Componentes UI (§C-5.2) | `packages/ui/src/{Button,Card,Timer,PhotoCapture,CreditBalance}` |
| Timer Web Worker (§C-22 F1) | `apps/flowday/public/timer-worker.js`, `apps/flowday/hooks/useBlockTimer.ts` |
| PWA SW + push (§C-1, AR-6) | `apps/flowday/public/sw.js`, `components/PWARegister.tsx`, `hooks/usePush.ts` |
| Ciclo de bloque (UI) (§C-13.3) | `apps/flowday/components/blocks/DayBoard.tsx` |

## Fase 2 — Automatización (§C-12, §C-16)

| Requisito | Archivo |
|---|---|
| Webhook n8n + HMAC + idempotencia (§C-12.3, INV-5/6) | `apps/flowday/app/api/v1/webhooks/n8n/route.ts` |
| Verificación HMAC (INV-5) | `packages/core/src/security/hmac.ts` + test |
| Scheduler tz-aware (§C-12.2/§C-12.5, INV-12) | `apps/flowday/app/internal/scheduler/run/route.ts` |
| Entrega de push (§C-13) | `apps/flowday/lib/push/send.ts`, `packages/core/src/notifications/push.ts` |
| Google tokens cifrados (Fase 2 D) | `apps/flowday/lib/google/tokens.ts`, `packages/core/src/crypto/index.ts` + test, mig. 105 |
| Google Tasks client + rutas (§C-11.5) | `apps/flowday/lib/google/tasks.ts`, `app/api/v1/tasks/*`, `app/api/v1/google/*` |
| docker-compose Oracle (§C-16.3, E2, INV-8) | `apps/flowday/docker/oracle/docker-compose.yml`, `nginx.conf` |
| Workflows n8n (§C-12.2) | `apps/flowday/n8n/workflows/*.json` |

## Fase 3 — Monetización (§C-9, §C-11.4, §C-12.4, §C-21)

| Requisito | Archivo |
|---|---|
| Cliente Stripe + verificación webhook (§C-12.4, INV-5) | `packages/core/src/billing/stripe.ts` |
| Checkout/portal (§C-11.4, §C-9.8) | `apps/flowday/lib/billing.ts`, `app/api/v1/billing/{checkout,portal}/route.ts` |
| Webhook Stripe idempotente (§C-12.4, INV-6) | `apps/flowday/app/api/v1/billing/webhook/route.ts` |
| Feature flags (§C-9.7, §C-19.5) | `packages/core/src/flags/index.ts` |
| Triggers de monetización (§C-9.7) | `apps/flowday/lib/monetization.ts`, `app/internal/monetization/run/route.ts`, `n8n/workflows/monetization.json` |
| Mailer / sendUpgradeEmail (§C-9.7, D-3 Resend) | `packages/core/src/email/index.ts` |
| Pricing visible por flags (§C-13.6) | `apps/flowday/app/(public)/pricing/page.tsx`, `components/PricingClient.tsx` |
| Páginas legales ES/EN (§C-15.5) | `apps/flowday/app/(public)/{privacy,terms}/page.tsx` |
| Perfil público (§C-8.4, §C-13.7) | `apps/flowday/app/(public)/u/[handle]/page.tsx` |
| Stripe Tax / DIAN (§C-21) | `automatic_tax` en billing + `docs/BILLING-TAX.md` |

## Fase 4 — Crecimiento (§C-15, §C-17, §C-1.2)

| Requisito | Archivo |
|---|---|
| GDPR export/borrado (§C-15.4) | `apps/flowday/lib/account.ts`, `app/api/v1/account/{export,delete}/route.ts`, `components/AccountClient.tsx` |
| Cleanup escalable por lotes (§C-15.3, E1) | `apps/flowday/lib/cleanup.ts`, `app/internal/cleanup/run/route.ts`, `n8n/workflows/data-cleanup.json` |
| Analytics (§C-1.2 #11) | `apps/flowday/lib/analytics.ts`, `app/(auth)/analytics/page.tsx` |
| Gamificación: challenges/partner (§C-1.2 #10) | `apps/flowday/lib/challenges.ts`, `app/api/v1/challenges/*`, `app/(auth)/challenges/page.tsx` |
| Google Calendar Pro+ lectura + conflictos (§C-1.2 #8) | `apps/flowday/lib/google/calendar.ts`, `app/api/v1/calendar/route.ts` |
| Observabilidad: métricas + alertas (§C-17.2/4) | `app/internal/metrics/route.ts`, `docs/OBSERVABILITY.md` |

> **Decisión diferida (R2):** el *reagendado automático* de bloques alrededor de reuniones de
> Calendar (§C-1.2 #8 "ajustar") no tiene algoritmo especificado en el SPEC; se implementa la
> **lectura + detección de conflictos** y se difiere el auto-reschedule para no inventar comportamiento.

## Estado

Fases 0–4 completas y verificadas (typecheck/test/lint/build + gate anti-secretos en verde).
