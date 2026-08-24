#!/usr/bin/env node
// Genera tests/postman/local.postman_environment.local.json (gitignored) con los
// secretos reales de .env.local, para no comprometerlos en el archivo versionado.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '../../../.env.local');

function readEnv(p) {
  const text = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const out = {};
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const idx = s.indexOf('=');
    out[s.slice(0, idx).trim()] = s.slice(idx + 1).trim();
  }
  return out;
}

const env = readEnv(rootEnvPath);
const out = {
  name: 'flowday-local (generado)',
  values: [
    { key: 'base_url', value: 'http://localhost:3001', enabled: true },
    { key: 'internal_admin_secret', value: env.INTERNAL_ADMIN_SECRET ?? '', enabled: true },
    { key: 'n8n_webhook_secret', value: env.N8N_WEBHOOK_SECRET ?? '', enabled: true },
  ],
};

const outPath = path.resolve(__dirname, '../tests/postman/local.postman_environment.local.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Generado: ${outPath}`);
