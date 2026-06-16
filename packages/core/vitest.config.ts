import { defineConfig } from 'vitest/config';

// Tests de unidad/integración de @flowday/core (SPEC §C-18.4: Vitest).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
