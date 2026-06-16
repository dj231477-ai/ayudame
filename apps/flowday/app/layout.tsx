import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PWARegister } from '@/components/PWARegister';

// SPEC §C-1 (PWA instalable), INV-10 (mobile-first).
export const metadata: Metadata = {
  title: 'FlowDay',
  description: 'Accountability por foto verificada con IA. Organiza tu día en bloques y demuestra tu progreso.',
  manifest: '/manifest.json',
  applicationName: 'FlowDay',
  appleWebApp: { capable: true, title: 'FlowDay', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // locale por defecto 'es' (R15); la locale por usuario se aplica en fases posteriores.
  return (
    <html lang="es">
      <body className="min-h-dvh">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
