'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Enlace del menú superior: el módulo en el que está el usuario queda resaltado. */
export function EnlaceNav({ href, children }: { href: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const activo = ruta === href || ruta.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={activo ? 'page' : undefined}
      className={`relative rounded-md px-3 py-1.5 ${activo ? 'bg-white font-semibold text-red-700 shadow' : 'hover:bg-white/15'}`}>
      {children}
    </Link>
  );
}
