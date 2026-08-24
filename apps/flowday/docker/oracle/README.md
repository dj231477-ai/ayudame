# Oracle VM — Orquestación n8n (§C-16, D-7)

Runbook para la VM Oracle Always Free (ARM A1). SPEC §C-16, §C-25.

> **Contexto (D-7):** la orquestación real corría en un Contabo VPS x86 (D-5) desde v2.1; ese
> VPS quedó suspendido por impago y se está migrando de vuelta a Oracle Always Free. Oracle
> además redujo su tier gratis desde que se escribió D-5: hoy son 2 OCPU/12GB totales en la
> cuenta (antes 4 OCPU/24GB), así que esta VM usa solo 1 OCPU/6GB (el otro 1 OCPU/6GB queda
> reservado para una VM futura). Sin Ollama: descartado por completo (D-9, latencia
> inaceptable), no solo por falta de espacio.

## Provisión

- Instancia `VM.Standard.A1.Flex` (ARM64), 1 OCPU / 6 GB / hasta 200 GB, Ubuntu 24.04 Minimal aarch64.
- Instala Docker + Compose. Abre puertos 80/443 (Nginx).

## Configuración

```bash
cp .env.example .env   # rellena DOMAIN, contraseñas, N8N_WEBHOOK_SECRET, INTERNAL_ADMIN_SECRET
docker compose up -d
./../../n8n/setup-credentials.sh   # crea la credencial nativa httpHeaderAuth (D-6, lee INTERNAL_ADMIN_SECRET de .env)
```

Desde D-6, los workflows **no** leen `$env` (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`): la URL de la
app está hardcodeada en cada JSON (`https://ayudame-flowday.vercel.app`) y la autenticación
contra `/internal/*` usa la credencial nativa `FlowDay Internal Admin` (id `FLOWDAYADMIN0001`,
cabecera `x-internal-secret`) creada por `apps/flowday/n8n/setup-credentials.sh` — no hay
secretos de producto en variables de entorno del contenedor n8n más allá de `N8N_WEBHOOK_SECRET`
(config propia de n8n, no leída por los workflows).

## SSL (Let's Encrypt)

Genera certificados con certbot (webroot `./certbot/www`) para `${DOMAIN}` y recarga Nginx.

## Workflows

Importa los JSON de `../../n8n/workflows/` (`n8n import:workflow --separate --input=...`) y
corre `setup-credentials.sh` antes de activarlos:

| Workflow | Trigger | Llama |
|---|---|---|
| `daily-schedule` | cron cada 5 min | `POST /internal/scheduler/run {job:'schedule'}` |
| `photo-reminder` | cron cada 5 min | `POST /internal/scheduler/run {job:'reminders'}` |
| `morning-briefing` | cron cada 5 min | `POST /internal/scheduler/run {job:'briefing'}` |
| `daily-reset` | cron diario 00:05 UTC | `POST /internal/scheduler/run {job:'daily_reset'}` (§C-13.3) |
| `verify-queue` | cron cada 10 min | `POST /internal/scheduler/run {job:'verify_queue'}` (drena `verification_queue`, §C-14.3) |
| `monetization` | cron diario | `POST /internal/monetization/run` |
| `data-cleanup` | cron 03:00 UTC | `POST /internal/cleanup/run` |
| `ai-usage-tracker` | cron cada hora | `POST /internal/ai-usage/reconcile` (reconciliación opcional; no es la fuente primaria) |
| `whatsapp-inbound` | WhatsApp Trigger (webhook de Meta) | `POST /internal/whatsapp-inbound` (§C-13.10) — requiere credencial `whatsAppTriggerApi` propia (App Secret de Meta) además de la de `/internal/*` |

Todos los cron corren en **UTC**; la app convierte a la tz del usuario (INV-12, §C-12.5).
n8n es solo orquestador: la lógica vive en la app (AR-3).

## Separación de datos (INV-8)

El Postgres de este compose es **interno de n8n**. La base de datos de producto es Supabase.
Nunca se cruzan consultas entre ambos.
