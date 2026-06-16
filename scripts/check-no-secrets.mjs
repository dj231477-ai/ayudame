#!/usr/bin/env node
/**
 * CI anti-secret gate. SPEC §C-18.5 paso 2 + INV-4 + S1.
 *
 * Verifica que ningún bundle de cliente (apps/* /.next/static) contenga:
 *   - El literal "service_role" (clave/JWT de service_role).
 *   - El valor de cualquier variable de entorno secreta (denylist), si está presente.
 *
 * Falla con exit code 1 si encuentra una filtración. Pensado para correr en CI
 * después de `turbo run build`. No depende de paquetes externos.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

// Variables de entorno que NUNCA deben aparecer en un bundle de cliente (INV-4).
const SECRET_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'VAPID_PRIVATE_KEY',
  'GOOGLE_CLIENT_SECRET',
  'N8N_WEBHOOK_SECRET',
  'INTERNAL_ADMIN_SECRET',
  'GOOGLE_GEMINI_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
];

// Substrings literales prohibidos en cualquier bundle de cliente.
const FORBIDDEN_LITERALS = ['service_role'];

/** Recolecta los valores secretos presentes en el entorno actual. */
function secretValues() {
  const values = [];
  for (const name of SECRET_ENV_NAMES) {
    const v = process.env[name];
    if (v && v.length >= 8) values.push({ name, value: v });
  }
  return values;
}

/** Recorre recursivamente un directorio devolviendo rutas de archivos .js/.mjs. */
function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkJs(full, acc);
    else if (/\.(js|mjs|cjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function clientBundleDirs() {
  const appsDir = join(ROOT, 'apps');
  if (!existsSync(appsDir)) return [];
  const dirs = [];
  for (const app of readdirSync(appsDir)) {
    const staticDir = join(appsDir, app, '.next', 'static');
    if (existsSync(staticDir)) dirs.push(staticDir);
  }
  return dirs;
}

function main() {
  const dirs = clientBundleDirs();
  if (dirs.length === 0) {
    console.warn('[check-no-secrets] No client bundles found (.next/static). Run build first. Skipping.');
    return;
  }

  const secrets = secretValues();
  const violations = [];

  for (const dir of dirs) {
    for (const file of walkJs(dir)) {
      const content = readFileSync(file, 'utf8');
      for (const lit of FORBIDDEN_LITERALS) {
        if (content.includes(lit)) violations.push(`${file}: contains forbidden literal "${lit}"`);
      }
      for (const { name, value } of secrets) {
        if (content.includes(value)) violations.push(`${file}: leaks secret env value of ${name}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('[check-no-secrets] FAILED — secret material found in client bundles (INV-4, §C-18.5):');
    for (const v of violations) console.error('  - ' + v);
    process.exit(1);
  }
  console.log('[check-no-secrets] OK — no secrets in client bundles.');
}

main();
