#!/usr/bin/env bash
# Aplica el esquema FlowDay en el orden NORMATIVO (SPEC §C-19.2).
# Requiere: psql en PATH y DATABASE_URL (local/staging). NUNCA contra prod a mano (§C-4 AR-2).
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL (postgresql://...)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DB="$(cd "$ROOT/../../apps/flowday/db" && pwd)"

run() {
  echo "==> $1"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$1"
}

echo "== Compartidas (000–010) =="
for f in "$ROOT"/migrations/0*.sql; do run "$f"; done

echo "== Vistas =="
run "$ROOT/views/public_profiles.sql"

echo "== Storage =="
run "$ROOT/storage/buckets.sql"

echo "== App FlowDay (100+) =="
for f in "$APP_DB"/migrations/1*.sql; do run "$f"; done

echo "✓ Migraciones aplicadas en orden."
