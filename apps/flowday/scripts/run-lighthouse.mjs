#!/usr/bin/env node
// Lighthouse (§C-18.6): performance/accesibilidad/SEO/buenas prácticas, emulación
// móvil (INV-10 es mobile-first — accesibilidad SÍ se exige aquí, no es opcional).
// Usa chrome-launcher (dependencia de lighthouse, la forma soportada de facto)
// apuntado al binario de Chromium de Playwright (ya instalado por test:e2e:install)
// — el launcher de Playwright no expone el puerto CDP de forma confiable para
// conexiones externas, chrome-launcher sí. Local/opt-in, no bloquea CI.
//
// Nota: correr contra `next dev` da un score de PERFORMANCE poco representativo
// (sin minificar/optimizar) — por eso solo se falla en accesibilidad, performance
// queda como informativo hasta que se corra contra un build de producción.

import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.LIGHTHOUSE_BASE_URL ?? 'http://localhost:3001';
const PAGES = ['/', '/pricing', '/privacy', '/terms'];
const ACCESSIBILITY_MIN = 0.85;
const OUT_DIR = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'), '../lighthouse-report');

const { default: lighthouse } = await import('lighthouse');

mkdirSync(OUT_DIR, { recursive: true });

const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});

let failures = 0;
const summary = [];

for (const p of PAGES) {
  const url = `${BASE_URL}${p}`;
  process.stdout.write(`-> ${url} ... `);
  const result = await lighthouse(
    url,
    { port: chrome.port, output: 'html', logLevel: 'error' },
    {
      extends: 'lighthouse:default',
      settings: { formFactor: 'mobile', screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 2 } },
    },
  );

  const scores = {
    performance: result.lhr.categories.performance.score,
    accessibility: result.lhr.categories.accessibility.score,
    'best-practices': result.lhr.categories['best-practices'].score,
    seo: result.lhr.categories.seo.score,
  };
  summary.push({ page: p, ...scores });

  const reportPath = path.join(OUT_DIR, `${p === '/' ? 'home' : p.replace(/\//g, '')}.html`);
  writeFileSync(reportPath, result.report);

  const pct = (n) => `${Math.round(n * 100)}`;
  console.log(
    `perf ${pct(scores.performance)} · a11y ${pct(scores.accessibility)} · best-practices ${pct(scores['best-practices'])} · seo ${pct(scores.seo)}`,
  );

  if (scores.accessibility < ACCESSIBILITY_MIN) {
    console.log(`   FALLA: accesibilidad ${pct(scores.accessibility)}% < ${pct(ACCESSIBILITY_MIN)}% (INV-10, mobile-first)`);
    failures++;
  }
}

await chrome.kill();

console.log(`\nReportes HTML en: ${OUT_DIR}`);
console.log('(performance es informativo: next dev no está minificado/optimizado, no representa producción)');

if (failures > 0) {
  console.log(`\n${failures} página(s) por debajo del mínimo de accesibilidad.`);
  process.exit(1);
} else {
  console.log('\nAccesibilidad OK en todas las páginas públicas auditadas.');
}
