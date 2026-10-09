'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { accionIncorporarPre, accionVerificarPre, type EstadoAccion } from '@/app/acciones';
import type { Cargue, EstadoPre, Preregistro } from '@/lib/dnt/preregistro';

const ETIQUETA: Record<EstadoPre, { t: string; c: string }> = {
  pendiente: { t: 'Pendiente', c: 'bg-amber-100 text-amber-800' },
  verificado: { t: 'Verificado', c: 'bg-marca-100 text-marca-800' },
  descartado: { t: 'Descartado', c: 'bg-slate-200 text-slate-600' },
  incorporado: { t: 'Incorporado', c: 'bg-green-100 text-green-800' },
};
const dmy = (f: string) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '—');
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
const campo = 'rounded-lg border border-slate-300 px-2 py-1 text-sm';

function Fila({ r, ips }: { r: Preregistro; ips: string[] }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(accionVerificarPre, null);
  const [abierto, setAbierto] = useState(false);
  // IPS sugerida: la UPGD que notificó, si coincide con una IPS de la red
  const sugerida = r.ipsSeguimiento ?? ips.find(i => i === r.upgd.toUpperCase()) ?? '';
  const cerrado = r.estado === 'incorporado';

  return (
    <>
      <tr className="align-top">
        <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ETIQUETA[r.estado].c}`}>{ETIQUETA[r.estado].t}</span></td>
        <td className="px-2 py-2 whitespace-nowrap">{r.tipo} {r.documento}</td>
        <td className="px-2 py-2">
          <b>{r.nombre}</b>
          <span className="block text-xs text-slate-500">{r.municipio}, {r.departamento}</span>
        </td>
        <td className="px-2 py-2 text-xs">{r.upgd}</td>
        <td className="px-2 py-2 whitespace-nowrap">{dmy(r.fecha)}</td>
        <td className="px-2 py-2 text-xs">
          {r.sinSeguimiento ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Sin seguimiento</span> : r.clasificacion}
        </td>
        <td className="px-2 py-2">
          {cerrado ? (
            <Link href={`/caso/${encodeURIComponent(r.casoId ?? '')}`} className="text-sm text-marca-700 hover:underline">Ver caso en Nutria</Link>
          ) : (
            <form action={accion} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="clave" value={r.clave} />
              <select name="ips" defaultValue={sugerida} className={`${campo} w-52`} aria-label="IPS de seguimiento">
                <option value="">— IPS de seguimiento —</option>
                {ips.map(i => <option key={i}>{i}</option>)}
              </select>
              <input name="nota" defaultValue={r.nota ?? ''} placeholder="Nota / motivo" className={`${campo} w-40`} />
              {r.estado !== 'verificado' && <button name="decision" value="verificar" className="boton px-2 py-1 text-xs" disabled={enviando}>Verificar</button>}
              {r.estado === 'verificado' && <button name="decision" value="verificar" className="boton-sec px-2 py-1 text-xs" disabled={enviando}>Actualizar</button>}
              {r.estado !== 'descartado' && <button name="decision" value="descartar" className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50" disabled={enviando}>Descartar</button>}
              {r.estado !== 'pendiente' && <button name="decision" value="reabrir" className="boton-sec px-2 py-1 text-xs" disabled={enviando}>Pendiente</button>}
            </form>
          )}
          {estado && !estado.ok && <p className="text-xs text-red-600">{estado.mensaje}</p>}
        </td>
        <td className="px-2 py-2">
          <button type="button" onClick={() => setAbierto(!abierto)} className="text-xs text-marca-700 hover:underline">{abierto ? 'Ocultar' : 'Ver datos'}</button>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-3 py-3">
            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(r.datos).map(([k, v]) => (
                <div key={k} className="flex gap-2"><span className="text-slate-500">{k}:</span><span className="font-medium">{v}</span></div>
              ))}
            </div>
            <ul className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">
              {r.historial.map((h, i) => <li key={i}>{fechaHora(h.fecha)} · <b>{h.por}</b> · {h.accion}</li>)}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export function PanelPreregistro({ registros, cargues, ips }: { registros: Preregistro[]; cargues: Cargue[]; ips: string[] }) {
  const [filtro, setFiltro] = useState<EstadoPre | 'todos'>('pendiente');
  const [cargueSel, setCargueSel] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [inc, accionInc, incorporando] = useActionState<EstadoAccion, FormData>(accionIncorporarPre, null);

  const conteo = useMemo(() => {
    const c: Record<string, number> = { todos: registros.length, pendiente: 0, verificado: 0, descartado: 0, incorporado: 0 };
    registros.forEach(r => c[r.estado]++);
    return c;
  }, [registros]);
  const q = buscar.trim().toUpperCase();
  const lista = registros
    .filter(r => filtro === 'todos' || r.estado === filtro)
    .filter(r => cargueSel === 'todos' || r.cargues.includes(cargueSel))
    .filter(r => !q || r.clave.includes(q) || r.nombre.toUpperCase().includes(q))
    .sort((a, b) => a.departamento.localeCompare(b.departamento) || a.municipio.localeCompare(b.municipio) || a.nombre.localeCompare(b.nombre));
  const avance = registros.length ? Math.round(((conteo.verificado + conteo.descartado + conteo.incorporado) / registros.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(['todos', 'pendiente', 'verificado', 'descartado', 'incorporado'] as const).map(k => (
          <button key={k} onClick={() => setFiltro(k)} className={`tarjeta p-4 text-left ${filtro === k ? 'ring-2 ring-marca-500' : ''}`}>
            <p className="text-xs uppercase text-slate-500">{k === 'todos' ? 'Pre-registrados' : ETIQUETA[k].t + 's'}</p>
            <p className="text-3xl font-bold text-marca-800">{conteo[k]}</p>
          </button>
        ))}
      </section>

      <section className="tarjeta flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-64 flex-1">
          <p className="text-sm font-medium">Avance de verificación: {avance}%</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-marca-600" style={{ width: `${avance}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">Pendientes por revisar: {conteo.pendiente}. Solo los verificados (con IPS asignada) se incorporan a Nutria.</p>
        </div>
        <form action={accionInc} className="flex flex-wrap items-center gap-2">
          <input name="confirmacion" type="password" required placeholder="Tu contraseña" autoComplete="current-password" className={`${campo} w-40 py-2`} />
          <button className="boton" disabled={incorporando || !conteo.verificado}>
            {incorporando ? 'Incorporando…' : `Incorporar verificados a Nutria (${conteo.verificado})`}
          </button>
          {inc && <p className={`w-full text-sm ${inc.ok ? 'text-marca-700' : 'text-red-600'}`}>{inc.mensaje}</p>}
        </form>
      </section>

      <section className="tarjeta flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Cargue
            <select value={cargueSel} onChange={e => setCargueSel(e.target.value)} className={campo}>
              <option value="todos">Todos</option>
              {[...cargues].reverse().map(c => <option key={c.id} value={c.id}>{c.id} · {fechaHora(c.fecha)}</option>)}
            </select>
          </label>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar documento o nombre" className={campo} />
          <span className="text-slate-600"><b>{lista.length}</b> registros</span>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-marca-50 text-left text-xs uppercase text-marca-900">
              <tr>
                <th className="px-2 py-2">Estado</th><th className="px-2 py-2">Documento</th><th className="px-2 py-2">Niño</th><th className="px-2 py-2">UPGD</th>
                <th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Clasificación</th><th className="px-2 py-2">Verificación</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map(r => <Fila key={r.clave} r={r} ips={ips} />)}
            </tbody>
          </table>
          {!lista.length && <p className="p-4 text-sm text-slate-500">No hay registros con este filtro.</p>}
        </div>
      </section>

      <section className="tarjeta overflow-x-auto p-4">
        <h2 className="mb-2 font-semibold">Historial de cargues ({cargues.length})</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="pr-3">Cargue</th><th className="pr-3">Fecha</th><th className="pr-3">Por</th><th className="pr-3">Archivo</th><th className="pr-3">Criterio</th><th className="pr-3">Filas / únicos</th><th className="pr-3">Enviados</th><th className="pr-3">Nuevos</th><th className="pr-3">Actualizados</th><th>Ya en Nutria</th></tr>
          </thead>
          <tbody>
            {[...cargues].reverse().map(c => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-1 pr-3 font-mono text-xs">{c.id}</td><td className="pr-3 whitespace-nowrap">{fechaHora(c.fecha)}</td><td className="pr-3">{c.por}</td>
                <td className="pr-3 text-xs">{c.archivo}</td><td className="pr-3 text-xs">{c.criterio}</td><td className="pr-3">{c.totalFilas} / {c.unicos}</td>
                <td className="pr-3">{c.enviados}</td><td className="pr-3 font-semibold">{c.nuevos}</td><td className="pr-3">{c.actualizados}</td><td>{c.yaEnNutria}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargues.length && <p className="text-sm text-slate-500">Aún no hay cargues. Regístrelos desde <Link href="/cruce" className="underline">Cruce de bases</Link>.</p>}
      </section>
    </div>
  );
}
