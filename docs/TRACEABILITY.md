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
| Herramientas de testing opt-in (§C-18.6) | `apps/flowday/scripts/test-n8n-workflows.mjs`, `apps/flowday/tests/postman/`, `apps/flowday/e2e/`, `apps/flowday/scripts/run-lighthouse.mjs` |

## Fase 1 — Núcleo de producto (§C-10, §C-11, §C-13)

| Requisito | Archivo |
|---|---|
| Router IA: getAIProvider/callAI (§C-10.3/4) | `packages/core/src/ai/router.ts` |
| Tipos IA (§C-10.2) | `packages/core/src/ai/types.ts` |
| Anti-inyección buildPrompt (§C-10.5, S3) | `packages/core/src/ai/prompt.ts` + test |
| Reintentos backoff (§C-10.4) | `packages/core/src/ai/retry.ts` |
| getDailyUsage/incrementUsage (§C-10.3, F2, E4) | `packages/core/src/ai/usage.ts` |
| Providers (gemini/groq/cerebras/minimax) (§C-10.6) | `packages/core/src/ai/providers/*` |
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
| Guía de privacidad en la foto (§C-13.9) | `packages/ui/src/PhotoCapture/index.tsx` (aviso fijo), `apps/flowday/app/(public)/privacy/page.tsx` |
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

## Fase 5 — Sincronización con producción real (SPEC v2.1, PRs #1–#5)

> Trabajo hecho en paralelo directamente sobre `origin/master` (no en este checkout) entre
> Fase 4 y Fase 6; reconciliado por fusión el 2026-08-24. Detalle operativo completo en la
> sección `## PROGRESO` al final de `FlowDay-SPEC.md`.

| Requisito | Archivo |
|---|---|
| Visión siempre Gemini, sin Claude (D-2) | `packages/core/src/ai/router.ts`, `providers/gemini.ts` (maneja 429) |
| Ruta del fundador a Ollama (revertida en Fase 6, D-9) | — |
| CSP con nonce por request (§C-8.7, M-4) | `apps/flowday/middleware.ts` |
| Secreto admin en tiempo constante (M-5) | `apps/flowday/lib/internal-auth.ts` (`authorizeInternal`) |
| Hardening n8n: credencial nativa + bloqueo `$env` (D-6) | `apps/flowday/n8n/setup-credentials.sh`, `n8n/workflows/*.json`, `docker/{local,oracle}/docker-compose.yml` |
| Scheduler consolidado (jobs schedule/reminders/briefing/daily_reset/verify_queue) | `apps/flowday/app/internal/scheduler/run/route.ts` |
| Reconciliación de ai_daily_usage | `apps/flowday/app/internal/ai-usage/reconcile/route.ts`, `n8n/workflows/ai-usage-tracker.json` |
| Créditos idempotentes/atómicos (C-1, A-2 RLS en CI) | `packages/db/migrations/011_idempotent_credit_purchase.sql`, `012_refund_credits_optional_log.sql`, `packages/core/src/credits/check.test.ts` |
| Auto-organización Calendar/Tasks (§C-26) | `apps/flowday/lib/google/calendar.ts` |
| VM de orquestación: Contabo VPS (D-5, revertido en Fase 6, D-7) | — |

## Fase 6 — Canal WhatsApp opt-in (D-8, §C-13.10) + Ollama descartado (D-9) + vuelta a Oracle (D-7)

| Requisito | Archivo |
|---|---|
| reorg_cache (§C-26.3, backfill — vivo en prod desde 2026-06-22, sin archivo hasta ahora) | `apps/flowday/db/migrations/106_reorg_cache.sql` |
| whatsapp_links (§C-7.2) | `apps/flowday/db/migrations/107_whatsapp_links.sql` |
| Envío WhatsApp (§C-13.10) | `packages/core/src/notifications/whatsapp.ts` (`sendWhatsAppText`, `fetchWhatsAppMedia`) |
| Vínculo teléfono → usuario (§C-11.13) | `apps/flowday/app/api/v1/whatsapp/link-code/route.ts` |
| UI "Conectar WhatsApp" (§C-13.10) | `apps/flowday/components/SettingsClient.tsx` |
| Webhook inbound + idempotencia (§C-11.7, INV-6) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` — autenticado igual que el resto de `/internal/*` (D-6, `authorizeInternal`), no HMAC |
| EventSource 'whatsapp' (INV-6) | `packages/core/src/events/idempotency.ts` |
| Workflow n8n (§C-12.2) | `apps/flowday/n8n/workflows/whatsapp-inbound.json` — credencial nativa `FLOWDAYADMIN0001`, URL hardcodeada (D-6) |
| Datos recopilados: teléfono opt-in (§C-15.1) | `apps/flowday/app/(public)/privacy/page.tsx` |
| MiniMax M3: fallback de pago visión+texto (D-2/D-9) | `packages/core/src/ai/providers/minimax.ts`, `router.ts` (`dispatchWithFallback`), `errors/index.ts` (`ai_text_exhausted`) |
| Ollama eliminado (D-9) | `packages/core/src/ai/{types,usage}.ts`, `providers/ollama.ts` borrado |
| Vuelta a Oracle Always Free, 1 OCPU/6GB sin Ollama (D-7) | `apps/flowday/docker/oracle/{docker-compose.yml,README.md,nginx.conf}` |
| Infra de testing opt-in (§C-18.6) | `apps/flowday/scripts/test-n8n-workflows.mjs`, `apps/flowday/tests/postman/`, `apps/flowday/e2e/`, `apps/flowday/scripts/run-lighthouse.mjs` |

## Fase 7 — Guía diaria por WhatsApp sin plantilla (D-10, §C-13.2/§C-13.3/§C-13.10/§C-26)

| Requisito | Archivo |
|---|---|
| Auto-organización real (§C-26, hasta Fase 5 solo especificada) | `apps/flowday/lib/planning/daily-plan.ts` (`getOrComputeDailyPlan`), `plan-prompt.ts` |
| evidence.phase / verification_queue.phase (§C-7.2, §C-14.3) | `apps/flowday/db/migrations/108_evidence_phase.sql` |
| Estado `awaiting_start_photo` (§C-13.2) | `apps/flowday/lib/blocks/state-machine.ts`, `packages/core/src/supabase/types.ts` (`BlockStatus`) |
| Doble foto por bloque, `phase` en verify-photo (§C-11.3, §C-13.3) | `apps/flowday/lib/verify-photo.ts`, `apps/flowday/app/api/v1/verify-photo/route.ts` |
| Scheduler: `awaiting_start_photo` en schedule/reminders, briefing dispara el plan | `apps/flowday/app/internal/scheduler/run/route.ts` |
| Palabra clave "comenzar"/siguiente bloque/cierre del día (D-10, §C-13.10) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` (`handleStartDay`, `announceNextBlock`) |
| UI de foto de inicio (PWA) | `apps/flowday/components/blocks/DayBoard.tsx` |
| Rango de día local para Calendar (§C-26.2) | `apps/flowday/lib/datetime.ts` (`localDayRangeUtc`, `localTimeHHMM`), `lib/google/calendar.ts` |

## Fase 8 — Recordatorio frecuente, opt-in para TDAH/memoria débil (D-11)

| Requisito | Archivo |
|---|---|
| profiles.frequent_reminders (§C-7.1) | `packages/db/migrations/013_frequent_reminders.sql` |
| Cadencia escalonada pura + tests (§C-13.5b) | `apps/flowday/lib/blocks/reminder-cadence.ts` |
| `PATCH /api/v1/profile` (§C-11.14) | `apps/flowday/app/api/v1/profile/route.ts` |
| Checkbox desmarcado por defecto en Ajustes | `apps/flowday/components/SettingsClient.tsx` |
| Avisos en awaiting_start_photo/awaiting_photo/active | `apps/flowday/app/internal/scheduler/run/route.ts` (`runSchedule`, `runReminders`) |
| Envío por WhatsApp si hay número vinculado | `apps/flowday/lib/notify/whatsapp.ts` (`notifyWhatsAppIfLinked`) |

## Fase 9 — "¿Qué sigue?", posponer, horario de silencio personalizable, resumen de cierre (D-12)

| Requisito | Archivo |
|---|---|
| profiles.quiet_hours_start/end (§C-7.1) | `packages/db/migrations/014_quiet_hours.sql` |
| `isQuietHours` pura + tests (§C-13.5c) | `apps/flowday/lib/blocks/quiet-hours.ts` |
| Gate de silencio en el scheduler (nunca pausa transiciones) | `apps/flowday/app/internal/scheduler/run/route.ts` (`notifyUnlessQuiet`) |
| Comando WhatsApp "¿qué sigue?" (§C-13.5d) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` (`handleWhatsNext`) |
| Comando WhatsApp "posponer" (§C-13.5d) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` (`handleCommand`) |
| Resumen de cierre de día (§C-13.5e) | `apps/flowday/lib/blocks/day-summary.ts` (`getDaySummaryText`) |
| Inputs de horario de silencio en Ajustes | `apps/flowday/components/SettingsClient.tsx` |
| `PATCH /api/v1/profile` extendido (§C-11.14) | `apps/flowday/app/api/v1/profile/route.ts` |

## Fase 10 — Completar tareas de Google Tasks al verificar (D-13)

| Requisito | Archivo |
|---|---|
| `verifyPhoto()` llama `completeTask` en fase `end` con `task_id` (§C-13.3 paso 8) | `apps/flowday/lib/verify-photo.ts` |
| `completeTask` (ya existía, ahora conectado) | `apps/flowday/lib/google/tasks.ts` |
| `task_id` pasado desde los 3 call sites de `verifyPhoto` | `apps/flowday/app/api/v1/verify-photo/route.ts`, `app/internal/whatsapp-inbound/route.ts`, `app/internal/scheduler/run/route.ts` (`runVerifyQueue`) |

## Estado

Fases 0–5 en producción (`origin/master`, PRs #1–#5). Fase 6 (WhatsApp + Ollama descartado +
vuelta a Oracle) reconciliada por fusión el 2026-08-24. Migraciones 011/012 (ya aplicadas en
junio por origin), 107_whatsapp_links, 108_evidence_phase, 013_frequent_reminders y
014_quiet_hours aplicadas contra el proyecto Supabase vía MCP (AR-2: nunca psql a mano contra
prod); 106_reorg_cache es un backfill del archivo, la tabla ya existía. Fases 7 (guía diaria por
WhatsApp, D-10), 8 (recordatorio frecuente, D-11), 9 ("¿qué sigue?"/posponer/horario de
silencio/resumen de cierre, D-12), 10 (completar tareas de Google Tasks al verificar, D-13) y 11
(todas las listas de Tasks + coherencia horaria, D-14) implementadas 2026-08-24.

**Primera prueba real completa (2026-08-24, ~1pm hora del usuario):** el flujo de WhatsApp
funcionó de punta a punta contra la cuenta real — "saldo", "racha", "saltar", "comenzar" y
"¿qué sigue?" respondieron correctamente. Confirmó también que el scheduler
(`/internal/scheduler/run`) está siendo orquestado activamente (no confirmado aún si por el VPS
real o un remanente de la prueba local con ngrok). La misma prueba expuso los dos bugs que D-14
corrige: `reorg_cache` tenía 0 filas históricas para la cuenta real hasta ese momento (primera
vez que `getOrComputeDailyPlan` corría con éxito), y el plan generado esa vez solo trajo eventos
de Calendar (con dos de ellos superpuestos a las 10:00–10:30 — pendiente de investigar si es un
bug de lectura o refleja un choque real en el Calendar del usuario) y cero tareas de Tasks,
porque `listTasks()` solo miraba la lista `@default`.

## Fase 11 — Todas las listas de Google Tasks + coherencia horaria del planificador (D-14)

| Requisito | Archivo |
|---|---|
| `listTasks`/`completeTask` con id compuesto `{listId}:{taskId}`, todas las listas (§C-11.5) | `apps/flowday/lib/google/tasks.ts` |
| `hasRoomToday`/`buildPlanPrompt(fixed, nowHHMM)` — nunca asigna en el pasado (§C-26.2b) | `apps/flowday/lib/planning/plan-prompt.ts` |
| `parsePlanResponse(text, earliestStart)` — filtro de defensa en profundidad | `apps/flowday/lib/planning/plan-prompt.ts` |
| `computePlan` pasa `nowHHMM` y corta antes de llamar IA si no hay margen | `apps/flowday/lib/planning/daily-plan.ts` |

## Fase 12 — Reagenda de bloques abandonados + saludo según la hora (D-15)

> D-14 solo corrigió lo que la IA podía *proponer*; no tocaba bloques de Calendar ya
> materializados con hora fija y vencida. Segunda vuelta de la misma prueba real expuso esto.

| Requisito | Archivo |
|---|---|
| `computeCatchUp` pura + tests (§C-13.3b) | `apps/flowday/lib/blocks/catch-up.ts` |
| `nextPendingBlock` — reagenda antes de anunciar/encadenar (§C-13.3b/§C-13.10) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` |
| `timeGreeting`/`minutesToHHMM` puras + tests | `apps/flowday/lib/datetime.ts` |
| Saludo real (`handleStartDay`) en vez de "Buenos días" fijo | `apps/flowday/app/internal/whatsapp-inbound/route.ts` |

## Fase 13 — Fix de regresión: deduplicación de bloques rota por la reagenda (D-16)

> Encontrado probando D-15 en vivo: la reagenda mutaba `start_time`, rompiendo la comparación
> `start_time+label` que evitaba duplicados — cada "comenzar" repetido creaba bloques de más,
> algunos terminaban auto-saltados, y "¿qué sigue?" reportaba "nada pendiente" de forma
> incoherente. Diagnosticado contra Supabase directamente, sin adivinar.

| Requisito | Archivo |
|---|---|
| Deduplicación de materialización solo por `label` (§C-26.3b) | `apps/flowday/lib/planning/daily-plan.ts` |
| Limpieza manual de datos ya corruptos en la cuenta real (2026-08-24) | Supabase (`blocks`), vía MCP — 6 duplicados sin evidencia asociada, confirmado antes de borrar |

## Fase 14 — El catch-up reagendaba fechas pero nunca armaba el bloque (D-17)

> Con D-16 ya corregido, "¿qué sigue?" mostró bien la tarea siguiente, pero mandar la foto de
> inicio a los segundos devolvió "no tienes ningún bloque esperando foto" — el bloque seguía en
> `pending`, y solo el cron pasivo (con un tick de 5 min que podía no volver a coincidir nunca)
> lo sacaba de ahí.

| Requisito | Archivo |
|---|---|
| `nextPendingBlock` arma `awaiting_start_photo` si el `start_time` efectivo ya llegó (§C-13.3b) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` |
| Mensajes ("Siguiente"/"Ahora mismo") reflejan si ya quedó armado (`started`) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` |

## Fase 15 — Primera prueba real con Playwright del ciclo de dos fotos: dos bugs críticos de infra (D-18/D-19)

> Pedido explícito del usuario: "tus test siempre dicen que todo está bien" — probar contra la
> cuenta real con Playwright, no confiar solo en tests unitarios. La primera prueba (clic real
> en "Iniciar") devolvió 500 de inmediato; encontró dos bugs de *drift* entre lo committeado y
> lo vivo en Supabase que ningún test unitario podía atrapar, porque ninguno ejercita el
> constraint/trigger real de Postgres.

| Requisito | Archivo |
|---|---|
| D-18: CHECK de `blocks.status` en prod sin `awaiting_start_photo` desde que D-10 lo introdujo | `apps/flowday/db/migrations/109_blocks_status_check_fix.sql` |
| D-19: `trg_blocks_touch` nunca existió en prod, `updated_at` jamás se actualizaba (backfill) | `apps/flowday/db/migrations/110_blocks_touch_trigger_backfill.sql` |
| `updateBlockStatus()` — las transiciones del scheduler ya no fallan en silencio | `apps/flowday/app/internal/scheduler/run/route.ts` |
| `nextPendingBlock` revisa el error de su propia escritura de estado | `apps/flowday/app/internal/whatsapp-inbound/route.ts` |
| Script de prueba real (Playwright + foto real de `fotospruebas/`) | `apps/flowday/scripts/test-two-phase-real.mjs` (no versionado, como los scripts de prueba anteriores) |

## Fase 16 — WhatsApp: foto de cierre en `active` + comando "lista" (D-20/D-21)

> Reportado por el usuario contra la cuenta real, tras la Fase 15: mandó la foto de cierre y el
> bot respondió "no tienes ningún bloque esperando foto", pese a que "¿qué sigue?" acababa de
> mostrar ese mismo bloque como el actual. Diagnóstico confirmado en Supabase: el bloque estaba
> `active` (no `awaiting_photo`), y `handlePhoto` nunca buscaba en `active`.

| Requisito | Archivo |
|---|---|
| D-20: `handlePhoto` acepta la foto de cierre también en `active` (equivalente al botón "Terminar" de la PWA, que WhatsApp no tiene) | `apps/flowday/app/internal/whatsapp-inbound/route.ts` |
| D-21: comando "lista"/"listar"/"tareas" — todos los bloques de hoy con su estado en un mensaje | `apps/flowday/app/internal/whatsapp-inbound/route.ts` (`LIST_TASKS_COMMAND`, `handleListTasks`) |

## Fase 17 — Google Tasks API nunca habilitada + filtro de vencimiento + fecha de vuelta a Tasks (D-22/D-23/D-24)

> El usuario pidió que las tareas de hoy tuvieran fecha/hora según los huecos libres de su
> Calendar. `GET /api/v1/tasks` contra la cuenta real devolvía `{"tasks":[]}` pese a tener 40+
> tareas reales — se agregó logging temporal y se confirmó un 403 de Google: la Tasks API nunca
> se había habilitado en el proyecto de Google Cloud (Calendar sí). El usuario la habilitó y se
> confirmó en vivo que `listTasks()` ya trae las tareas reales.

| Requisito | Archivo |
|---|---|
| D-22: logging permanente en `listTaskLists`/`listTasks` (antes silenciaba cualquier fetch no-ok) | `apps/flowday/lib/google/tasks.ts` |
| Script de diagnóstico real (`GET /api/v1/tasks` con la sesión real) | `apps/flowday/scripts/debug-list-tasks.mjs` (no versionado) |
| D-23: `computePlan` solo ofrece a la IA tareas con `due <= hoy`, no todo el backlog | `apps/flowday/lib/planning/daily-plan.ts` |
| D-24: `scheduleTask()` — escribe `due = hoy` (sin hora, límite real de la API de Google) en cada tarea que la IA encaja hoy | `apps/flowday/lib/google/tasks.ts`, `apps/flowday/lib/planning/daily-plan.ts` (`scheduleTasksToday`) |

## Fase 18 — Tope configurable de tareas por día (D-25)

> El usuario preguntó qué pasa con las tareas sin fecha (D-23 las deja fuera) y pidió control
> directo: un tope máximo de tareas por día, configurable en Ajustes, para que aunque haya 40
> tareas vencidas nunca se le asignen más de las que él especifique.

| Requisito | Archivo |
|---|---|
| `profiles.max_daily_tasks` (default 5, check 1..20) | `packages/db/migrations/015_max_daily_tasks.sql` |
| Tipo generado | `packages/core/src/supabase/types.ts` |
| `PATCH /api/v1/profile` acepta `max_daily_tasks` | `apps/flowday/app/api/v1/profile/route.ts` |
| `computePlan` corta las tareas elegibles (ordenadas por `due` ascendente) al tope antes de la IA y de nuevo sobre el resultado; el tope entra al `source_hash` de `reorg_cache` | `apps/flowday/lib/planning/daily-plan.ts` |
| Control numérico en Ajustes | `apps/flowday/components/SettingsClient.tsx`, `apps/flowday/app/(auth)/settings/page.tsx` |

## Fase 19 — Organización proactiva: tareas sin fecha + eventos reales en Google Calendar (D-26)

> Pedido explícito del usuario: lo que D-13 (2.1.5) excluyó a propósito ("deliberadamente NO
> incluye escribir eventos en Google Calendar") ahora sí se construye, confirmado por el usuario
> incluyendo el costo de tener que reconectar Google para el permiso de escritura nuevo.

| Requisito | Archivo |
|---|---|
| `profiles.auto_organize_tasks` (opt-in, default false) | `packages/db/migrations/016_auto_organize_tasks.sql` |
| `blocks.calendar_event_id` (evita duplicar eventos en replanificaciones) | `apps/flowday/db/migrations/111_blocks_calendar_event_id.sql` |
| Tipos generados (`profiles.auto_organize_tasks`, `blocks.calendar_event_id`) | `packages/core/src/supabase/types.ts` |
| `GOOGLE_CALENDAR_SCOPE` pasa de `calendar.readonly` a `calendar.events` | `apps/flowday/lib/google/tokens.ts` |
| `createEvent`/`updateEvent` contra Calendar real | `apps/flowday/lib/google/calendar.ts` |
| `localDateTimeToUtc` (fecha+hora local → instante UTC exacto) | `apps/flowday/lib/datetime.ts`, `apps/flowday/lib/datetime.test.ts` |
| `computePlan` incluye tareas sin `due` cuando el flag está activo + crea eventos de Calendar (`createCalendarEventsForBlocks`) | `apps/flowday/lib/planning/daily-plan.ts` |
| `PATCH /api/v1/profile` acepta `auto_organize_tasks` | `apps/flowday/app/api/v1/profile/route.ts` |
| Checkbox + aviso de reconexión cuando falta el scope | `apps/flowday/components/SettingsClient.tsx`, `apps/flowday/app/(auth)/settings/page.tsx` |
