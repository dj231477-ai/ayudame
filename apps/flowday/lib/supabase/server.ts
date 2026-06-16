import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient as coreCreateServerClient, type FlowDayClient } from '@flowday/core/auth';

/**
 * Cliente Supabase de servidor que actúa COMO el usuario (respeta RLS). SPEC §C-8.6.
 * Envuelve next/headers cookies() en el CookieAdapter agnóstico de @flowday/core.
 */
export async function createClient(): Promise<FlowDayClient> {
  const cookieStore = await cookies();
  return coreCreateServerClient({
    getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Llamado desde un Server Component (cookies de solo lectura): el middleware
        // refresca la sesión, así que es seguro ignorar aquí.
      }
    },
  });
}
