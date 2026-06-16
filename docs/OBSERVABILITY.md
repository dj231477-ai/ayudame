# Observabilidad — SPEC §C-17

## Logging estructurado (§C-17.1)

`@flowday/core/observability/logger` emite JSON con `timestamp`, `level`, `event`,
`request_id`, `user_id?`, `route?`, `latency_ms?`, `provider?`, `status?`, `error.code?`.
**Nunca** PII sensible, secretos ni contenido de fotos (claves sensibles se redactan).

Eventos mínimos: cada request de API, cada `callAI` (proveedor/tokens/cobro), cada webhook
(fuente/event_id/resultado), cada transición de estado de bloque, cada error con su `code`.

## Métricas (§C-17.2)

- **Endpoint:** `GET /internal/metrics` (cabecera `x-internal-secret`). Devuelve:
  - `platform` (RPC `get_platform_metrics`: usuarios, MAU, verificaciones/mes, coste/mes).
  - `ai_usage_today` por proveedor (de `ai_daily_usage`).
  - `active_subscriptions_by_plan` (conversiones Pro/Team).
- IA: uso diario por proveedor, tasa de fallback, latencia p50/p95 y tasa de `ai_vision_exhausted`
  se derivan de los logs de `callAI`.

## Health & readiness (§C-17.3)

- `GET /api/v1/health` → 200 si la app responde.
- `GET /api/v1/ready` → verifica conectividad a Supabase; 200/503.

## Alertas (mínimo, §C-17.4)

Configurar en el proveedor de monitoreo sobre los logs/métricas:

| Alerta | Umbral sugerido |
|---|---|
| Error rate (5xx) | > 1% de requests en 5 min |
| `ai_vision_exhausted` sostenido | > 1% de verificaciones (KPI §C-20.2) |
| Fallo de webhook (firma/proceso) | cualquier `webhook.*.bad_signature` o `idempotency.effect_failed` |
| Cuota de proveedor cerca del límite | `ai_daily_usage` > 90% del umbral del router |
| Job de cleanup fallido | `cleanup.failed` |
