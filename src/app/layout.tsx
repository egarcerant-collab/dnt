import type { Metadata } from 'next';
import './globals.css';
import { PieSoporte } from '@/components/pie-soporte';

export const metadata: Metadata = {
  title: 'Nutria · Monitoreo de Desnutrición · Dusakawi EPSI',
  description: 'Seguimiento niño a niño de desnutrición aguda en menores de 5 años (Res. 2350/2020)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        {children}
        <PieSoporte />
      </body>
    </html>
  );
}
