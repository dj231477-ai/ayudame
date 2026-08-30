// =============================================================================
// Inspector de página con navegador real (§C-18.6, herramienta opt-in).
//
// Equivalente local de lo que daría Chrome DevTools MCP, pero ejecutable desde la shell
// sin depender de que el cliente MCP esté cargado. Reusa el Chromium que ya instala
// Playwright (`npm run test:e2e:install`), así que no añade dependencias.
//
// Reporta lo que un test unitario no puede ver: mensajes de consola, errores de JS no
// capturados, peticiones fallidas y respuestas 4xx/5xx — la clase de fallo silencioso de
// D-18/D-19/D-22, que solo aparece contra un navegador y un servidor de verdad.
//
// Uso:
//   node scripts/inspect-page.mjs <url> [--viewport 375x812] [--shot ruta.png] [--wait ms]
// =============================================================================
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('Uso: node scripts/inspect-page.mjs <url> [--viewport WxH] [--shot ruta.png] [--wait ms]');
  process.exit(2);
}
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

// INV-10: mobile-first. 375px es el ancho mínimo en el que todo debe ser correcto.
const [w, h] = flag('viewport', '375x812').split('x').map(Number);
const shot = flag('shot', null);
const waitMs = Number(flag('wait', '1500'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h } });

const consola = [];
const fallos = [];
const respuestas = [];

page.on('console', (m) => consola.push({ tipo: m.type(), texto: m.text() }));
page.on('pageerror', (e) => consola.push({ tipo: 'pageerror', texto: e.message }));
page.on('requestfailed', (r) =>
  fallos.push({ url: r.url(), motivo: r.failure()?.errorText ?? 'desconocido' }),
);
page.on('response', (r) => {
  if (r.status() >= 400) respuestas.push({ status: r.status(), url: r.url() });
});

let nav;
try {
  nav = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
} catch (e) {
  console.error(`No se pudo cargar ${url}: ${e.message}`);
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(waitMs);

console.log(`\n=== ${url}`);
console.log(`HTTP ${nav?.status()} · título: ${JSON.stringify(await page.title())} · viewport ${w}x${h}`);

// §C-8.7: cabeceras de seguridad, tal y como las ve el navegador.
const headers = nav?.headers() ?? {};
const interes = [
  'content-security-policy',
  'x-frame-options',
  'strict-transport-security',
  'cross-origin-opener-policy',
  'permissions-policy',
];
console.log('\n--- cabeceras de seguridad ---');
for (const k of interes) console.log(`  ${headers[k] ? 'OK  ' : 'FALTA'} ${k}`);

const errores = consola.filter((c) => c.tipo === 'error' || c.tipo === 'pageerror');
console.log(`\n--- consola: ${consola.length} mensajes, ${errores.length} errores ---`);
for (const c of errores.slice(0, 15)) console.log(`  [${c.tipo}] ${c.texto.slice(0, 300)}`);
if (!errores.length) console.log('  (sin errores)');

console.log(`\n--- peticiones fallidas: ${fallos.length} ---`);
for (const f of fallos.slice(0, 15)) console.log(`  ${f.motivo}  ${f.url.slice(0, 160)}`);
if (!fallos.length) console.log('  (ninguna)');

console.log(`\n--- respuestas 4xx/5xx: ${respuestas.length} ---`);
for (const r of respuestas.slice(0, 15)) console.log(`  ${r.status}  ${r.url.slice(0, 160)}`);
if (!respuestas.length) console.log('  (ninguna)');

// INV-10: desbordamiento horizontal a 375px — el síntoma clásico de romper mobile-first.
// El callback de page.evaluate se serializa y se ejecuta dentro del navegador, donde `document`
// sí existe; en el ámbito de Node en el que lint analiza este fichero, no está definido.
const overflow = await page.evaluate(
  // eslint-disable-next-line no-undef
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log(`\n--- INV-10 (mobile-first) ---`);
console.log(overflow > 0 ? `  DESBORDA ${overflow}px en horizontal` : '  sin desbordamiento horizontal');

if (shot) {
  await mkdir(path.dirname(path.resolve(shot)), { recursive: true });
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\ncaptura: ${shot}`);
}

await browser.close();
process.exit(errores.length || fallos.length ? 1 : 0);
