# FlowDay Platform

> PWA de **accountability por foto verificada con IA**. Monorepo multi-producto.
> **Fuente de verdad única:** [`FlowDay-SPEC.md`](./FlowDay-SPEC.md) v2.0. Donde el código y el SPEC difieran, gana el SPEC (§C-3 R1).

## Qué es

El usuario organiza su día en **bloques de tiempo**; al terminar cada bloque la app exige una **foto de evidencia**; una **IA de visión** (Gemini primario, Claude fallback) verifica que la foto corresponde a la tarea; el resultado queda en un **historial inmutable**. Modelo **freemium híbrido**: plan (features) + créditos prepago (consumo de IA). Ver §C-1.

## Arquitectura (monorepo Turborepo — §C-5)

```
packages/
  core/   @flowday/core  — lógica sin UI (auth, credits, ai, errors, observability, ...)
  ui/     @flowday/ui     — componentes React compartidos
  db/     @flowday/db     — esquema SQL (migraciones, vistas, storage)
apps/
  flowday/               — Producto 1 (Next.js 15 App Router + API /api/v1)
```

**Regla de dependencias (§C-5.3, inviolable):**
`packages/core` → solo npm externo · `packages/ui` → puede importar core · `packages/db` → SQL puro ·
`apps/*` → importan core/ui/db, **nunca** otra app · `packages/*` → **nunca** importan de apps.

## Stack (§C-6)

Next.js 15 · TypeScript estricto · Tailwind · Supabase (Auth/DB/Storage) · Stripe · Web Push (VAPID) ·
n8n self-hosted (Oracle Always Free) · Gemini/Groq/Cerebras/Ollama/Claude · Vitest.

## Requisitos

- Node ≥ 20.11 (`.nvmrc`)
- npm 10+ (workspaces)

## Puesta en marcha

```bash
cp .env.example .env.local      # rellena valores (INV-4: secretos solo aquí, nunca en repo)
npm install
npm run dev                     # turbo run dev (todos los workspaces)
npm run dev:flowday             # solo la app FlowDay
```

### Base de datos

Las migraciones viven en `packages/db/migrations` (compartidas, `000–099`) y
`apps/flowday/db/migrations` (de la app, `100+`). Orden de aplicación y convenciones en
[`packages/db/README.md`](./packages/db/README.md). Migración publicada = inmutable (INV-9).

## Calidad y CI (§C-18)

```bash
npm run lint        # eslint (R13)
npm run typecheck   # tsc --noEmit
npm run test        # vitest (lógica financiera, router IA, RLS, webhooks)
npm run build       # turbo build
npm run ci:no-secrets   # gate INV-4: ningún secreto en bundles de cliente
```

El gate de merge (§C-18.5): `lint + test + build` verdes · sin secretos en cliente ·
tests obligatorios presentes para PRs que tocan créditos/IA/RLS/webhooks · migraciones monotónicas con RLS.

## Trazabilidad

[`docs/TRACEABILITY.md`](./docs/TRACEABILITY.md) mapea cada requisito del SPEC a su archivo. Cada archivo
relevante incluye comentarios `[SPEC §X]`.

## Estado de construcción (roadmap §C-22)

- [x] **Fase 0** — Fundaciones: monorepo, migraciones 000–010 + 100–103, RLS, vista pública, bucket, RPCs, auth+stipend.
- [x] **Fase 1** — Núcleo: bloques + máquina de estados, verify-photo, router IA multi-proveedor, créditos/pre-cobro, rate limiting (Upstash), PWA + Web Push, UI compartida.
- [x] **Fase 2** — Automatización: webhook n8n (HMAC+idempotencia), scheduler tz-aware (start/warning/end, recordatorios, briefing), entrega de push, Google Tasks (OAuth offline + tokens cifrados), docker-compose Oracle + workflows n8n.
- [x] **Fase 3** — Monetización: Stripe checkout/portal/webhook idempotente, feature flags + triggers, Mailer (Resend), pricing por flags, legal ES/EN, perfil público, Stripe Tax/DIAN (doc).
- [x] **Fase 4** — Crecimiento: Google Calendar (Pro+, lectura + conflictos), analytics, retos/accountability partner (Team), cleanup escalable + GDPR (export/borrado), observabilidad (métricas + alertas).

> **Decisión diferida:** el reagendado automático de bloques alrededor de reuniones (§C-1.2 #8) no tiene algoritmo en el SPEC; se entrega lectura + detección de conflictos y se difiere el auto-reschedule.
