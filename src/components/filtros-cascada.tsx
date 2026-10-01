'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

export interface Combinacion { depto: string; municipio: string; ips: string }
type Clave = keyof Combinacion;
type Valores = Partial<Record<Clave, string>>;

const CAMPOS: Array<[Clave, string]> = [
  ['depto', 'Departamento'],
  ['municipio', 'Municipio'],
  ['ips', 'IPS'],
];

/** Filtros facetados: cada lista muestra solo lo compatible con las demás selecciones. */
export function FiltrosCascada({ combinaciones, valores, total }: { combinaciones: Combinacion[]; valores: Valores; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, startTransition] = useTransition();

  const compatibles = (v: Valores, excepto?: Clave) =>
    combinaciones.filter(c => CAMPOS.every(([k]) => k === excepto || !v[k] || c[k] === v[k]));

  const opciones = (k: Clave) => [...new Set(compatibles(valores, k).map(c => c[k]))].sort();

  function cambiar(k: Clave, valor: string) {
    const nuevo: Valores = { ...valores, [k]: valor || undefined };
    // Descarta selecciones que ya no son compatibles con el nuevo valor
    for (const [otra] of CAMPOS) {
      if (otra !== k && nuevo[otra] && !compatibles({ [k]: nuevo[k], [otra]: nuevo[otra] }).length) delete nuevo[otra];
    }
    const qs = new URLSearchParams(Object.entries(nuevo).filter(([, v]) => v) as [string, string][]).toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const activos = CAMPOS.some(([k]) => valores[k]);

  return (
    <div className="tarjeta flex flex-wrap items-end gap-3 p-3 text-sm">
      {CAMPOS.map(([k, label]) => {
        const ops = opciones(k);
        return (
          <label key={k} className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="etiqueta">{label} <span className="normal-case text-slate-400">({ops.length})</span></span>
            <select value={valores[k] ?? ''} onChange={e => cambiar(k, e.target.value)} className="input">
              <option value="">Todos</option>
              {ops.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        );
      })}
      {activos && (
        <button onClick={() => startTransition(() => router.push(pathname, { scroll: false }))} className="boton-sec h-[38px]">
          Limpiar
        </button>
      )}
      <span className={`ml-auto self-center ${cargando ? 'text-marca-600' : 'text-slate-500'}`}>{cargando ? 'Actualizando…' : `${total} casos`}</span>
    </div>
  );
}
