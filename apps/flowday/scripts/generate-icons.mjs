#!/usr/bin/env node
// Genera public/icons/icon-{192,512}.png: marca "fd" placeholder sobre el color de marca
// (§C-5.2 brand.ts, theme_color #4f46e5 en manifest.json). Mismo enfoque que
// e2e/generate-fixture.mjs (screenshot de Playwright de un HTML mínimo) — sin depender
// de un editor de imágenes. Reemplazar por un ícono de diseño real cuando exista (README.md).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(
  new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'),
  '..',
  'public',
  'icons',
);
mkdirSync(OUT_DIR, { recursive: true });

const BRAND_INDIGO = '#4f46e5';

function markHtml(size) {
  return `<!doctype html><html><body style="margin:0;">
<div style="width:${size}px;height:${size}px;background:${BRAND_INDIGO};display:flex;align-items:center;justify-content:center;">
  <span style="font-family:'Segoe UI',Arial,sans-serif;font-weight:800;font-size:${Math.round(size * 0.44)}px;color:#ffffff;letter-spacing:-0.03em;">fd</span>
</div>
</body></html>`;
}

const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(markHtml(size));
  const outPath = path.join(OUT_DIR, `icon-${size}.png`);
  await page.screenshot({ path: outPath });
  await page.close();
  console.log(`Generado: ${outPath}`);
}
await browser.close();
