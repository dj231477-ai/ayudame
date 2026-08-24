# Oracle VM — Orquestación n8n (Fase 2)

Runbook para la VM Oracle Always Free (ARM A1). SPEC §C-16.

## Provisión

- Instancia `VM.Standard.A1.Flex` (ARM64), 1 OCPU / 6 GB / hasta 200 GB, Ubuntu 24.04 Minimal aarch64 (§C-16.2 — Oracle redujo el tier gratis; el otro 1 OCPU/6GB de la cuenta queda reservado para una VM futura, sin Ollama aquí).
- Instala Docker + Compose. Abre puertos 80/443 (Nginx). **No** abras 11434 (Ollama, no corre en esta VM) a Internet.

## Configuración

```bash
cp .env.example .env   # rellena DOMAIN, contraseñas, APP_URL, INTERNAL_ADMIN_SECRET, N8N_WEBHOOK_SECRET
docker compose up -d
```

`INTERNAL_ADMIN_SECRET` y `N8N_WEBHOOK_SECRET` **deben coincidir** con los de la app en Vercel
(§C-24): así el scheduler (`/internal/scheduler/run`), el webhook n8n (`/api/v1/webhooks/n8n`)
y el webhook de WhatsApp (`/api/v1/webhooks/whatsapp-inbound`) aceptan las llamadas de n8n.

El compose ya fija dos variables de n8n que no son evidentes (§C-18.6): `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
(los workflows leen `{{$env.APP_URL}}`, bloqueado por defecto) y `NODE_FUNCTION_ALLOW_BUILTIN=crypto`
(el nodo Code de `whatsapp-inbound` firma HMAC con `require('crypto')`, también bloqueado por defecto).

## SSL (Let's Encrypt)

Genera certificados con certbot (webroot `./certbot/www`) para `${DOMAIN}` y recarga Nginx.

## Workflows

Importa los JSON de `../../n8n/workflows/` en el panel n8n (`https://${DOMAIN}`):

| Workflow | Trigger | Llama |
|---|---|---|
| `daily-schedule` | cron cada 5 min | `POST /internal/scheduler/run {job:'schedule'}` |
| `photo-reminder` | cron cada 5 min | `POST /internal/scheduler/run {job:'reminders'}` |
| `morning-briefing` | cron cada 5 min | `POST /internal/scheduler/run {job:'briefing'}` |
| `monetization` | cron diario | `POST /internal/monetization/run` |
| `data-cleanup` | cron 03:00 UTC | `POST /internal/cleanup/run` |
| `whatsapp-inbound` | WhatsApp Trigger (webhook de Meta) | `POST /api/v1/webhooks/whatsapp-inbound` (§C-13.10) — requiere credencial `whatsAppTriggerApi` configurada en n8n con el App Secret de Meta |

Todos los cron corren en **UTC**; la app convierte a la tz del usuario (INV-12, §C-12.5).
n8n es solo orquestador: la lógica vive en la app (AR-3).

## Separación de datos (INV-8)

El Postgres de este compose es **interno de n8n**. La base de datos de producto es Supabase.
Nunca se cruzan consultas entre ambos.
