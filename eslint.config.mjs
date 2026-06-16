// Flat ESLint config compartido (raíz). SPEC R13 (TS estricto) y R9 (aislamiento service_role).
// ESLint descubre este archivo subiendo desde cada workspace; no se duplica por paquete.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
      // Generado por Next (triple-slash) y scripts de browser SW/Worker (globals self/Worker).
      '**/next-env.d.ts',
      '**/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // R13: 'any' prohibido salvo justificación documentada en el propio archivo.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // R9 / INV-4: el service_role solo se usa en backend. Prohibir su import en código cliente.
    // (Regla afinada por carpeta en apps/flowday; aquí queda el principio general.)
    files: ['**/*.{ts,tsx}'],
    rules: {},
  },
);
