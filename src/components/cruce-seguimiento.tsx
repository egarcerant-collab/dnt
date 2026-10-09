'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { clave, leerArchivo, type NinoArchivo } from '@/lib/dnt/cruce';

/**
 * Cruce de una base externa de seguimiento DNT (p. ej. el reporte SeguimientoDNT del INS/MinSalud)
 * contra los niños de Nutria. El archivo se lee en el navegador: no se sube al servidor.
 * Clave del cruce: número de identificación (columna NroIdentificacion, o la H si no hay encabezado).
 */

interface CasoBase { id: string; tipo: string; documento: string; nombre: string; departamento: string; municipio: string; ips: string; notificacion: string | null }

function descargarCsv(nombre: string, encabezado: string[], filas: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = '﻿' + [encabezado, ...filas].map(f => f.map(esc).join(';')).join('\r\n'); // BOM + ';' para Excel en español
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

const anio = (f: string) => f.slice(0, 4) || 'Sin fecha';
const dmy = (f: string | null) => (f ? f.split('-').reverse().join('/') : '—');

export function CruceSeguimiento() {
  const [estado, setEstado] = useState<'inicio' | 'leyendo' | 'listo'>('inicio');
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState('');
  const [datos, setDatos] = useState<{ ninos: NinoArchivo[]; totalFilas: number; base: CasoBase[] } | null>(null);
  const [vista, setVista] = useState<'faltan' | 'sobran' | 'coinciden'>('faltan');
  const [filtroAnio, setFiltroAnio] = useState('Todos');
  const [filtroDepto, setFiltroDepto] = useState('Todos');
  const [buscar, setBuscar] = useState('');

  async function procesar(f: File) {
    setEstado('leyendo');
    setError('');
    setArchivo(f.name);
    try {
      if (f.size > 40 * 1024 * 1024) throw new Error('El archivo supera 40 MB');
      const [XLSX, res] = await Promise.all([import('xlsx'), fetch('/api/cruce/base', { cache: 'no-store' })]);
      if (!res.ok) throw new Error('No se pudo leer la base de Nutria (¿sesión vencida?)');
      const base = (await res.json()) as CasoBase[];
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      // Hoja con más filas
      const hoja = wb.SheetNames.map(n => wb.Sheets[n]).sort((a, b) => XLSX.utils.decode_range(b['!ref'] ?? 'A1').e.r - XLSX.utils.decode_range(a['!ref'] ?? 'A1').e.r)[0];
      const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null, raw: true });
      const { ninos, totalFilas } = leerArchivo(filas);
      if (!ninos.size) throw new Error('No se encontraron números de identificación en el archivo (columna NroIdentificacion o H)');
      setDatos({ ninos: [...ninos.values()], totalFilas, base });
      setFiltroAnio(String(new Date().getFullYear()));
      setFiltroDepto('Todos');
      setVista('faltan');
      setEstado('listo');
    } catch (e) {
      setError((e as Error).message);
      setEstado('inicio');
    }
  }

  const r = useMemo(() => {
    if (!datos) return null;
    const enBase = new Map(datos.base.map(c => [clave(c.documento), c]));
    const enArchivo = new Set(datos.ninos.map(n => n.clave));
    const faltan = datos.ninos.filter(n => !enBase.has(n.clave));
    const coinciden = datos.ninos.filter(n => enBase.has(n.clave));
    const sobran = datos.base.filter(c => !enArchivo.has(clave(c.documento)));
    const anios = [...new Set(datos.ninos.map(n => anio(n.fecha)))].sort().reverse();
    const deptos = [...new Set(datos.ninos.map(n => n.departamento).filter(Boolean))].sort();
    const porAnio = (l: NinoArchivo[]) => anios.map(a => [a, l.filter(n => anio(n.fecha) === a).length] as const);
    return { enBase, faltan, coinciden, sobran, anios, deptos, faltanPorAnio: porAnio(faltan), unicosPorAnio: porAnio(datos.ninos) };
  }, [datos]);

  const filtrar = (l: NinoArchivo[]) => {
    const q = clave(buscar);
    return l
      .filter(n => filtroAnio === 'Todos' || anio(n.fecha) === filtroAnio)
      .filter(n => filtroDepto === 'Todos' || n.departamento === filtroDepto)
      .filter(n => !q || n.clave.includes(q) || clave(n.nombre).includes(q))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  };

  const ENC_ARCHIVO = ['Tipo ID', 'Documento', 'Nombre', 'Departamento', 'Municipio', 'UPGD', 'Consulta más reciente', 'Registros en el archivo', 'Estado vital', 'Fuente'];
  const filaArchivo = (n: NinoArchivo) => [n.tipo, n.documento, n.nombre, n.departamento, n.municipio, n.upgd, dmy(n.fecha), n.registros, n.estadoVital, n.fuente];

  return (
    <div className="flex flex-col gap-5">
      <section className="tarjeta flex flex-col gap-3 p-5">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Base externa de seguimiento (Excel .xlsx / .xls / .csv)</span>
          <input type="file" accept=".xlsx,.xls,.csv" disabled={estado === 'leyendo'}
            onChange={e => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ''; }}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-marca-700" />
        </label>
        <p className="text-xs text-slate-500">
          Se cruza por número de identificación (columna <b>NroIdentificacion</b>, o la columna <b>H</b>). Los registros repetidos del mismo niño se
          cuentan una sola vez. El archivo se procesa en tu navegador: no se sube ni se guarda en el servidor.
        </p>
        {estado === 'leyendo' && <p className="text-sm text-marca-700">Leyendo {archivo}…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {datos && r && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Registros en el archivo', datos.totalFilas, 'filas con identificación'],
              ['Niños únicos', datos.ninos.length, 'después de quitar repetidos'],
              ['Ya están en Nutria', r.coinciden.length, `de ${datos.base.length} niños en Nutria`],
              ['Faltan en Nutria', r.faltan.length, 'están en el archivo, no en Nutria'],
              ['Solo en Nutria', r.sobran.length, 'no aparecen en el archivo'],
            ].map(([t, v, d]) => (
              <div key={t} className="tarjeta p-4">
                <p className="text-xs uppercase text-slate-500">{t}</p>
                <p className={`text-3xl font-bold ${t === 'Faltan en Nutria' ? 'text-red-600' : 'text-marca-800'}`}>{Number(v).toLocaleString('es-CO')}</p>
                <p className="text-xs text-slate-500">{d}</p>
              </div>
            ))}
          </section>

          <section className="tarjeta overflow-x-auto p-4">
            <h2 className="mb-2 font-semibold">Niños únicos por año de la consulta más reciente</h2>
            <table className="text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="pr-6">Año</th><th className="pr-6">Únicos en el archivo</th><th className="pr-6">Ya en Nutria</th><th>Faltan en Nutria</th></tr>
              </thead>
              <tbody>
                {r.unicosPorAnio.map(([a, n], i) => (
                  <tr key={a} className="border-t border-slate-100">
                    <td className="py-1 pr-6 font-medium">{a}</td><td className="pr-6">{n}</td><td className="pr-6">{n - r.faltanPorAnio[i][1]}</td>
                    <td className="font-semibold text-red-600">{r.faltanPorAnio[i][1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Nutria trabaja con la base de seguimiento vigente: para saber qué falta cargar, revise sobre todo el año en curso.</p>
          </section>

          <section className="tarjeta flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {([['faltan', `Faltan en Nutria (${r.faltan.length})`], ['sobran', `Solo en Nutria (${r.sobran.length})`], ['coinciden', `Coinciden (${r.coinciden.length})`]] as const).map(([k, t]) => (
                <button key={k} onClick={() => setVista(k)} className={`rounded-full px-4 py-1.5 text-sm ${vista === k ? 'bg-marca-700 text-white' : 'border border-slate-300 hover:bg-slate-50'}`}>{t}</button>
              ))}
            </div>

            {vista !== 'sobran' && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">Año
                  <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1">
                    <option>Todos</option>{r.anios.map(a => <option key={a}>{a}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">Departamento
                  <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1">
                    <option>Todos</option>{r.deptos.map(d => <option key={d}>{d}</option>)}
                  </select>
                </label>
                <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar documento o nombre" className="rounded-lg border border-slate-300 px-3 py-1" />
              </div>
            )}

            {vista === 'sobran' ? (
              <TablaBase casos={r.sobran} onCsv={() => descargarCsv(`solo_en_nutria_${new Date().toISOString().slice(0, 10)}.csv`,
                ['Tipo ID', 'Documento', 'Nombre', 'Departamento', 'Municipio', 'IPS seguimiento', 'Notificación'],
                r.sobran.map(c => [c.tipo, c.documento, c.nombre, c.departamento, c.municipio, c.ips, dmy(c.notificacion)]))} />
            ) : (
              (() => {
                const lista = filtrar(vista === 'faltan' ? r.faltan : r.coinciden);
                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-600"><b>{lista.length}</b> niños con los filtros actuales</p>
                      <button className="boton-sec" onClick={() => descargarCsv(`${vista === 'faltan' ? 'faltan_en_nutria' : 'coinciden'}_${filtroAnio}_${new Date().toISOString().slice(0, 10)}.csv`,
                        vista === 'coinciden' ? [...ENC_ARCHIVO, 'IPS en Nutria'] : ENC_ARCHIVO,
                        lista.map(n => (vista === 'coinciden' ? [...filaArchivo(n), r.enBase.get(n.clave)?.ips ?? ''] : filaArchivo(n))))}>
                        Descargar Excel (CSV)
                      </button>
                    </div>
                    <div className="max-h-[60vh] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-marca-50 text-left text-xs uppercase text-marca-900">
                          <tr>
                            <th className="px-2 py-2">Documento</th><th className="px-2 py-2">Nombre</th><th className="px-2 py-2">Municipio</th>
                            <th className="px-2 py-2">UPGD</th><th className="px-2 py-2">Consulta más reciente</th><th className="px-2 py-2">Registros</th>
                            <th className="px-2 py-2">Estado vital</th>{vista === 'coinciden' && <th className="px-2 py-2">En Nutria</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lista.slice(0, 1000).map(n => (
                            <tr key={n.clave}>
                              <td className="px-2 py-1.5 whitespace-nowrap">{n.tipo} {n.documento}</td>
                              <td className="px-2 py-1.5">{n.nombre}</td>
                              <td className="px-2 py-1.5 text-xs">{n.municipio}<br /><span className="text-slate-500">{n.departamento}</span></td>
                              <td className="px-2 py-1.5 text-xs">{n.upgd}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{dmy(n.fecha)}</td>
                              <td className="px-2 py-1.5 text-center">{n.registros}</td>
                              <td className={`px-2 py-1.5 ${/FALLEC/i.test(n.estadoVital) ? 'font-semibold text-red-600' : ''}`}>{n.estadoVital || '—'}</td>
                              {vista === 'coinciden' && (
                                <td className="px-2 py-1.5">
                                  <Link className="text-marca-700 hover:underline" href={`/caso/${encodeURIComponent(r.enBase.get(n.clave)!.id)}`}>Ver caso</Link>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {lista.length > 1000 && <p className="p-2 text-xs text-slate-500">Se muestran 1.000 de {lista.length}. Descarga el Excel para verlos todos.</p>}
                    </div>
                  </>
                );
              })()
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TablaBase({ casos, onCsv }: { casos: CasoBase[]; onCsv: () => void }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Niños que están en Nutria pero <b>no aparecen</b> en el archivo cargado (revisar documento o notificación).</p>
        <button className="boton-sec" onClick={onCsv}>Descargar Excel (CSV)</button>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-marca-50 text-left text-xs uppercase text-marca-900">
            <tr><th className="px-2 py-2">Documento</th><th className="px-2 py-2">Nombre</th><th className="px-2 py-2">Municipio</th><th className="px-2 py-2">IPS</th><th className="px-2 py-2">Notificación</th><th className="px-2 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {casos.map(c => (
              <tr key={c.id}>
                <td className="px-2 py-1.5 whitespace-nowrap">{c.tipo} {c.documento}</td>
                <td className="px-2 py-1.5">{c.nombre}</td>
                <td className="px-2 py-1.5 text-xs">{c.municipio}<br /><span className="text-slate-500">{c.departamento}</span></td>
                <td className="px-2 py-1.5 text-xs">{c.ips}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{dmy(c.notificacion)}</td>
                <td className="px-2 py-1.5"><Link className="text-marca-700 hover:underline" href={`/caso/${encodeURIComponent(c.id)}`}>Ver caso</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
