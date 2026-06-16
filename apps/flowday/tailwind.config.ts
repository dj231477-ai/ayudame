import type { Config } from 'tailwindcss';

// Mobile-first (INV-10): el breakpoint base es 375px. SPEC §C-6 (Tailwind).
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '375px',
      },
      colors: {
        deep: '#4f46e5',
        admin: '#0891b2',
        body: '#16a34a',
        rest: '#f59e0b',
        review: '#7c3aed',
      },
    },
  },
  plugins: [],
};

export default config;
