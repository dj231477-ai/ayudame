// =============================================================================
// Tokens de diseño  [SPEC §C-5.2 brand.ts]
// El SPEC requiere este módulo pero NO especifica valores concretos de marca.
// Se proveen tokens neutros mínimos como andamiaje (mobile-first, INV-10). Los valores
// definitivos se fijarán con el sistema de diseño sin alterar esta API (no inventa features).
// =============================================================================

export const brand = {
  name: 'FlowDay',
  // Breakpoints — INV-10: correcto y usable a 375px antes de considerarse hecho.
  breakpoints: {
    base: 375,
    sm: 640,
    md: 768,
    lg: 1024,
  },
  // Tipos de bloque y su color/etiqueta (§C-7.2 BlockType). Valores placeholder.
  blockTypes: {
    deep: { label: 'Deep work', color: '#4f46e5' },
    admin: { label: 'Admin', color: '#0891b2' },
    body: { label: 'Cuerpo', color: '#16a34a' },
    rest: { label: 'Descanso', color: '#f59e0b' },
    review: { label: 'Revisión', color: '#7c3aed' },
  },
  // Estados de bloque (§C-13.2) para badges de UI.
  blockStatusLabels: {
    pending: 'Pendiente',
    active: 'En curso',
    awaiting_photo: 'Falta foto',
    verified: 'Verificado',
    skipped: 'Saltado',
  },
} as const;

export type BrandTokens = typeof brand;
