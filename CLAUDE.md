# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

**[`FlowDay-SPEC.md`](./FlowDay-SPEC.md) (v2.1.11) is the single source of truth for this project.** Where code and the SPEC differ, the SPEC wins (§C-3 R1). Read the relevant section before implementing anything — the index (`## Índice`) at the top maps every topic to its section number. Sections/blocks marked **[NORMATIVO]** must be implemented as specified (names, signatures, semantics); **[ILUSTRATIVO]** blocks communicate intent and may be adapted as long as the declared contract is respected (§C-3.2).

Do not introduce a dependency, table, endpoint, or env var that isn't in the SPEC without adding it there first (R2). If a task seems to require violating an invariant (§C-2, below), stop and report the conflict instead of working around it (R3).

[`docs/TRACEABILITY.md`](./docs/TRACEABILITY.md) maps every SPEC requirement to its implementing file — useful for finding where a given invariant/contract actually lives. Relevant files also carry `[SPEC §X]` comments.

## What this is

FlowDay: a PWA for **photo-verified accountability**. The user blocks out their day into time blocks; finishing a block requires a **photo of evidence**; a **vision AI** (Gemini always; MiniMax M3 paid fallback once `vision_paid_fallback_active` is on, D-2) verifies the photo matches the task; the result lands in an **immutable history**. Hybrid freemium model: plan (features) + prepaid credits (AI consumption). WhatsApp Business Cloud API is an additional opt-in channel (D-8, §C-13.10) — never a replacement for the PWA.

## Commands

Run from the repo root (npm workspaces + Turborepo):

```bash
npm install
npm run dev                 # turbo run dev — all workspaces
npm run dev:flowday         # only the flowday app (turbo --filter=flowday)

npm run lint                # turbo run lint (eslint, flat config at repo root)
npm run typecheck           # turbo run typecheck (tsc --noEmit)
npm run test                # turbo run test (vitest)
npm run build                # turbo run build
npm run ci:no-secrets       # scripts/check-no-secrets.mjs — INV-4 gate: no secrets in client bundles

npm run format               # prettier --write
npm run format:check
```

Per-package, from `apps/flowday` or `packages/core` (the only workspaces with test suites):

```bash
npx vitest run                          # all tests in the workspace
npx vitest run path/to/file.test.ts     # single file
npx vitest run -t "test name"           # single test by name
```

- `packages/core` tests: `src/**/*.test.ts`, node environment.
- `apps/flowday` tests: `tests/**/*.test.ts`, `lib/**/*.test.ts`, `app/**/*.test.ts`, node environment, 30s timeout (integration tests, e.g. `tests/rls.integration.test.ts`, need a real Supabase test instance).
- `packages/db` and `packages/ui` have no JS scripts — turbo skips them for lint/test/typecheck/build (`packages/db` is pure SQL).

Additional opt-in testing tools (§C-18.6, `apps/flowday`, not part of `npm run test`/CI):

```bash
npm run test:n8n         # smoke test: confirms n8n workflows are active and fire correctly (needs docker/local stack + dev server up)
npm run test:newman      # Postman/Newman collection against /internal/* and the n8n webhook (needs dev server up)
npm run test:e2e         # Playwright core-loop E2E (needs `npm run test:e2e:install` once first)
npm run test:lighthouse  # mobile a11y/perf/SEO audit of public pages, reuses Playwright's Chromium (needs dev server up)
```

Database migrations (`packages/db/scripts/apply-migrations.sh`, requires `DATABASE_URL`):

```bash
bash packages/db/scripts/apply-migrations.sh
```

Applies, in order (§C-19.2, normative): shared migrations `packages/db/migrations/000`–`012`, then `packages/db/views/public_profiles.sql`, then `packages/db/storage/buckets.sql`, then app migrations `apps/flowday/db/migrations/100`–`107`. **A published migration is never edited** — fix forward with a new file (INV-9). After a schema change, regenerate types: `supabase gen types typescript --linked > packages/core/src/supabase/types.ts`.

**Migration numbering gap**: `106_reorg_cache.sql` was applied directly to production on 2026-06-22 (Calendar/Tasks auto-organization, §C-26) but its file was never committed — discovered and backfilled 2026-08-24 when reconciling with `origin/master`. `107_whatsapp_links.sql` (not `106`) is the WhatsApp channel migration, numbered after the backfill to avoid colliding with the already-live `106`.

**Local dev gotcha**: Next.js only reads `.env.local` from `apps/flowday/`, not the monorepo root — `cp .env.local apps/flowday/.env.local` after filling the root one, or `npm run dev:flowday` starts but every request 500s with "Missing NEXT_PUBLIC_SUPABASE_URL".

## Architecture

Turborepo monorepo, two layers that never mix (§C-5.1): `packages/` (reusable logic, no product coupling) and `apps/` (products that consume packages). A new product is a new `apps/*` directory reusing `packages/*` — nothing here assumes FlowDay is the only product (AR-8).

```
packages/
  core/   @flowday/core — logic with no UI (auth, credits, ai router, billing, notifications,
                           retention, events, errors, observability, brand). Deep-imported via
                           subpath exports, e.g. @flowday/core/credits/pricing.
  ui/     @flowday/ui   — shared React components. May import @flowday/core.
  db/     @flowday/db   — SQL only (migrations/views/storage). No code, no exports.
apps/
  flowday/              — Product 1: Next.js 15 App Router. UI in app/(auth) and app/(public);
                           backend is app/api/v1/** (versioned REST) + app/internal/** (service-only,
                           called by n8n with a shared secret).
```

**Dependency rule, inviolable (§C-5.3):**
- `packages/core` → only external npm deps, never internal ones.
- `packages/ui` → may import `@flowday/core`.
- `packages/db` → pure SQL, no code imports.
- `apps/*` → may import `@flowday/core`, `@flowday/ui`, `@flowday/db`; **never** import another app.
- `packages/*` → **never** import from `apps/*`.

Reusable logic across products belongs in `packages/core` or `packages/ui`; FlowDay-specific logic stays in `apps/flowday` (R7).

### System invariants (§C-2) — treat violations as critical defects

- **INV-1** User isolation: no user reads/writes/infers another user's data except via `public_profiles` (§C-8.4) or a shared Team challenge.
- **INV-2** Pre-charge before AI: every AI call goes through `checkAndDeductCredits` first; insufficient balance blocks the call.
- **INV-3** Single source of pricing: `MARGIN` and per-action costs live only in `packages/core/src/credits/pricing.ts`.
- **INV-4** Server secrets never reach the client: no `service_role` key or provider secret under `NEXT_PUBLIC_*` or sent to the browser (checked by `npm run ci:no-secrets`).
- **INV-5** Verified events: inbound webhooks (Stripe, n8n) process only with a valid signature; invalid ⇒ 401, no side effects.
- **INV-6** Idempotent effects: replaying the same `event_id` produces the same end state as processing it once.
- **INV-7** Vision never on local CPU: photo verification never runs on Ollama; no cloud vision provider available ⇒ explicit degradation (§C-14.3), never silent.
- **INV-8** Product data and orchestration are separate databases: Supabase (product) vs n8n's own Postgres (orchestration) — never cross-query.
- **INV-9** Migrations are ordered and immutable: shared `000–099`, per-app `100+`; published migrations are never edited.
- **INV-10** Mobile-first: every UI component must be correct and usable at 375px before it's done.
- **INV-11** Evidence history is append-only: verification records are never rewritten; corrections are new records.
- **INV-12** The user's timezone (`profiles.timezone`) is the scheduling authority, even though crons run in UTC.

### AI router (`@flowday/core/ai`, §C-10)

All AI calls go through `callAI(userId, action, req)` in `packages/core/src/ai/router.ts` — never call a provider directly from a route. n8n never chooses a provider; when it needs AI it calls an app endpoint that uses the router. `callAI` does, in order: pre-charge via `checkAndDeductCredits` (INV-2) → build the prompt via `buildPrompt` (anti-injection, see below) → dispatch to the provider with retry/backoff (`withRetry`) → record usage via `incrementUsage` → refund via `refundCredits` on failure.

Provider selection (`getAIProvider`, §C-10.3): vision always tries Gemini first; if it throws `ai_vision_exhausted` (quota exhausted, detected at dispatch via a 429), `dispatchWithFallback` retries once with MiniMax M3 when the `vision_paid_fallback_active` flag is on (D-2), else the error propagates (explicit degradation, queued in `verification_queue`). Text rotates Groq → Cerebras by daily quota (`ai_daily_usage` table, reset by date); if both are exhausted, same flag routes to MiniMax M3, else throws `ai_text_exhausted` before charging. Ollama was removed entirely (D-9, §C-25) — too slow (8–12 tok/s) even as best-effort; **never used for vision** (INV-7) even before its removal.

Anti-prompt-injection (§C-10.5, R11): user-supplied data (e.g. `taskName`) is never concatenated into the system instruction. It goes through `buildPrompt` into a delimited, inert `<user_data>` block.

### Credits & monetization (§C-9)

Hybrid model: plan (feature gates) + prepaid credit balance (AI consumption, USD-denominated). Pricing lives solely in `packages/core/src/credits/pricing.ts` (`MARGIN`, `ACTION_COSTS`, `ACTION_COSTS_REAL`) — no hardcoded costs elsewhere (INV-3). Credit writes happen only through the RPC functions in `packages/db/migrations/010_rpc_functions.sql` under `service_role`; `checkAndDeductCredits`/`refundCredits` in `packages/core/src/credits/check.ts` wrap them.

### Security & RLS (§C-8)

Every table with user data carries `user_id` and is born with RLS enabled and policies in the same migration (R8). Internal tables (`ai_daily_usage`, `monetization_events`, `feature_flags`, `processed_events`) have RLS enabled with **no policies** — service_role only. Public profile data goes through the `public_profiles` view, never a relaxed policy on `profiles`. Evidence photos live only in Supabase Storage; the verifier accesses them via a short-lived (≤60s) signed URL generated server-side (§C-8.5, R12).

### API conventions (§C-11)

All backend routes under `apps/flowday/app/api/v1/**`, JSON in/out, input validated with zod. Errors are uniform: `{ "error": { "code": "...", "message": "<i18n>", "details": {} } }`. Status codes: 400 validation · 401 unauthenticated/bad signature · 402 insufficient credits · 403 no permission (plan/feature) · 404 · 409 invalid state transition · 429 rate limit · 500. Sensitive mutations (checkout) accept an `Idempotency-Key` header. Service-only endpoints (triggered by n8n with a shared secret, never exposed to the client) live under `apps/flowday/app/internal/**`.

### Quality bar (§C-3.5, §C-18)

- TypeScript strict everywhere (`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals/Parameters`). No `any` without a documented justification in the file itself (enforced by `@typescript-eslint/no-explicit-any`).
- i18n: identifiers/code in English; user-facing strings come from an i18n catalog by key (ES default, EN available) — never inline user strings in logic code.
- Any PR touching credits, the AI router, RLS, or webhooks must include the corresponding tests from §C-18.2 (checkAndDeductCredits/refundCredits atomicity, getAIProvider/callAI quota rotation + INV-7 + degradation + refund-on-failure, buildPrompt injection resistance, verify-photo integration flow, RLS cross-user isolation, webhook signature/idempotency, error-catalog mapping) and pass the CI gate: `turbo run lint test build` green, no-secrets check, monotonic migrations with RLS present.
