import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// SPEC §C-18.4: Vitest. Tests de integración (RLS) requieren instancia Supabase de prueba.
export default defineConfig({
  resolve: {
    alias: [
      // `server-only` lanza fuera de un RSC; en test lo sustituimos por un no-op.
      { find: 'server-only', replacement: fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)) },
      // Alias `@/...` -> raíz de la app (igual que tsconfig paths), para los imports de runtime.
      { find: /^@\/(.*)$/, replacement: `${fileURLToPath(new URL('.', import.meta.url))}$1` },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
    // SPEC §C-18.4: MSW intercepta toda petición HTTP saliente; las no declaradas fallan.
    setupFiles: ['./tests/msw/setup.ts'],
  },
});
