import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// SPEC §C-18.4: MSW activo en toda la suite de apps/flowday.
//
// `onUnhandledRequest` es estricto a propósito: una petición de red que ningún handler declara
// debe romper el test, no salir de verdad a internet. Es justo la clase de fallo que D-22 tardó
// meses en revelar (listTasks() devolvía [] en silencio contra una API deshabilitada).
//
// Única excepción: tests/rls.integration.test.ts habla con una instancia REAL de Supabase
// (§C-18.2, INV-1). Esas peticiones se dejan pasar; cualquier otra sigue siendo error.
const passthroughHosts = [process.env.SUPABASE_TEST_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
  .filter((u): u is string => Boolean(u))
  .map((u) => {
    try {
      return new URL(u).host;
    } catch {
      return '';
    }
  })
  .filter(Boolean);

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      if (passthroughHosts.includes(new URL(request.url).host)) return;
      print.error();
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
