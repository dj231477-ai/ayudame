// Next.js config — SPEC §C-8.7 (headers de seguridad), §C-5.3 (transpila packages del monorepo).

/**
 * CSP base (§C-8.7). Pragmática: permite Supabase y Stripe. Se endurecerá con nonces en
 * fases posteriores. 'unsafe-inline' en script/style es un baseline conocido a reducir.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
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
