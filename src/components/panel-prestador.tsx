'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FilaCaso } from '@/lib/dnt/filas';
import { ALERTAS } from '@/lib/dnt/types';
import { AlertaChip, EstadoBadge, SeveridadBadge, formatoFecha } from './ui';

type Pestana = 'prioridad' | 'activos' | 'todos';

const CERRADOS = ['RECUPERADO', 'FALLECIDO', 'DESCARTADO', 'DESERTADO'];
const esAlta = (f: FilaCaso) => f.alertas.some(a => ALERTAS[a].nivel === 'alta');
const diasDesde = (iso: string | null, corte: string) =>
  iso ? Math.round((new Date(corte).getTime() - new Date(iso).getTime()) / 864e5) : null;

export function PanelPrestador({ filas: todas, fechaCorte }: { filas: FilaCaso[]; fechaCorte: string }) {
  const [pestana, setPestana] = useState<Pestana>('prioridad');
  const [q, setQ] = useState('');
  const [municipio, setMunicipio] = useState('');

  // Sedes (municipios) donde la IPS tiene niños, con su número de casos
  const sedes = useMemo(() => {
    const m = new Map<string, number>();
    todas.forEach(f => m.set(f.municipio || 'SIN MUNICIPIO', (m.get(f.municipio || 'SIN MUNICIPIO') ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [todas]);
  const filas = useMemo(
    () => (municipio ? todas.filter(f => (f.municipio || 'SIN MUNICIPIO') === municipio) : todas),
    [todas, municipio],
  );

  const activos = filas.filter(f => !CERRADOS.includes(f.estado));
  const prioridad = filas.filter(esAlta);

  const visibles = useMemo(() => {
    const base = pestana === 'prioridad' ? prioridad : pestana === 'activos' ? activos : filas;
    const t = q.trim().toUpperCase();
    const filtradas = t ? base.filter(f => f.nombre.toUpperCase().includes(t) || f.documento.includes(t) || f.municipio.includes(t)) : base;
    // Severos y con más días sin control primero
    return [...filtradas].sort(
      (a, b) =>
        Number(b.severidad === 'SEVERA') - Number(a.severidad === 'SEVERA') ||
        (diasDesde(b.ultimoControl ?? b.fechaNotificacion, fechaCorte) ?? 0) - (diasDesde(a.ultimoControl ?? a.fechaNotificacion, fechaCorte) ?? 0),
    );
  }, [pestana, q, filas, fechaCorte]); // eslint-disable-line react-hooks/exhaustive-deps

  const tarjetas = [
    { t: 'Mis niños', v: filas.length, s: municipio ? `Sede ${municipio}` : 'Asignados a la IPS' },
    { t: 'Activos', v: activos.length, s: 'En tratamiento o sin estado' },
    { t: 'Atención prioritaria', v: prioridad.length, s: 'Sin control o control vencido', alerta: prioridad.length > 0 },
    { t: 'Recuperados', v: filas.filter(f => f.estado === 'RECUPERADO').length, s: 'Egresos exitosos' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {sedes.length > 1 && (
        <div className="tarjeta flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="etiqueta mr-1">Sede / municipio</span>
          {[['', todas.length] as [string, number], ...sedes].map(([nombre, n]) => (
            <button
              key={nombre || 'todas'}
              onClick={() => setMunicipio(nombre)}
              aria-pressed={municipio === nombre}
              className={`rounded-full border px-3 py-1 ${municipio === nombre ? 'border-marca-600 bg-marca-600 font-semibold text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-marca-50'}`}
            >
              {nombre || 'Todas las sedes'} <span className={municipio === nombre ? 'text-white/80' : 'text-slate-400'}>({n})</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map(k => (
          <div key={k.t} className={`tarjeta p-4 ${k.alerta ? 'border-red-200 bg-red-50' : ''}`}>
            <p className="etiqueta">{k.t}</p>
            <p className={`mt-1 text-3xl font-bold ${k.alerta ? 'text-red-700' : 'text-slate-900'}`}>{k.v}</p>
            <p className="text-xs text-slate-500">{k.s}</p>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ['prioridad', `Prioridad (${prioridad.length})`],
                ['activos', `Activos (${activos.length})`],
                ['todos', `Todos (${filas.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPestana(k)}
                className={`rounded-md px-3 py-1.5 ${pestana === k ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input className="input max-w-xs" placeholder="Buscar nombre, documento, municipio…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Niño/a</th>
                <th className="px-3 py-2">Edad</th>
                <th className="px-3 py-2">Municipio</th>
                <th className="px-3 py-2">Severidad</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Último control</th>
                <th className="px-3 py-2">Último Z P/T</th>
                <th className="px-3 py-2">Alertas</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map(f => {
                const d = diasDesde(f.ultimoControl, fechaCorte);
                return (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-medium">{f.nombre}</p>
                      <p className="text-xs text-slate-500">{f.documento} · {f.etnia}</p>
                    </td>
                    <td className="px-3 py-2">{f.edadMeses != null ? `${f.edadMeses} m` : '—'}</td>
                    <td className="px-3 py-2">{f.municipio}</td>
                    <td className="px-3 py-2"><SeveridadBadge severidad={f.severidad} /></td>
                    <td className="px-3 py-2"><EstadoBadge estado={f.estado} /></td>
                    <td className="px-3 py-2">
                      {f.ultimoControl ? (
                        <>
                          {formatoFecha(f.ultimoControl)}
                          <span className={`block text-xs ${d != null && d > 14 ? 'font-semibold text-red-600' : 'text-slate-500'}`}>hace {d} días</span>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-red-600">Sin controles</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{f.ultimoZ?.toFixed(2) ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">{f.alertas.map(a => <AlertaChip key={a} tipo={a} />)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/caso/${encodeURIComponent(f.id)}`} className="boton-sec whitespace-nowrap">Registrar control</Link>
                    </td>
                  </tr>
                );
              })}
              {!visibles.length && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">No hay casos en esta vista.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
