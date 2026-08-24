// Playwright globalTeardown (§C-18.6). Borra el usuario de prueba creado en
// global-setup.ts — cascade elimina credits/blocks/evidence (INV-1 no se ve
// afectado: es aislamiento entre usuarios, no restricción de borrado admin).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const AUTH_DIR = path.resolve(__dirname, '.auth');
const TEST_USER_FILE = path.join(AUTH_DIR, 'test-user.json');

export default async function globalTeardown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return;

  let userId: string | undefined;
  try {
    const raw = readFileSync(TEST_USER_FILE, 'utf8');
    userId = (JSON.parse(raw) as { id: string }).id;
  } catch {
    return; // nada que limpiar
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`No se pudo borrar el usuario de prueba ${userId}: ${error.message}`);
  } else {
    console.log(`Usuario de prueba ${userId} eliminado.`);
  }

  rmSync(AUTH_DIR, { recursive: true, force: true });
}
