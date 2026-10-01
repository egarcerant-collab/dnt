'use client';

import { useRouter } from 'next/navigation';

/** Permite al administrador ver el módulo de cualquier prestador. */
export function SelectorIps({ opciones, valor }: { opciones: string[]; valor: string }) {
  const router = useRouter();
  return (
    <label className="tarjeta flex flex-wrap items-center gap-3 p-3 text-sm">
      <span className="etiqueta">Ver módulo del prestador</span>
      <select value={valor} onChange={e => router.push(`/prestador?ips=${encodeURIComponent(e.target.value)}`)} className="input max-w-md">
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
