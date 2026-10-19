import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'הימורי בחירות 2026',
  description: 'אפליקציית הימורי בחירות לכנסת 2026',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
