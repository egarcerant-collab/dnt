'use client';

import { useState } from 'react';
import type { Dimension, FilaDistribucion } from '@/lib/dnt/distribucion';

interface Cruce { columnas: string[]; filas: { grupo: string; valores: number[]; total: number }[]; totales: number[] }

const PESTANAS: [Dimension | 'cruce', string][] = [
  ['etnia', 'Pueblo indígena'],
  ['departamento', 'Departamento'],
  ['municipio', 'Municipio'],
  ['sexo', 'Sexo'],
  ['edad', 'Grupo de edad'],
  ['clasificacion', 'Clasificación nutricional'],
  ['cruce', 'Pueblo × departamento'],
];

/** Distribución poblacional de los casos con exportación por grupo (los cálculos vienen del servidor). */
export function PanelDistribucion({
  datos, cruce, filtros, exportarBase, total,
}: {
  datos: Record<Dimension, FilaDistribucion[]>;
  cruce: Cruce;
  /** Parámetro de exportación de cada dimensión (sin parámetro = no se exporta por fila). */
  filtros: Partial<Record<Dimension, string>>;
  exportarBase: string;
  total: number;
}) {
  const [vista, setVista] = useState<Dimension | 'cruce'>('etnia');
  const filas = vista === 'cruce' ? [] : datos[vista];
  const max = Math.max(1, ...filas.map(f => f.casos));
  const sinEtnia = datos.etnia.find(f => f.grupo === 'SIN ETNIA REGISTRADA');
  const url = (grupo: string) => {
    const k = vista !== 'cruce' ? filtros[vista] : undefined;
    return k ? `${exportarBase}${exportarBase.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(grupo)}` : null;
  };

  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Distribución poblacional <span className="text-sm font-normal text-slate-500">({total} niños)</span></h2>
        {sinEtnia && sinEtnia.casos > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-1 text-xs text-amber-900">
            ⚠ {sinEtnia.casos} niños ({sinEtnia.pctTotal}%) sin pueblo indígena registrado: completar en la base para el análisis diferencial.
          </p>
        )}
      </div>
      <nav className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {PESTANAS.map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)} className={`rounded-md px-3 py-1.5 ${vista === k ? 'bg-white font-semibold text-marca-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{t}</button>
        ))}
      </nav>

      {vista === 'cruce' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Pueblo indígena</th>
                {cruce.columnas.map(c => <th key={c} className="px-3 py-2 text-right">{c}</th>)}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cruce.filas.map(f => (
                <tr key={f.grupo} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{f.grupo}</td>
                  {f.valores.map((v, i) => {
                    // Intensidad de color según el peso de la celda en la fila
                    const a = f.total ? v / f.total : 0;
                    return (
                      <td key={i} className="px-3 py-2 text-right" style={{ background: v ? `rgba(23, 74, 153, ${0.08 + a * 0.45})` : undefined, color: a > 0.6 ? 'white' : undefined }}>
                        {v || '·'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold">{f.total}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-semibold">
                <td className="px-3 py-2">Total</td>
                {cruce.totales.map((t, i) => <td key={i} className="px-3 py-2 text-right">{t}</td>)}
                <td className="px-3 py-2 text-right">{cruce.totales.reduce((a, b) => a + b, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">{PESTANAS.find(p => p[0] === vista)?.[1]}</th>
                <th className="px-3 py-2">Casos</th>
                <th className="px-3 py-2 text-right">Activos</th>
                <th className="px-3 py-2 text-right">Recuperados</th>
                <th className="px-3 py-2 text-right">Recuperación (≥75%)</th>
                <th className="px-3 py-2 text-right">Severos</th>
                <th className="px-3 py-2 text-right">Sin control &gt; 4 sem</th>
                <th className="px-3 py-2 text-right">Sin estado</th>
                <th className="px-3 py-2 text-right">Fallecidos</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map(f => {
                const u = url(f.grupo);
                return (
                  <tr key={f.grupo} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{f.grupo}</td>
                    <td className="min-w-44 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-marca-600" style={{ width: `${(f.casos / max) * 100}%` }} /></div>
                        <span className="w-20 text-right"><b>{f.casos}</b> <span className="text-xs text-slate-500">({f.pctTotal}%)</span></span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{f.activos}</td>
                    <td className="px-3 py-2 text-right">{f.recuperados}</td>
                    <td className="px-3 py-2 text-right" title={`${f.recNum} recuperados / ${f.recDen} casos sin descartados`}>
                      {f.recPct == null ? '—' : (
                        <>
                          <span className={`font-semibold ${f.recPct >= 75 ? 'text-marca-700' : 'text-red-600'}`}>{f.recPct}%</span>
                          <span className="block text-[11px] text-slate-500">{f.recNum} / {f.recDen}</span>
                        </>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right ${f.severos ? 'font-semibold text-red-700' : ''}`}>{f.severos}</td>
                    <td className={`px-3 py-2 text-right ${f.sinControl ? 'font-semibold text-red-600' : ''}`}>{f.sinControl}</td>
                    <td className={`px-3 py-2 text-right ${f.sinEstado ? 'text-amber-700' : ''}`}>{f.sinEstado}</td>
                    <td className={`px-3 py-2 text-right ${f.fallecidos ? 'font-semibold text-red-700' : ''}`}>{f.fallecidos}</td>
                    <td className="px-3 py-2">
                      {u && <a href={u} download className="text-xs text-marca-700 hover:underline" title="Exportar estos casos a Excel">Excel</a>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
