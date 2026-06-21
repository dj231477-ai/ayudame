#!/usr/bin/env bash
# =============================================================================
# setup-credentials.sh — Reconstruye las credenciales n8n del proyecto (D-6, §C-25).
#
# Las credenciales de n8n NO se exportan en los JSON de los workflows (viven cifradas
# en el store de n8n). Este script las (re)crea de forma reproducible a partir del
# secreto del entorno, para que cualquiera pueda levantar el entorno completo desde
# el repo + este script.
#
# Crea la credencial "Header Auth" que los 8 workflows usan para autenticarse contra
# los endpoints /internal/* de la app (cabecera x-internal-secret). El secreto vive
# cifrado y NO es legible vía $env por otros workflows de la instancia (hardening D-6).
#
# Requisitos:
#   - Contenedor n8n en marcha (por defecto: n8n-n8n-1).
#   - INTERNAL_ADMIN_SECRET en el entorno, o en /opt/services/n8n/.env.
#
# Uso:
#   INTERNAL_ADMIN_SECRET=xxxx ./setup-credentials.sh
#   # o, si está en /opt/services/n8n/.env:
#   ./setup-credentials.sh
#
# IMPORTANTE: el id y el nombre deben coincidir con los referenciados en los
# workflows (apps/flowday/n8n/workflows/*.json -> credentials.httpHeaderAuth).
# =============================================================================
set -euo pipefail

CONTAINER="${N8N_CONTAINER:-n8n-n8n-1}"
ENV_FILE="${N8N_ENV_FILE:-/opt/services/n8n/.env}"

# ID y NOMBRE canónicos (referenciados por los workflows). NO cambiar sin actualizar los JSON.
CRED_ID="FLOWDAYADMIN0001"
CRED_NAME="FlowDay Internal Admin"
HEADER_NAME="x-internal-secret"

# Resolver el secreto: del entorno, o del .env del stack.
if [[ -z "${INTERNAL_ADMIN_SECRET:-}" && -f "$ENV_FILE" ]]; then
  INTERNAL_ADMIN_SECRET="$(grep '^INTERNAL_ADMIN_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
fi
: "${INTERNAL_ADMIN_SECRET:?Falta INTERNAL_ADMIN_SECRET (en el entorno o en $ENV_FILE)}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<JSON
[{"id":"${CRED_ID}","name":"${CRED_NAME}","type":"httpHeaderAuth","data":{"name":"${HEADER_NAME}","value":"${INTERNAL_ADMIN_SECRET}"}}]
JSON
chmod 644 "$TMP"  # el usuario 'node' del contenedor debe poder leerlo (mktemp crea 600)

docker cp "$TMP" "${CONTAINER}:/tmp/flowday-cred.json"
docker exec "$CONTAINER" n8n import:credentials --input=/tmp/flowday-cred.json
docker exec -u root "$CONTAINER" sh -c 'rm -f /tmp/flowday-cred.json'

echo "OK: credencial '${CRED_NAME}' (id ${CRED_ID}, cabecera ${HEADER_NAME}) creada/actualizada en ${CONTAINER}."
echo "Reimporta los workflows si aún no lo has hecho: n8n import:workflow --separate --input=apps/flowday/n8n/workflows"
