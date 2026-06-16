# Oracle VM — Orquestación n8n (Fase 2)

Runbook para la VM Oracle Always Free (ARM A1). SPEC §C-16.

## Provisión

- Instancia `VM.Standard.A1.Flex` (ARM64), 4 OCPU / 24 GB / 200 GB, Ubuntu 22.04 (§C-16.2).
- Instala Docker + Compose. Abre puertos 80/443 (Nginx). **No** abras 11434 (Ollama) a Internet (§C-16.3).

## Configuración

```bash
cp .env.example .env   # rellena DOMAIN, contraseñas, APP_URL, INTERNAL_ADMIN_SECRET, N8N_WEBHOOK_SECRET
docker compose up -d
```

`INTERNAL_ADMIN_SECRET` y `N8N_WEBHOOK_SECRET` **deben coincidir** con los de la app en Vercel
(§C-24): así el scheduler (`/internal/scheduler/run`) y el webhook (`/api/v1/webhooks/n8n`)
aceptan las llamadas de n8n.

## SSL (Let's Encrypt)

Genera certificados con certbot (webroot `./certbot/www`) para `${DOMAIN}` y recarga Nginx.

## Workflows

Importa los JSON de `../../n8n/workflows/` en el panel n8n (`https://${DOMAIN}`):

| Workflow | Cron | Llama |
|---|---|---|
| `daily-schedule` | cada 5 min | `POST /internal/scheduler/run {job:'schedule'}` |
| `photo-reminder` | cada 5 min | `POST /internal/scheduler/run {job:'reminders'}` |
| `morning-briefing` | cada 5 min | `POST /internal/scheduler/run {job:'briefing'}` |

Todos los cron corren en **UTC**; la app convierte a la tz del usuario (INV-12, §C-12.5).
n8n es solo orquestador: la lógica vive en la app (AR-3).

## Separación de datos (INV-8)

El Postgres de este compose es **interno de n8n**. La base de datos de producto es Supabase.
Nunca se cruzan consultas entre ambos.
