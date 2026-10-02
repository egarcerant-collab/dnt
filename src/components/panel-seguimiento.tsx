'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EventoTraza, FilaTraza, TipoEvento } from '@/lib/dnt/traza';
import { ORDEN_SEMAFORO, SEMAFORO, type ClaveSemaforo } from '@/lib/dnt/semaforo';
import { EstadoBadge, formatoFecha } from './ui';
import { AccionesContactoIps, type ContactoIps } from './contacto-ips';

type Filtro = 'todos' | 'con-registros' | 'sin-registros' | 'con-historia' | 'sin-historia' | 'preguntas';

const FILTROS: [Filtro, string][] = [
  ['todos', 'Todos'],
  ['con-registros', 'Con registros del prestador'],
  ['sin-registros', 'Sin registros del prestador'],
  ['con-historia', 'Con historia clínica'],
  ['sin-historia', 'Controles sin historia clínica'],
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

/** Grupos por número de controles (Excel AY..KF + app). */
const GRUPOS_N = ['0', '1', '2', '3', '4', '5', '6+'];
const grupoN = (f: FilaTraza) => { const n = f.controlesExcel + f.controlesApp; return n >= 6 ? '6+' : String(n); };

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

export function PanelSeguimiento({ filas, eventos, contactos }: {
  filas: FilaTraza[];
  eventos: EventoTraza[];
  contactos: Record<string, { contacto?: ContactoIps; texto: string }>;
}) {
  const [q, setQ] = useState('');
  const [geo, setGeo] = useState<{ depto: string; municipio: string; ips: string }>({ depto: '', municipio: '', ips: '' });
  const { ips } = geo;
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [vista, setVista] = useState<'ninos' | 'actividad'>('ninos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [semaforo, setSemaforo] = useState<ClaveSemaforo | ''>('');
  const [nControles, setNControles] = useState('');

  // Filtros en cascada departamento → municipio → IPS (cada lista muestra solo lo compatible)
  type ClaveGeo = 'depto' | 'municipio' | 'ips';
  const campo = (f: FilaTraza, k: ClaveGeo) => (k === 'depto' ? f.departamento : k === 'municipio' ? f.municipio : f.ips);
  const compatible = (f: FilaTraza, v: typeof geo, excepto?: ClaveGeo) =>
    (['depto', 'municipio', 'ips'] as ClaveGeo[]).every(k => k === excepto || !v[k] || campo(f, k) === v[k]);
  const opciones = (k: ClaveGeo) => [...new Set(filas.filter(f => compatible(f, geo, k)).map(f => campo(f, k)))].filter(Boolean).sort();
  function cambiarGeo(k: ClaveGeo, valor: string) {
    const nuevo = { ...geo, [k]: valor };
    // Si la combinación ya no existe, se limpian los otros filtros
    (['depto', 'municipio', 'ips'] as ClaveGeo[]).forEach(o => {
      if (o !== k && nuevo[o] && !filas.some(f => compatible(f, { depto: '', municipio: '', ips: '', [k]: valor, [o]: nuevo[o] }))) nuevo[o] = '';
    });
    setGeo(nuevo);
  }
  const geoFilas = useMemo(() => filas.filter(f => compatible(f, geo)), [filas, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const t = q.trim().toUpperCase();
    return geoFilas
      .filter(f => !semaforo || f.semaforo === semaforo)
      .filter(f => !nControles || grupoN(f) === nControles)
      .filter(f => !t || f.nombre.toUpperCase().includes(t) || f.documento.includes(t) || f.municipio.includes(t))
      .filter(f =>
        filtro === 'con-registros' ? f.controlesApp > 0 || f.historias.length > 0 || f.ax
        : filtro === 'sin-registros' ? f.controlesApp === 0 && f.historias.length === 0 && !f.ax
        : filtro === 'con-historia' ? f.historias.length > 0
        : filtro === 'sin-historia' ? f.controlesSinHc.length > 0
        : filtro === 'preguntas' ? f.sinResponder > 0
        : true,
      )
      .sort((a, b) => (b.ultimoRegistroApp?.fecha ?? '').localeCompare(a.ultimoRegistroApp?.fecha ?? '') || a.porcentaje - b.porcentaje);
  }, [geoFilas, q, filtro, semaforo, nControles]);

  const conteoControles = useMemo(() => {
    const r: Record<string, number> = {};
    geoFilas.forEach(f => (r[grupoN(f)] = (r[grupoN(f)] ?? 0) + 1));
    return r;
  }, [geoFilas]);

  const conteoSemaforo = useMemo(() => {
    const r: Partial<Record<ClaveSemaforo, number>> = {};
    geoFilas.forEach(f => (r[f.semaforo] = (r[f.semaforo] ?? 0) + 1));
    return r;
  }, [geoFilas]);

  const eventosVisibles = useMemo(() => {
    if (!geo.depto && !geo.municipio && !geo.ips) return eventos;
    const ids = new Set(geoFilas.map(f => f.id));
    const ipsGeo = new Set(geoFilas.map(f => f.ips));
    return eventos.filter(e => (e.casoId ? ids.has(e.casoId) : ipsGeo.has(e.ips)));
  }, [eventos, geoFilas, geo]);

  const resumen = useMemo(() => {
    const base = geoFilas;
    return {
      ninos: base.length,
      conRegistros: base.filter(f => f.controlesApp > 0).length,
      controles: base.reduce((s, f) => s + f.controlesApp, 0),
      historias: base.reduce((s, f) => s + f.historias.length, 0),
      promedio: base.length ? Math.round(base.reduce((s, f) => s + f.porcentaje, 0) / base.length) : 0,
      preguntas: base.reduce((s, f) => s + f.sinResponder, 0),
    };
  }, [geoFilas]);

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

      <div className="tarjeta flex flex-wrap items-end gap-3 p-3 text-sm">
        <input className="input max-w-xs" placeholder="Buscar nombre, documento, municipio…" value={q} onChange={e => setQ(e.target.value)} />
        {(
          [
            ['depto', 'Departamento'],
            ['municipio', 'Municipio'],
            ['ips', 'IPS'],
          ] as const
        ).map(([k, t]) => {
          const ops = opciones(k);
          return (
            <label key={k} className="flex min-w-44 flex-1 flex-col gap-1">
              <span className="etiqueta">{t} <span className="normal-case text-slate-400">({ops.length})</span></span>
              <select className="input" value={geo[k]} onChange={e => cambiarGeo(k, e.target.value)}>
                <option value="">Todos</option>
                {ops.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          );
        })}
        {(geo.depto || geo.municipio || geo.ips) && (
          <button onClick={() => setGeo({ depto: '', municipio: '', ips: '' })} className="boton-sec self-end">Limpiar</button>
        )}
        <div className="ml-auto flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['ninos', 'actividad'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)} className={`rounded-md px-3 py-1.5 ${vista === v ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`}>
              {v === 'ninos' ? `Niños (${visibles.length})` : `Actividad (${eventosVisibles.length})`}
            </button>
          ))}
        </div>
      </div>

      {ips && (
        <div className="tarjeta flex flex-col gap-2 p-3">
          <p className="etiqueta">Notificar a {ips}</p>
          <AccionesContactoIps ips={ips} contacto={contactos[ips]?.contacto} textoWhatsApp={contactos[ips]?.texto ?? ''} />
        </div>
      )}

      {vista === 'ninos' ? (
        <section className="tarjeta overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <span className="etiqueta mr-1">Semáforo</span>
            <button onClick={() => setSemaforo('')} className={`rounded-full border px-3 py-1 text-xs ${semaforo === '' ? 'border-slate-700 bg-slate-700 font-semibold text-white' : 'border-slate-300'}`}>Todos</button>
            {ORDEN_SEMAFORO.filter(k => conteoSemaforo[k]).map(k => (
              <button key={k} onClick={() => setSemaforo(semaforo === k ? '' : k)} title={SEMAFORO[k].descripcion}
                style={{ backgroundColor: SEMAFORO[k].color, color: SEMAFORO[k].texto }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${semaforo === k ? 'ring-2 ring-slate-800 ring-offset-1' : 'opacity-90'}`}>
                {SEMAFORO[k].etiqueta} ({conteoSemaforo[k]})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <span className="etiqueta mr-1">N° de controles</span>
            <button onClick={() => setNControles('')}
              className={`rounded-full border px-3 py-1 text-xs ${nControles === '' ? 'border-slate-700 bg-slate-700 font-semibold text-white' : 'border-slate-300'}`}>
              Todos
            </button>
            {GRUPOS_N.map(g => (
              <button key={g} onClick={() => setNControles(nControles === g ? '' : g)}
                className={`rounded-full border px-3 py-1 text-xs ${nControles === g ? 'border-marca-600 bg-marca-600 font-semibold text-white' : g === '0' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-300 hover:bg-marca-50'}`}>
                {g === '1' ? '1 control' : `${g} controles`} ({conteoControles[g] ?? 0})
              </button>
            ))}
          </div>
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
                <th className="px-3 py-2">Estado (semáforo) / Clasificación</th>
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
        <td className="px-3 py-2 text-xs"><EstadoBadge estado={f.estado} z={f.ultimoZ} /><span className="mt-1 block text-slate-500">{f.clasificacion}</span></td>
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
              <a key={h.id} href={`/api/historias/${h.id}`} target="_blank" rel="noopener" className="block font-medium text-marca-700 hover:underline">📄 {h.control ? `C${h.control} · ` : ''}{h.nombre}</a>
            ))
          ) : (
            <span className="font-semibold text-red-600">No cargada</span>
          )}
          {f.historias.length > 0 && f.controlesSinHc.length > 0 && (
            <span className="block font-semibold text-red-600">Falta en control {f.controlesSinHc.join(', ')}</span>
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
