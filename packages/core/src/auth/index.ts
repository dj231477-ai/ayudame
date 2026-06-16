// =============================================================================
// Inicialización de clientes Supabase  [NORMATIVO — SPEC §C-8.6]
//  - createBrowserClient()      → anon key; componentes cliente.
//  - createServerClient(cookies)→ anon key + sesión del usuario; API Routes que
//                                  actúan COMO el usuario (respetando RLS).
//  - createServiceClient()      → service_role; SOLO backend, operaciones admin.
//                                  Nunca importable desde cliente (INV-4 + guard runtime).
//
// Nota: las referencias a process.env.NEXT_PUBLIC_* son LITERALES a propósito, para
// que Next las inline en el bundle de cliente (un acceso dinámico no se reemplaza).
// =============================================================================

import {
  createBrowserClient as ssrCreateBrowserClient,
  createServerClient as ssrCreateServerClient,
  type CookieOptions,
} from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

export type FlowDayClient = SupabaseClient<Database>;

export interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options: CookieOptions }>): void;
}

/** Cliente de browser (anon key). Para componentes cliente. */
export function createBrowserClient(): FlowDayClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return ssrCreateBrowserClient<Database>(url, anon);
}

/**
 * Cliente de servidor que actúa como el usuario (respeta RLS). Recibe un adaptador
 * de cookies para mantener @flowday/core agnóstico del framework (R6/R7); la app
 * envuelve next/headers cookies().
 */
export function createServerClient(cookies: CookieAdapter): FlowDayClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return ssrCreateServerClient<Database>(url, anon, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet: Array<{ name: string; value: string; options: CookieOptions }>) =>
        cookies.setAll(toSet),
    },
  });
}

/**
 * Cliente con service_role (bypass RLS). SOLO backend: RPC de saldo, flags, cleanup.
 * INV-4: jamás en el browser. Guard de runtime como defensa en profundidad.
 */
export function createServiceClient(): FlowDayClient {
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    throw new Error('createServiceClient() must never run in the browser (INV-4).');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
