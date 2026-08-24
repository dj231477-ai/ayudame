#!/usr/bin/env node
// Genera e2e/fixtures/evidence.jpg: una captura sintética tipo "editor de código"
// para el paso de verify-photo del test E2E (bloque tipo 'deep' espera "pantalla
// con código/documento", §C-13.4). Se corre una sola vez; si algún día no pasa
// la verificación real de forma confiable, se reemplaza por una foto real.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'), 'fixtures');
mkdirSync(OUT_DIR, { recursive: true });
const OUT_PATH = path.join(OUT_DIR, 'evidence.jpg');

const html = `
<!doctype html><html><body style="margin:0;background:#1e1e1e;width:800px;height:600px;font-family:monospace;">
<div style="padding:16px;color:#d4d4d4;font-size:14px;line-height:1.6;">
<div style="color:#6a9955">// packages/core/src/credits/pricing.ts</div>
<div><span style="color:#c586c0">export</span> <span style="color:#569cd6">const</span> MARGIN = <span style="color:#b5cea8">1.0</span>;</div>
<div><span style="color:#c586c0">export</span> <span style="color:#569cd6">const</span> ACTION_COSTS = {</div>
<div>&nbsp;&nbsp;photo_verify: <span style="color:#b5cea8">0.006</span>,</div>
<div>&nbsp;&nbsp;chat_message: <span style="color:#b5cea8">0.0016</span>,</div>
<div>};</div>
<div>&nbsp;</div>
<div style="color:#6a9955">// trabajando en el bloque deep work de hoy</div>
<div><span style="color:#569cd6">function</span> <span style="color:#dcdcaa">checkBalance</span>(userId) {</div>
<div>&nbsp;&nbsp;<span style="color:#c586c0">return</span> db.rpc(<span style="color:#ce9178">'deduct_credits'</span>);</div>
<div>}</div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.setContent(html);
await page.screenshot({ path: OUT_PATH, type: 'jpeg', quality: 90 });
await browser.close();
console.log(`Generado: ${OUT_PATH}`);
