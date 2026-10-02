'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EventoTraza, FilaTraza, TipoEvento } from '@/lib/dnt/traza';
import { formatoFecha } from './ui';

type Filtro = 'todos' | 'con-registros' | 'sin-registros' | 'con-historia' | 'sin-historia' | 'preguntas';

const FILTROS: [Filtro, string][] = [
  ['todos', 'Todos'],
  ['con-registros', 'Con registros del prestador'],
  ['sin-registros', 'Sin registros del prestador'],
  ['con-historia', 'Con historia clínica'],
  ['sin-historia', 'Sin historia clínica'],
  ['preguntas', 'Preguntas sin responder'],
];

const ICONO: Record<TipoEvento, { t: string; c: string }> = {
  control: { t: 'Control', c: 'bg-marca-100 text-marca-800' },
  historia: { t: 'Historia clínica', c: 'bg-emerald-100 text-emerald-800' },
  anulacion: { t: 'Historia eliminada', c: 'bg-red-100 text-red-800' },
  respuesta: { t: 'Respuesta IPS', c: 'bg-slate-100 text-slate-700' },
  notificacion: { t: 'Notificación EPSI', c: 'bg-sky-100 text-sky-800' },
  pregunta: { t: 'Pregunta EPSI', c: 'bg-amber-100 text-amber-800' },
};

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });

function Barra({ v }: { v: number }) {
  const color = v >= 85 ? 'bg-marca-600 text-marca-700' : v >= 60 ? 'bg-amber-500 text-amber-700' : 'bg-red-500 text-red-700';
  return (
    <div className="w-14">
      <span className={`text-xs font-bold ${color.split(' ')[1]}`}>{v}%</span>
      <div className="mt-0.5 h-1.5 rounded bg-slate-100"><div className={`h-1.5 rounded ${color.split(' ')[0]}`} style={{ width: `${v}%` }} /></div>
    </div>
  );
}

export function PanelSeguimiento({ filas, eventos }: { filas: FilaTraza[]; eventos: EventoTraza[] }) {
  const [q, setQ] = useState('');
  const [ips, setIps] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [vista, setVista] = useState<'ninos' | 'actividad'>('ninos');
  const [abierto, setAbierto] = useState<string | null>(null);

  const listaIps = useMemo(() => [...new Set(filas.map(f => f.ips))].sort(), [filas]);

  const visibles = useMemo(() => {
    const t = q.trim().toUpperCase();
    return filas
      .filter(f => !ips || f.ips === ips)
      .filter(f => !t || f.nombre.toUpperCase().includes(t) || f.documento.includes(t) || f.municipio.includes(t))
      .filter(f =>
        filtro === 'con-registros' ? f.controlesApp > 0 || f.historias.length > 0 || f.ax
        : filtro === 'sin-registros' ? f.controlesApp === 0 && f.historias.length === 0 && !f.ax
        : filtro === 'con-historia' ? f.historias.length > 0
        : filtro === 'sin-historia' ? f.historias.length === 0
        : filtro === 'preguntas' ? f.sinResponder > 0
        : true,
      )
      .sort((a, b) => (b.ultimoRegistroApp?.fecha ?? '').localeCompare(a.ultimoRegistroApp?.fecha ?? '') || a.porcentaje - b.porcentaje);
  }, [filas, q, ips, filtro]);

  const eventosVisibles = useMemo(() => eventos.filter(e => !ips || e.ips === ips), [eventos, ips]);

  const resumen = useMemo(() => {
    const base = ips ? filas.filter(f => f.ips === ips) : filas;
    return {
      ninos: base.length,
      conRegistros: base.filter(f => f.controlesApp > 0).length,
      controles: base.reduce((s, f) => s + f.controlesApp, 0),
      historias: base.reduce((s, f) => s + f.historias.length, 0),
      promedio: base.length ? Math.round(base.reduce((s, f) => s + f.porcentaje, 0) / base.length) : 0,
      preguntas: base.reduce((s, f) => s + f.sinResponder, 0),
    };
  }, [filas, ips]);

  const tarjetas = [
    ['Niños', resumen.ninos],
    ['Con controles del prestador', resumen.conRegistros],
    ['Controles registrados en la app', resumen.controles],
    ['Historias clínicas cargadas', resumen.historias],
    ['Diligenciamiento promedio', `${resumen.promedio}%`],
    ['Preguntas sin responder', resumen.preguntas],
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tarjetas.map(([t, v]) => (
          <div key={t} className="tarjeta p-3">
            <p className="etiqueta">{t}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="tarjeta flex flex-wrap items-center gap-3 p-3 text-sm">
        <input className="input max-w-xs" placeholder="Buscar nombre, documento, municipio…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input max-w-sm" value={ips} onChange={e => setIps(e.target.value)}>
          <option value="">— Todos los prestadores —</option>
          {listaIps.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <div className="ml-auto flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['ninos', 'actividad'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)} className={`rounded-md px-3 py-1.5 ${vista === v ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`}>
              {v === 'ninos' ? `Niños (${visibles.length})` : `Actividad (${eventosVisibles.length})`}
            </button>
          ))}
        </div>
      </div>

      {vista === 'ninos' ? (
        <section className="tarjeta overflow-x-auto">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            {FILTROS.map(([k, t]) => (
              <button key={k} onClick={() => setFiltro(k)}
                className={`rounded-full border px-3 py-1 text-xs ${filtro === k ? 'border-marca-600 bg-marca-600 font-semibold text-white' : 'border-slate-300 hover:bg-marca-50'}`}>
                {t}
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-marca-900 text-left text-xs uppercase text-white">
              <tr>
                <th className="px-3 py-2">%</th>
                <th className="px-3 py-2">Tipo / ID</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Municipio / IPS</th>
                <th className="px-3 py-2">Clasificación</th>
                <th className="px-3 py-2 text-center">Controles<br /><span className="font-normal normal-case">Excel · App</span></th>
                <th className="px-3 py-2">Último registro del prestador</th>
                <th className="px-3 py-2 text-center">AX</th>
                <th className="px-3 py-2">Historia clínica</th>
                <th className="px-3 py-2 text-center">Mensajes</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.slice(0, 300).map(f => (
                <FilaNino key={f.id} f={f} abierto={abierto === f.id} onToggle={() => setAbierto(abierto === f.id ? null : f.id)} />
              ))}
              {!visibles.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500">No hay niños con este filtro.</td></tr>}
            </tbody>
          </table>
          {visibles.length > 300 && <p className="p-3 text-xs text-slate-500">Mostrando 300 de {visibles.length}. Usa el buscador o el filtro de prestador.</p>}
        </section>
      ) : (
        <section className="tarjeta p-4">
          {eventosVisibles.length === 0 && <p className="text-sm text-slate-500">Todavía no hay actividad de los prestadores en la app.</p>}
          <ol className="relative flex flex-col gap-3 border-l-2 border-marca-100 pl-5">
            {eventosVisibles.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-marca-600" />
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${ICONO[e.tipo].c}`}>{ICONO[e.tipo].t}</span>
                  <span>{fechaHora(e.fecha)}</span>
                  <span>· {e.ips}</span>
                  <span>· por <b className="text-slate-700">{e.por}</b></span>
                </div>
                <p className="text-sm">
                  {e.casoId ? <Link href={`/caso/${encodeURIComponent(e.casoId)}`} className="font-semibold text-marca-700 hover:underline">{e.nino}</Link> : <b>{e.nino}</b>}
                  {' — '}{e.detalle}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function FilaNino({ f, abierto, onToggle }: { f: FilaTraza; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-3 py-2"><Barra v={f.porcentaje} /></td>
        <td className="px-3 py-2 whitespace-nowrap"><span className="rounded bg-marca-50 px-1.5 py-0.5 text-xs font-bold text-marca-700">{f.tipoDocumento}</span> {f.documento}</td>
        <td className="px-3 py-2 font-medium">{f.nombre}</td>
        <td className="px-3 py-2 text-xs">{f.municipio}<span className="block text-slate-500">{f.ips}</span></td>
        <td className="px-3 py-2 text-xs">{f.clasificacion}<span className="block text-slate-500">{f.estado}</span></td>
        <td className="px-3 py-2 text-center">{f.controlesExcel} · <b className={f.controlesApp ? 'text-marca-700' : 'text-slate-400'}>{f.controlesApp}</b></td>
        <td className="px-3 py-2 text-xs">
          {f.ultimoRegistroApp ? (
            <>{new Date(f.ultimoRegistroApp.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}<span className="block text-slate-500">{f.ultimoRegistroApp.por}</span></>
          ) : (
            <span className="text-slate-400">Sin registros · último control {formatoFecha(f.ultimoControl)}</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">{f.ax ? <span className="font-bold text-marca-700">SÍ</span> : <span className="text-slate-400">—</span>}</td>
        <td className="px-3 py-2 text-xs">
          {f.historias.length ? (
            f.historias.map(h => (
              <a key={h.id} href={`/api/historias/${h.id}`} target="_blank" rel="noopener" className="block font-medium text-marca-700 hover:underline">📄 {h.nombre}</a>
            ))
          ) : (
            <span className="font-semibold text-red-600">No cargada</span>
          )}
        </td>
        <td className="px-3 py-2 text-center text-xs">
          {f.mensajes}
          {f.sinResponder > 0 && <span className="block font-semibold text-amber-700">{f.sinResponder} sin resp.</span>}
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-1">
            <Link href={`/caso/${encodeURIComponent(f.id)}`} className="boton px-3 py-1">Ver</Link>
            <button onClick={onToggle} className="boton-sec px-2 py-1" title="¿Qué falta diligenciar?">{abierto ? '▲' : '▼'}</button>
          </div>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-marca-50/50">
          <td colSpan={11} className="px-4 py-2 text-xs">
            {f.pendientes.length ? (
              <><b>Falta diligenciar:</b> {f.pendientes.join(' · ')}</>
            ) : (
              <b className="text-marca-700">Diligenciamiento completo.</b>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
