# @flowday/db — Esquema de datos (SPEC §C-7, §C-8)

**SQL puro.** Este paquete no exporta código (regla §C-5.3). Es la **única** definición del esquema
(§C-7); cualquier otra capa referencia aquí, no duplica.

## Convenciones (INV-9, §C-2.1)

- `snake_case`; PKs `uuid` con `gen_random_uuid()` salvo `profiles.id` (→ `auth.users`).
- Toda tabla con datos de usuario incluye `user_id` y **nace con RLS** en su propia migración (§C-8.2, R8).
- Tablas internas (`ai_daily_usage`, `monetization_events`, `feature_flags`, `processed_events`):
  RLS activado **sin políticas** ⇒ solo `service_role` (§C-8.3).
- **Numeración monotónica e inmutable:** compartidas `000–099`, de la app `100+`.
  Una migración publicada **nunca** se edita; se corrige con una nueva (INV-9, §C-19.3).

## Orden de aplicación [NORMATIVO — §C-19.2]

1. Compartidas: `migrations/000` … `migrations/010`
2. Vistas: `views/public_profiles.sql`
3. Storage: `storage/buckets.sql`
4. App FlowDay: `apps/flowday/db/migrations/100` … `103`

> Migraciones **primero**, luego el deploy de la app (§C-19.2). Estrategia expand→migrate→contract (§C-19.3).

## Inventario

| Archivo | Tabla/objeto | Notas |
|---|---|---|
| `000_profiles.sql` | `profiles` | PK = auth.users; trigger protege `plan`/`streak` |
| `001_credits.sql` | `credits` | saldo USD; escrituras solo vía RPC service_role |
| `002_usage_log.sql` | `usage_log` | append-only; insert por backend |
| `003_credit_purchases.sql` | `credit_purchases` | escrito por webhook Stripe |
| `004_push_subscriptions.sql` | `push_subscriptions` | CRUD propio |
| `005_ai_daily_usage.sql` | `ai_daily_usage` | interna |
| `006_monetization_events.sql` | `monetization_events` | interna |
| `007_feature_flags.sql` | `feature_flags` | interna; semillas por defecto |
| `008_subscriptions.sql` | `subscriptions` | autoridad = Stripe |
| `009_processed_events.sql` | `processed_events` | idempotencia webhooks |
| `010_rpc_functions.sql` | RPCs + trigger alta | `search_path` fijado + grants service_role |
| `views/public_profiles.sql` | `public_profiles` | solo handle/full_name/streak |
| `storage/buckets.sql` | bucket `evidence-photos` | privado, 5 MB, JPEG/PNG/WebP |
| `100_blocks.sql` | `blocks` | máquina de estados §C-13.2 |
| `101_evidence.sql` | `evidence` | append-only (INV-11) |
| `102_habits.sql` | `habits` | CRUD propio |
| `103_challenges.sql` | `challenges`, `challenge_members` | RLS sin recursión (helpers definer) |

## Aplicar

Con la Supabase CLI (recomendado para local, §C-19.1) o `psql` directo:

```bash
# Requiere DATABASE_URL apuntando a la base (local o staging; nunca prod a mano).
bash scripts/apply-migrations.sh
```

El script aplica en el orden NORMATIVO de arriba dentro de una transacción por archivo.

## Tipos TypeScript

`@flowday/core/supabase/types.ts` refleja este esquema. Regenerar tras cambios:
`supabase gen types typescript --linked > packages/core/src/supabase/types.ts`.
