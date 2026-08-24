#!/usr/bin/env node
// Smoke test de los workflows de n8n (§C-18.6).
//
// IMPORTANTE: `n8n execute --id` NO sirve aquí — esta versión de n8n solo lo
// permite para workflows que empiezan con un nodo "Execute Workflow Trigger";
// los nuestros usan Schedule Trigger (cron), como debe ser para su propósito
// (§C-12.2). Así que en vez de forzar una ejecución manual, este script:
//   1. confirma que los 5 workflows están importados y ACTIVOS (publicados),
//   2. para los 3 que corren cada 5 min (daily-schedule, photo-reminder,
//      morning-briefing), espera a su próximo tick real y confirma éxito,
//   3. para los 2 de cron diario (monetization, data-cleanup) solo confirma
//      que están activos — esperar su horario real no es viable en un smoke test.
//
// Requiere: `npm run dev:flowday` (o `npx turbo run dev --filter=flowday`)
// corriendo, y el stack de apps/flowday/docker/local levantado.

import { execFileSync } from 'node:child_process';

const PG_CONTAINER = 'local-postgres-1';
const FIVE_MIN_WORKFLOWS = ['daily-schedule', 'photo-reminder', 'morning-briefing'];
const DAILY_WORKFLOWS = ['monetization', 'data-cleanup'];
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 6 * 60_000; // un ciclo de cron + margen

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', PG_CONTAINER, 'psql', '-U', 'n8n', '-d', 'n8n', '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function getWorkflowStatus() {
  const out = psql('select name, active from workflow_entity;');
  const map = new Map();
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [name, active] = line.split('|');
    map.set(name.trim(), active.trim() === 't');
  }
  return map;
}

function latestExecutionAt(sinceIso) {
  const out = psql(
    `select w.name, e.status from execution_entity e ` +
      `join workflow_entity w on w.id::text = e."workflowId"::text ` +
      `where e."startedAt" > '${sinceIso}' order by e."startedAt" desc;`,
  );
  const byName = new Map();
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [name, status] = line.split('|');
    if (!byName.has(name.trim())) byName.set(name.trim(), status.trim());
  }
  return byName;
}

const ALL_NAMES = [...FIVE_MIN_WORKFLOWS, ...DAILY_WORKFLOWS];
let failures = 0;

console.log('1) Verificando que los 5 workflows estén importados y activos...');
const statusByName = getWorkflowStatus();
for (const name of ALL_NAMES) {
  if (!statusByName.has(name)) {
    console.log(`   FALTA: "${name}" no está importado`);
    failures++;
  } else if (!statusByName.get(name)) {
    console.log(`   INACTIVO: "${name}" está importado pero no publicado/activo`);
    failures++;
  } else {
    console.log(`   OK: "${name}" activo`);
  }
}

console.log(
  `\n2) Esperando el próximo tick de cron (cada 5 min) para: ${FIVE_MIN_WORKFLOWS.join(', ')}...`,
);
const sinceIso = new Date().toISOString();
const deadline = Date.now() + POLL_TIMEOUT_MS;
const pending = new Set(FIVE_MIN_WORKFLOWS);

while (pending.size > 0 && Date.now() < deadline) {
  const seen = latestExecutionAt(sinceIso);
  for (const name of [...pending]) {
    if (seen.has(name)) {
      const status = seen.get(name);
      console.log(`   ${name}: ${status === 'success' ? 'OK' : `FALLÓ (status=${status})`}`);
      if (status !== 'success') failures++;
      pending.delete(name);
    }
  }
  if (pending.size > 0) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
for (const name of pending) {
  console.log(`   ${name}: sin ejecución todavía tras ${POLL_TIMEOUT_MS / 1000}s (timeout)`);
  failures++;
}

console.log(
  `\n3) ${DAILY_WORKFLOWS.join(', ')}: son cron diario, no se espera su horario real aquí — ` +
    `solo se validó arriba que estén activos.`,
);

console.log('');
if (failures > 0) {
  console.log(`${failures} problema(s) encontrado(s).`);
  process.exit(1);
} else {
  console.log('Todo en orden.');
}
