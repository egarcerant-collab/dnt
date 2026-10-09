'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Cargue, Preregistro } from '@/lib/dnt/preregistro';
import { CruceSeguimiento } from './cruce-seguimiento';
import { PanelPreregistro } from './preregistro';

/**
 * Cruce de bases y Pre-registro en una sola pestaña. Ambas vistas quedan montadas (solo se oculta la inactiva)
 * para no perder el archivo cargado ni los filtros al cambiar de vista.
 */
export function ModuloCruce({ registros, cargues, ips, inicial }: { registros: Preregistro[]; cargues: Cargue[]; ips: string[]; inicial: 'cruce' | 'pre' }) {
  const router = useRouter();
  const [vista, setVista] = useState(inicial);
  const pendientes = registros.filter(r => r.estado === 'pendiente').length;

  const irA = (v: 'cruce' | 'pre') => {
    setVista(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-2 border-b border-slate-200" aria-label="Vistas">
        {([
          ['cruce', '1. Cruce de bases', 'Subir la base externa y comparar con Nutria'],
          ['pre', `2. Pre-registro (${registros.length})`, pendientes ? `${pendientes} pendientes por verificar` : 'Verificar e incorporar'],
        ] as const).map(([k, t, d]) => (
          <button key={k} type="button" onClick={() => irA(k)}
            className={`-mb-px flex flex-col items-start rounded-t-lg border px-5 py-2 text-left ${vista === k ? 'border-slate-200 border-b-white bg-white font-semibold text-marca-800' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
            <span>{t}</span>
            <span className="text-xs font-normal text-slate-500">{d}</span>
          </button>
        ))}
      </nav>
      <div className={vista === 'cruce' ? '' : 'hidden'}>
        <CruceSeguimiento onIrPre={() => irA('pre')} onCargue={() => router.refresh()} />
      </div>
      <div className={vista === 'pre' ? '' : 'hidden'}>
        <PanelPreregistro registros={registros} cargues={cargues} ips={ips} onIrCruce={() => irA('cruce')} />
      </div>
    </div>
  );
}
