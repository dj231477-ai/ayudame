// Next.js config — SPEC §C-8.7 (headers de seguridad), §C-5.3 (transpila packages del monorepo).

// La Content-Security-Policy se emite con nonce por request desde middleware.ts (§C-8.7, M-4),
// lo que permite eliminar 'unsafe-inline' de script-src. El resto de cabeceras de seguridad
// (estáticas, sin estado por request) se sirven aquí para todas las rutas, incluidos estáticos.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // C-1.3: no GPS. Cámara permitida (PhotoCapture, Fase 1).
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@flowday/core', '@flowday/ui', '@flowday/db'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
