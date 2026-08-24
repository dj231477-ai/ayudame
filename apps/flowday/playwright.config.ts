import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// E2E del flujo central (§C-18.1, §C-18.6): crear bloque -> activo -> foto -> verificado.
// Opt-in/manual (`npm run test:e2e`), no forma parte del gate de CI todavía.

// Playwright no carga .env.local automáticamente (a diferencia de Next.js, que sí
// lo hace pero solo desde su propio directorio — mismo gap documentado en el README).
// global-setup.ts necesita NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SUPABASE_SERVICE_ROLE_KEY
// ya en process.env antes de arrancar, así que se cargan aquí explícitamente.
try {
  const envPath = path.resolve(__dirname, '.env.local');
  for (const line of readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const idx = s.indexOf('=');
    const key = s.slice(0, idx).trim();
    if (!(key in process.env)) process.env[key] = s.slice(idx + 1).trim();
  }
} catch {
  // sin .env.local: global-setup.ts lanzará un error claro si faltan las vars.
}
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    // :3000 está ocupado por otro proyecto sin relación (ilais/frontend) en esta
    // máquina de desarrollo — FlowDay local corre en :3001 para no chocar con él.
    baseURL: 'http://localhost:3001',
    storageState: path.resolve(__dirname, 'e2e/.auth/user.json'),
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx next dev -p 3001',
    url: 'http://localhost:3001/api/v1/health',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
