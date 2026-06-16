import { defineConfig } from 'vitest/config';

// SPEC §C-18.4: Vitest. Tests de integración (RLS) requieren instancia Supabase de prueba.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
  },
});
