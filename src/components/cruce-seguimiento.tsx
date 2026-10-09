'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { clave, leerArchivo, sinSeguimiento, type NinoArchivo } from '@/lib/dnt/cruce';

/**
 * Cruce de una base externa de seguimiento DNT (p. ej. el reporte SeguimientoDNT del INS/MinSalud)
 * contra los niños de Nutria. El archivo se lee en el navegador: no se sube al servidor.
 * Clave del cruce: número de identificación (columna NroIdentificacion, o la H si no hay encabezado).
 */

interface CasoBase { id: string; tipo: string; documento: string; nombre: string; departamento: string; municipio: string; ips: string; notificacion: string | null }

interface EstadoPreCruce {
  registros: Record<string, { estado: 'pendiente' | 'verificado' | 'descartado' | 'incorporado'; ips: string; casoId: string }>;
  cargues: number;
  ultimoCargue: { id: string; fecha: string; por: string; nuevos: number } | null;
}

const COLOR_PRE = { pendiente: 'bg-amber-100 text-amber-800', verificado: 'bg-marca-100 text-marca-800', descartado: 'bg-slate-200 text-slate-600', incorporado: 'bg-green-100 text-green-800' };

function EstadoPreregistro({ e, enNutria, onIr }: { e?: keyof typeof COLOR_PRE; enNutria: boolean; onIr: () => void }) {
  if (e) return <button type="button" onClick={onIr} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_PRE[e]}`}>{e[0].toUpperCase() + e.slice(1)}</button>;
  return <span className="text-xs text-slate-400">{enNutria ? '—' : 'No registrado'}</span>;
}

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

/** onIrPre: cambia a la pestaña Pre-registro; onCargue: refresca sus datos tras registrar un cargue. */
export function CruceSeguimiento({ onIrPre, onCargue }: { onIrPre: () => void; onCargue: () => void }) {
  const [estado, setEstado] = useState<'inicio' | 'leyendo' | 'listo'>('inicio');
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState('');
  const [datos, setDatos] = useState<{ ninos: NinoArchivo[]; totalFilas: number; base: CasoBase[] } | null>(null);
  const [vista, setVista] = useState<'faltan' | 'sobran' | 'coinciden' | 'todos'>('faltan');
  const [filtroAnio, setFiltroAnio] = useState('Todos');
  const [filtroDepto, setFiltroDepto] = useState('Todos');
  const [buscar, setBuscar] = useState('');
  const [filtroSeg, setFiltroSeg] = useState<'Todos' | 'con' | 'sin'>('Todos');
  const [cargue, setCargue] = useState<{ ok: boolean; t: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pre, setPre] = useState<EstadoPreCruce>({ registros: {}, cargues: 0, ultimoCargue: null });
  const [filtroPre, setFiltroPre] = useState<'Todos' | 'no' | 'pendiente' | 'verificado' | 'descartado' | 'incorporado'>('Todos');

  async function cargarPre() {
    const res = await fetch('/api/preregistro', { cache: 'no-store' });
    if (res.ok) setPre(await res.json());
  }

  /** Registra el cargue: los niños listados que faltan en Nutria pasan al pre-registro (no a la base). */
  async function registrarCargue(lista: NinoArchivo[], enBase: Map<string, unknown>) {
    const faltantes = lista.filter(n => !enBase.has(n.clave));
    if (!faltantes.length) return setCargue({ ok: false, t: 'En el listado actual no hay niños que falten en Nutria.' });
    const criterio = [`Año ${filtroAnio}`, `Departamento ${filtroDepto}`, `Seguimiento ${filtroSeg === 'sin' ? 'sin seguimiento' : filtroSeg === 'con' ? 'con seguimiento' : 'todos'}`, buscar && `Búsqueda ${buscar}`].filter(Boolean).join(' · ');
    if (!confirm(`Se registrará un cargue con ${faltantes.length} niño(s) que faltan en Nutria (${criterio}).

Quedan en Pre-registro para verificarlos; la base de Nutria no se modifica. ¿Continuar?`)) return;
    setEnviando(true);
    setCargue(null);
    try {
      const res = await fetch('/api/preregistro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archivo, criterio, totalFilas: datos?.totalFilas ?? 0, unicos: datos?.ninos.length ?? 0,
          ninos: faltantes.map(n => ({ clave: n.clave, documento: n.documento, tipo: n.tipo, nombre: n.nombre, departamento: n.departamento, municipio: n.municipio, upgd: n.upgd, fecha: n.fecha, clasificacion: n.clasificacion, sinSeguimiento: sinSeguimiento(n, filtroAnio), registros: n.registros, datos: n.datos })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'No se pudo registrar el cargue');
      await cargarPre();
      onCargue();
      setCargue({ ok: true, t: `Cargue ${d.id} registrado: ${d.nuevos} nuevos y ${d.actualizados} actualizados en Pre-registro${d.yaEnNutria ? ` (${d.yaEnNutria} ya estaban en Nutria)` : ''}.` });
    } catch (e) {
      setCargue({ ok: false, t: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  async function procesar(f: File) {
    setEstado('leyendo');
    setError('');
    setArchivo(f.name);
    try {
      if (f.size > 40 * 1024 * 1024) throw new Error('El archivo supera 40 MB');
      const [XLSX, res] = await Promise.all([import('xlsx'), fetch('/api/cruce/base', { cache: 'no-store' }), cargarPre()]);
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
    const sinSeg = datos.ninos.filter(n => sinSeguimiento(n));
    return {
      enBase, faltan, coinciden, sobran, anios, deptos, sinSeg,
      filasSinSeg: datos.ninos.reduce((t, n) => t + n.registros - n.seguimientos, 0),
      sinSegEnAnio: (a: string) => datos.ninos.filter(n => sinSeguimiento(n, a)),
      faltanPorAnio: porAnio(faltan), unicosPorAnio: porAnio(datos.ninos),
      sinSegPorAnio: anios.map(a => [a, datos.ninos.filter(n => sinSeguimiento(n, a)).length] as const),
    };
  }, [datos]);

  const filtrar = (l: NinoArchivo[]) => {
    const q = clave(buscar);
    return l
      .filter(n => filtroAnio === 'Todos' || anio(n.fecha) === filtroAnio)
      .filter(n => filtroDepto === 'Todos' || n.departamento === filtroDepto)
      .filter(n => filtroSeg === 'Todos' || (filtroSeg === 'sin') === sinSeguimiento(n, filtroAnio))
      .filter(n => filtroPre === 'Todos' || (filtroPre === 'no' ? !pre.registros[n.clave] : pre.registros[n.clave]?.estado === filtroPre))
      .filter(n => !q || n.clave.includes(q) || clave(n.nombre).includes(q))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  };

  const ENC_ARCHIVO = ['Tipo ID', 'Documento', 'Nombre', 'Departamento', 'Municipio', 'UPGD', 'Fecha más reciente (consulta / registro)', 'Registros en el archivo', 'Seguimientos (con clasificación)', 'Última clasificación nutricional', 'Notificación sin seguimiento (año)', 'Estado vital', 'Fuente', 'Pre-registro'];
  const filaArchivo = (n: NinoArchivo) => [n.tipo, n.documento, n.nombre, n.departamento, n.municipio, n.upgd, dmy(n.fecha), n.registros, n.seguimientos, n.clasificacion || 'SIN SEGUIMIENTO', n.aniosSinSeguimiento.join(', '), n.estadoVital, n.fuente, pre.registros[n.clave]?.estado ?? ''];

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
          <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {[
              ['Registros en el archivo', datos.totalFilas, 'filas con identificación'],
              ['Niños únicos', datos.ninos.length, 'después de quitar repetidos'],
              ['Ya están en Nutria', r.coinciden.length, `de ${datos.base.length} niños en Nutria`],
              ['Faltan en Nutria', r.faltan.length, 'están en el archivo, no en Nutria'],
              ['Solo en Nutria', r.sobran.length, 'no aparecen en el archivo'],
              ['En pre-registro', r.faltan.filter(n => pre.registros[n.clave]).length, `de los que faltan · ${r.faltan.filter(n => pre.registros[n.clave]?.estado === 'verificado').length} verificados`],
              ['Sin seguimiento', r.sinSeg.length, `niños con clasificación nutricional (BF) vacía · ${r.filasSinSeg} registros`],
            ].map(([t, v, d]) => (
              <div key={t} className="tarjeta p-4">
                <p className="text-xs uppercase text-slate-500">{t}</p>
                <p className={`text-3xl font-bold ${t === 'Faltan en Nutria' ? 'text-red-600' : t === 'Sin seguimiento' ? 'text-amber-600' : 'text-marca-800'}`}>{Number(v).toLocaleString('es-CO')}</p>
                <p className="text-xs text-slate-500">{d}</p>
              </div>
            ))}
          </section>

          {(() => {
            // Conexión con Pre-registro: faltantes del año y departamento seleccionados
            const delFiltro = r.faltan.filter(n => (filtroAnio === 'Todos' || anio(n.fecha) === filtroAnio) && (filtroDepto === 'Todos' || n.departamento === filtroDepto));
            const sinRegistrar = delFiltro.filter(n => !pre.registros[n.clave]);
            return (
              <section className="tarjeta flex flex-wrap items-center justify-between gap-3 border-l-4 border-marca-600 p-4">
                <div className="text-sm">
                  <p className="font-semibold text-marca-900">
                    Pre-registro · {filtroAnio === 'Todos' ? 'todos los años' : filtroAnio}{filtroDepto !== 'Todos' ? ` · ${filtroDepto}` : ''}
                  </p>
                  <p className="text-slate-600">
                    Faltan en Nutria <b>{delFiltro.length}</b> · ya en pre-registro <b>{delFiltro.length - sinRegistrar.length}</b> · sin registrar{' '}
                    <b className={sinRegistrar.length ? 'text-red-600' : ''}>{sinRegistrar.length}</b>
                    {pre.ultimoCargue && (
                      <span className="text-slate-500"> · último cargue {pre.ultimoCargue.id} ({new Date(pre.ultimoCargue.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}, {pre.ultimoCargue.por})</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sinRegistrar.length > 0 && (
                    <button className="boton" disabled={enviando} onClick={() => registrarCargue(sinRegistrar, r.enBase)}>
                      {enviando ? 'Registrando…' : `Registrar cargue de los ${sinRegistrar.length} sin registrar`}
                    </button>
                  )}
                  <button type="button" onClick={onIrPre} className="boton-sec">Ir a Pre-registro →</button>
                </div>
                {cargue && <p className={`w-full text-sm ${cargue.ok ? 'text-marca-700' : 'text-red-600'}`}>{cargue.t}</p>}
              </section>
            );
          })()}

          <section className="tarjeta grid gap-6 overflow-x-auto p-4 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 font-semibold">Niños únicos por año</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr><th className="pr-4">Año</th><th className="pr-4">Únicos en el archivo</th><th className="pr-4">Ya en Nutria</th><th className="pr-4">Faltan en Nutria</th><th>Sin seguimiento</th></tr>
                </thead>
                <tbody>
                  {r.unicosPorAnio.map(([a, n], i) => (
                    <tr key={a} onClick={() => setFiltroAnio(a)} title="Ver este año"
                      className={`cursor-pointer border-t border-slate-100 hover:bg-marca-50 ${filtroAnio === a ? 'bg-marca-50 ring-1 ring-inset ring-marca-300' : ''}`}>
                      <td className="py-1 pr-4 font-medium">{a}</td><td className="pr-4">{n}</td><td className="pr-4">{n - r.faltanPorAnio[i][1]}</td>
                      <td className="pr-4 font-semibold text-red-600">{r.faltanPorAnio[i][1]}</td>
                      <td className="font-semibold text-amber-600">{r.sinSegPorAnio[i][1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                Nutria trabaja con la base de seguimiento vigente: para saber qué falta cargar, revise sobre todo el año en curso. Haga clic en un año para ver su detalle.
              </p>
            </div>

            <div>
              <h2 className="mb-2 font-semibold">
                Por departamento de residencia {filtroAnio === 'Todos' ? '(todos los años)' : `· ${filtroAnio}`}
              </h2>
              {(() => {
                // Columna AE (NomDeptoDistritoResidencia) del archivo
                const delAnio = datos.ninos.filter(n => filtroAnio === 'Todos' || anio(n.fecha) === filtroAnio);
                const filas = [...new Set(delAnio.map(n => n.departamento || 'Sin departamento'))]
                  .map(d => {
                    const l = delAnio.filter(n => (n.departamento || 'Sin departamento') === d);
                    const faltan = l.filter(n => !r.enBase.has(n.clave)).length;
                    return { d, unicos: l.length, enNutria: l.length - faltan, faltan, sinSeg: datos.ninos.filter(n => (n.departamento || 'Sin departamento') === d && sinSeguimiento(n, filtroAnio)).length };
                  })
                  .sort((a, b) => b.unicos - a.unicos);
                const total = filas.reduce((s, f) => ({ unicos: s.unicos + f.unicos, enNutria: s.enNutria + f.enNutria, faltan: s.faltan + f.faltan, sinSeg: s.sinSeg + f.sinSeg }), { unicos: 0, enNutria: 0, faltan: 0, sinSeg: 0 });
                return (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-slate-500">
                      <tr><th className="pr-4">Departamento</th><th className="pr-4">Únicos</th><th className="pr-4">Ya en Nutria</th><th className="pr-4">Faltan</th><th className="pr-4">Sin seguim.</th><th>% cobertura</th></tr>
                    </thead>
                    <tbody>
                      {filas.map(f => (
                        <tr key={f.d} onClick={() => setFiltroDepto(filtroDepto === f.d ? 'Todos' : f.d)} title="Filtrar el listado por este departamento"
                          className={`cursor-pointer border-t border-slate-100 hover:bg-marca-50 ${filtroDepto === f.d ? 'bg-marca-50 ring-1 ring-inset ring-marca-300' : ''}`}>
                          <td className="py-1 pr-4 font-medium">{f.d}</td>
                          <td className="pr-4">{f.unicos}</td>
                          <td className="pr-4">{f.enNutria}</td>
                          <td className="pr-4 font-semibold text-red-600">{f.faltan}</td>
                          <td className="pr-4 font-semibold text-amber-600">{f.sinSeg}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                <div className="h-full bg-marca-600" style={{ width: `${f.unicos ? (f.enNutria / f.unicos) * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs">{f.unicos ? Math.round((f.enNutria / f.unicos) * 100) : 0}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300 font-semibold">
                        <td className="py-1 pr-4">Total</td><td className="pr-4">{total.unicos}</td><td className="pr-4">{total.enNutria}</td>
                        <td className="pr-4 text-red-600">{total.faltan}</td>
                        <td className="pr-4 text-amber-600">{total.sinSeg}</td>
                        <td className="text-xs">{total.unicos ? Math.round((total.enNutria / total.unicos) * 100) : 0}%</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
              <p className="mt-2 text-xs text-slate-500">Clasificación por la columna AE (departamento de residencia). Haga clic en un departamento para filtrar el listado de abajo.</p>
            </div>
          </section>

          <section className="tarjeta flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {([['faltan', `Faltan en Nutria (${r.faltan.length})`], ['sobran', `Solo en Nutria (${r.sobran.length})`], ['coinciden', `Coinciden (${r.coinciden.length})`], ['todos', `Todos los del archivo (${datos.ninos.length})`]] as const).map(([k, t]) => (
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
                <label className="flex items-center gap-2">Pre-registro
                  <select value={filtroPre} onChange={e => setFiltroPre(e.target.value as typeof filtroPre)} className="rounded-lg border border-slate-300 px-2 py-1">
                    <option value="Todos">Todos</option>
                    <option value="no">No registrados</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="verificado">Verificados</option>
                    <option value="descartado">Descartados</option>
                    <option value="incorporado">Incorporados</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">Seguimiento
                  <select value={filtroSeg} onChange={e => setFiltroSeg(e.target.value as 'Todos' | 'con' | 'sin')} className="rounded-lg border border-slate-300 px-2 py-1">
                    <option value="Todos">Todos</option>
                    <option value="con">Con seguimiento</option>
                    <option value="sin">Sin seguimiento (clasificación vacía)</option>
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
                const lista = filtrar(vista === 'faltan' ? r.faltan : vista === 'coinciden' ? r.coinciden : datos.ninos);
                const conNutria = vista !== 'faltan';
                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-600"><b>{lista.length}</b> niños con los filtros actuales</p>
                      <div className="flex flex-wrap items-center gap-2">
                      {vista !== 'coinciden' && (
                        <button className="boton" disabled={enviando} onClick={() => registrarCargue(lista, r.enBase)}>
                          {enviando ? 'Registrando…' : `Registrar cargue en Pre-registro (${lista.filter(n => !r.enBase.has(n.clave)).length})`}
                        </button>
                      )}
                      <button className="boton-sec" onClick={() => descargarCsv(`${vista === 'faltan' ? 'faltan_en_nutria' : vista === 'coinciden' ? 'coinciden' : 'todos_archivo'}_${filtroAnio}_${new Date().toISOString().slice(0, 10)}.csv`,
                        conNutria ? [...ENC_ARCHIVO, 'Está en Nutria', 'IPS en Nutria'] : ENC_ARCHIVO,
                        lista.map(n => (conNutria ? [...filaArchivo(n), r.enBase.has(n.clave) ? 'SI' : 'NO', r.enBase.get(n.clave)?.ips ?? ''] : filaArchivo(n))))}>
                        Descargar Excel (CSV)
                      </button>
                      </div>
                    </div>
                    {cargue && (
                      <p className={`text-sm ${cargue.ok ? 'text-marca-700' : 'text-red-600'}`}>
                        {cargue.t} {cargue.ok && <button type="button" onClick={onIrPre} className="font-semibold underline">Ir a Pre-registro →</button>}
                      </p>
                    )}
                    <div className="max-h-[60vh] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-marca-50 text-left text-xs uppercase text-marca-900">
                          <tr>
                            <th className="px-2 py-2">Documento</th><th className="px-2 py-2">Nombre</th><th className="px-2 py-2">Municipio</th>
                            <th className="px-2 py-2">UPGD</th><th className="px-2 py-2">Fecha más reciente</th><th className="px-2 py-2">Registros</th><th className="px-2 py-2">Seguim.</th><th className="px-2 py-2">Última clasificación</th>
                            <th className="px-2 py-2">Estado vital</th><th className="px-2 py-2">Pre-registro</th>{conNutria && <th className="px-2 py-2">En Nutria</th>}
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
                              <td className="px-2 py-1.5 text-center">{n.seguimientos}</td>
                              <td className="px-2 py-1.5 text-xs">
                                {sinSeguimiento(n, filtroAnio) && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                    Sin seguimiento {n.aniosSinSeguimiento.join(', ')}
                                  </span>
                                )}
                                {n.clasificacion && <span className="block">{sinSeguimiento(n, filtroAnio) ? `Otro registro: ${n.clasificacion}` : n.clasificacion}</span>}
                              </td>
                              <td className={`px-2 py-1.5 ${/FALLEC/i.test(n.estadoVital) ? 'font-semibold text-red-600' : ''}`}>{n.estadoVital || '—'}</td>
                              <td className="px-2 py-1.5"><EstadoPreregistro e={pre.registros[n.clave]?.estado} enNutria={r.enBase.has(n.clave)} onIr={onIrPre} /></td>
                              {conNutria && (
                                <td className="px-2 py-1.5">
                                  {r.enBase.has(n.clave) ? (
                                    <Link className="text-marca-700 hover:underline" href={`/caso/${encodeURIComponent(r.enBase.get(n.clave)!.id)}`}>Ver caso</Link>
                                  ) : (
                                    <span className="text-xs font-semibold text-red-600">No está</span>
                                  )}
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
