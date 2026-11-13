'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { MAPA_ALTO, MAPA_ANCHO, MUNICIPIOS_MAPA } from '@/lib/dnt/mapa-geo';

export interface ConteoMunicipio { depto: string; municipio: string; casos: number }

const clave = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
// Nombres del MGN que difieren de los de la base
const ALIAS: Record<string, string> = { MANAUREBALCONDELCESAR: 'MANAURE' };
const CAPITALES: Record<string, string> = { CESAR: 'VALLEDUPAR', LAGUAJIRA: 'RIOHACHA', MAGDALENA: 'SANTAMARTA' };
const ESCALA = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'];

/** Mapa de Cesar, La Guajira y Magdalena: color por número de casos; clic en un municipio o departamento para filtrar. */
export function MapaTerritorio({ conteos, valores }: { conteos: ConteoMunicipio[]; valores: { depto?: string; municipio?: string; ips?: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, startTransition] = useTransition();
  const [hover, setHover] = useState<string | null>(null);

  // Índice depto|municipio (clave compacta) → nombres reales de la base y casos
  const indice = useMemo(() => {
    const m = new Map<string, ConteoMunicipio>();
    conteos.forEach(c => {
      const k = `${clave(c.depto)}|${clave(c.municipio)}`;
      const prev = m.get(k);
      m.set(k, prev ? { ...prev, casos: prev.casos + c.casos } : c);
    });
    return m;
  }, [conteos]);
  const deptoReal = useMemo(() => {
    const m = new Map<string, string>();
    conteos.forEach(c => m.set(clave(c.depto), c.depto));
    return m;
  }, [conteos]);

  const max = Math.max(1, ...conteos.map(c => c.casos));
  const colorDe = (n: number) => (n ? ESCALA[Math.min(ESCALA.length - 1, Math.max(0, Math.floor((Math.sqrt(n) / Math.sqrt(max)) * ESCALA.length - 1e-9)))] : '#e2e8f0');
  const datoDe = (d: string, m: string) => {
    const kd = clave(d), km = clave(m);
    return indice.get(`${kd}|${ALIAS[km] ?? km}`) ?? null;
  };

  function ir(depto?: string, municipio?: string) {
    const qs = new URLSearchParams(Object.entries({ depto, municipio, ips: valores.ips }).filter(([, v]) => v) as [string, string][]).toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const selDepto = valores.depto ? clave(valores.depto) : null;
  const selMpio = valores.municipio ? clave(valores.municipio) : null;
  const totalDepto = (kd: string) => conteos.filter(c => clave(c.depto) === kd).reduce((s, c) => s + c.casos, 0);
  const info = hover ? MUNICIPIOS_MAPA.find(x => `${x.d}|${x.m}` === hover) : null;
  const infoDato = info ? datoDe(info.d, info.m) : null;

  return (
    <section className="tarjeta flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">Mapa del territorio</h3>
        <span className={`text-xs ${cargando ? 'text-marca-600' : 'text-slate-500'}`}>{cargando ? 'Actualizando…' : 'Clic en un municipio para filtrar'}</span>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {(['CESAR', 'LAGUAJIRA', 'MAGDALENA'] as const).map(kd => {
          const real = deptoReal.get(kd);
          const activo = selDepto === kd;
          return (
            <button key={kd} disabled={!real} onClick={() => (activo ? ir() : ir(real))} aria-pressed={activo}
              className={`rounded-full border px-2.5 py-1 ${activo ? 'border-marca-600 bg-marca-600 font-semibold text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-marca-50 disabled:opacity-40'}`}>
              {kd === 'LAGUAJIRA' ? 'La Guajira' : kd === 'CESAR' ? 'Cesar' : 'Magdalena'} <span className={activo ? 'text-white/80' : 'text-slate-400'}>({totalDepto(kd)})</span>
            </button>
          );
        })}
        {(selDepto || selMpio) && <button onClick={() => ir()} className="px-2 text-marca-700 underline">Ver todo</button>}
      </div>

      <div className="relative mx-auto w-full max-w-[340px]">
        <svg viewBox={`-4 -4 ${MAPA_ANCHO + 8} ${MAPA_ALTO + 8}`} className="h-auto w-full" role="img" aria-label="Mapa de casos por municipio en Cesar, La Guajira y Magdalena">
          {MUNICIPIOS_MAPA.map(x => {
            const dato = datoDe(x.d, x.m);
            const k = `${x.d}|${x.m}`;
            const kd = clave(x.d);
            const kmBase = dato ? clave(dato.municipio) : null;
            const seleccionado = selMpio != null && kmBase === selMpio && selDepto === kd;
            const atenuado = (selDepto && selDepto !== kd) || (selMpio && !seleccionado);
            return (
              <path key={k} d={x.p} fill={colorDe(dato?.casos ?? 0)} fillOpacity={atenuado ? 0.35 : 1}
                stroke={seleccionado ? '#0f172a' : hover === k ? '#334155' : '#ffffff'} strokeWidth={seleccionado ? 2.2 : hover === k ? 1.5 : 0.8}
                className={dato ? 'cursor-pointer' : ''}
                onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(h => (h === k ? null : h))}
                onClick={() => dato && (seleccionado ? ir(dato.depto) : ir(dato.depto, dato.municipio))}>
                <title>{`${x.m} (${x.d}): ${dato?.casos ?? 0} casos`}</title>
              </path>
            );
          })}
          {/* Capitales */}
          {MUNICIPIOS_MAPA.filter(x => CAPITALES[clave(x.d)] === clave(x.m)).map(x => (
            <g key={`cap-${x.m}`} pointerEvents="none">
              <circle cx={x.c[0]} cy={x.c[1]} r={3.5} fill="#0f172a" stroke="#fff" strokeWidth={1.2} />
              <text x={x.c[0] + 6} y={x.c[1] + 4} fontSize={13} fontWeight={600} fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {x.m === 'SANTA MARTA' ? 'Santa Marta' : x.m === 'RIOHACHA' ? 'Riohacha' : 'Valledupar'}
              </text>
            </g>
          ))}
        </svg>
        {info && (
          <div className="pointer-events-none absolute left-1 top-1 rounded-md bg-slate-900/90 px-2 py-1 text-xs text-white">
            <b>{info.m}</b> · {info.d}<br />{infoDato?.casos ?? 0} casos
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
        <span>0</span>
        <span className="h-2.5 w-4 rounded-sm border border-slate-200" style={{ background: '#e2e8f0' }} />
        {ESCALA.map(c => <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />)}
        <span>{max} casos</span>
      </div>
    </section>
  );
}
