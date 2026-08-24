// Playwright globalSetup (§C-18.6). Crea un usuario de prueba real en el proyecto
// Supabase de DESARROLLO (mismo que .env.local — decisión explícita del usuario,
// no un proyecto de test separado) y le inyecta una sesión válida como cookies,
// evitando el login real por Google OAuth (que no se puede automatizar).
//
// Reusa @supabase/ssr (la misma librería que usa la app en lib/supabase/server.ts)
// con un adaptador de cookies que solo CAPTURA lo que la librería generaría — así
// el formato de cookie queda idéntico al que produce la app real, sin adivinarlo.
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { chromium, type FullConfig } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { STIPENDS } from '@flowday/core/credits/pricing';

const AUTH_DIR = path.resolve(__dirname, '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');
const TEST_USER_FILE = path.join(AUTH_DIR, 'test-user.json');
const PASSWORD = 'Playwright-Test-Passw0rd!';

export default async function globalSetup(config: FullConfig) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en el entorno (.env.local).',
    );
  }

  mkdirSync(AUTH_DIR, { recursive: true });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `e2e_${Date.now()}@example.com`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${createErr?.message}`);
  }

  writeFileSync(TEST_USER_FILE, JSON.stringify({ id: created.user.id, email }));

  // Un usuario creado por Admin API se salta app/auth/callback/route.ts (donde
  // runSignupOnboarding() otorga el stipend en el flujo real) — se replica aquí,
  // usando la misma fuente única de precios (INV-3), para que verify-photo tenga
  // saldo con el que cobrar (§C-9.2, §C-11.3).
  const { error: stipendErr } = await admin.rpc('grant_signup_stipend', {
    p_user_id: created.user.id,
    p_amount: STIPENDS.free,
  });
  if (stipendErr) {
    throw new Error(`No se pudo otorgar el stipend al usuario de prueba: ${stipendErr.message}`);
  }

  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr || !signIn.session) {
    throw new Error(`No se pudo iniciar sesión con el usuario de prueba: ${signInErr?.message}`);
  }

  // Captura las cookies exactamente como @supabase/ssr las generaría en la app real.
  const captured: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const ssrClient = createServerClient(url, anon, {
    cookies: {
      getAll: () => [],
      setAll: (toSet) => {
        captured.push(...toSet);
      },
    },
  });
  const { error: setErr } = await ssrClient.auth.setSession({
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  });
  if (setErr) throw new Error(`setSession falló: ${setErr.message}`);
  if (captured.length === 0) throw new Error('No se capturó ninguna cookie de sesión — revisar @supabase/ssr.');

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3001';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies(
    captured.map((c) => ({
      name: c.name,
      value: c.value,
      url: baseURL,
      expires: Math.floor(Date.now() / 1000) + (c.options?.maxAge ?? 60 * 60 * 24 * 30),
    })),
  );
  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
