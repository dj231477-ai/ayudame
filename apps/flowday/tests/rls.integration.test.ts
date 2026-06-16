import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@flowday/core/supabase/types';

// =============================================================================
// Tests de aislamiento por usuario (RLS)  [SPEC §C-18.2, INV-1]
// Verifica que el usuario B no puede leer datos de A y que las tablas internas no son
// accesibles salvo service_role. Requiere una instancia Supabase de PRUEBA (§C-18.4):
//   SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_ANON_KEY
// Si no están configuradas, el bloque se omite (no falla CI local sin DB).
// =============================================================================

const URL = process.env.SUPABASE_TEST_URL;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

// A-2 (§C-18.2/§C-18.5): en CI se exporta RLS_TESTS_REQUIRED=1. Si entonces falta el entorno
// de prueba, FALLAMOS en vez de omitir en silencio: INV-1 no puede quedar sin verificar.
// En desarrollo local (sin esa variable) se sigue omitiendo de forma elegante.
if (!hasEnv && process.env.RLS_TESTS_REQUIRED === '1') {
  throw new Error(
    'Tests RLS requeridos (RLS_TESTS_REQUIRED=1) pero faltan SUPABASE_TEST_URL / ' +
      'SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY (INV-1, §C-18.2).',
  );
}

const PASSWORD = 'Test-Passw0rd!';

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
}

async function createUser(admin: SupabaseClient<Database>, label: string): Promise<TestUser> {
  const email = `rls_${label}_${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  const client = createClient<Database>(URL!, ANON!);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  return { id: data.user.id, email, client };
}

describe.skipIf(!hasEnv)('RLS isolation (INV-1, §C-8)', () => {
  let admin: SupabaseClient<Database>;
  let userA: TestUser;
  let userB: TestUser;
  let blockId: string;

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userA = await createUser(admin, 'a');
    userB = await createUser(admin, 'b');

    // A crea un bloque (el trigger ya creó profiles+credits de ambos).
    const { data, error } = await userA.client
      .from('blocks')
      .insert({
        user_id: userA.id,
        date: '2026-06-13',
        start_time: '06:00',
        end_time: '09:00',
        label: 'Deep work',
        type: 'deep',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`A insert block failed: ${error?.message}`);
    blockId = data.id;
  });

  afterAll(async () => {
    if (userA) await admin.auth.admin.deleteUser(userA.id);
    if (userB) await admin.auth.admin.deleteUser(userB.id);
  });

  it('B no puede leer el bloque de A', async () => {
    const { data } = await userB.client.from('blocks').select('id').eq('id', blockId);
    expect(data ?? []).toHaveLength(0);
  });

  it('B no puede leer el saldo de A', async () => {
    const { data } = await userB.client.from('credits').select('balance').eq('user_id', userA.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('A sí puede leer su propio bloque', async () => {
    const { data } = await userA.client.from('blocks').select('id').eq('id', blockId);
    expect(data ?? []).toHaveLength(1);
  });

  it('una tabla interna (feature_flags) no es accesible para usuarios autenticados', async () => {
    const { data } = await userA.client.from('feature_flags').select('key');
    expect(data ?? []).toHaveLength(0);
  });

  it('B no puede insertar un bloque a nombre de A (RLS WITH CHECK)', async () => {
    const { error } = await userB.client.from('blocks').insert({
      user_id: userA.id,
      date: '2026-06-13',
      start_time: '10:00',
      end_time: '11:00',
      label: 'spoof',
      type: 'admin',
    });
    expect(error).not.toBeNull();
  });
});
