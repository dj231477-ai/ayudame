# Iconos PWA

`icon-192.png` e `icon-512.png` (referenciados por `public/manifest.json`) son un cuadrado
verde `#1D9E75` sin marca — placeholder generado en una sesión anterior. Pendiente del
sistema de diseño real (§C-5.2 `brand.ts` no fija valores de marca definitivos; nótese que
`manifest.json` sigue en `theme_color: #4f46e5`, sin actualizar a juego). Reemplazar estos
dos archivos cuando exista un ícono diseñado, sin tocar `manifest.json`.

`apps/flowday/scripts/generate-icons.mjs` es un generador alternativo (marca "fd" sobre
`#4f46e5`, vía screenshot de Playwright — mismo patrón que `e2e/generate-fixture.mjs`) por
si se prefiere una versión con wordmark mientras no hay diseño definitivo; no se usó para
los archivos actuales. Correr con `node scripts/generate-icons.mjs` para regenerarlos.
