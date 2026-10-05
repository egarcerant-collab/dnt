'use client';

import { useActionState, useState } from 'react';
import { accionEliminarCaso, accionMoverCaso, accionRestaurarCaso, type EstadoAccion } from '@/app/acciones';

const campo = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

function Confirmacion() {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Confirma con tu contraseña de Nutria</span>
      <input name="confirmacion" type="password" required autoComplete="current-password" className={campo} />
    </label>
  );
}

function Mensaje({ estado }: { estado: EstadoAccion }) {
  return estado ? <p className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</p> : null;
}

interface Props {
  id: string;
  actual: { departamento: string; municipio: string; ips: string };
  /** Municipios por departamento, tomados de la base. */
  ubicaciones: Record<string, string[]>;
  ips: string[];
  esAdmin: boolean;
  historial: { fecha: string; por: string; cambio: string }[];
}

/** Corrección de la ubicación del caso y eliminación del registro (funcionarios EPSI / administrador). */
export function GestionCaso({ id, actual, ubicaciones, ips, esAdmin, historial }: Props) {
  const [mover, accionMover, moviendo] = useActionState<EstadoAccion, FormData>(accionMoverCaso, null);
  const [eliminar, accionEliminar, eliminando] = useActionState<EstadoAccion, FormData>(accionEliminarCaso, null);
  const [depto, setDepto] = useState(actual.departamento);
  const [modo, setModo] = useState<'mover' | 'eliminar' | null>(null);
  const municipios = ubicaciones[depto] ?? [];

  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Corrección del registro</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModo(modo === 'mover' ? null : 'mover')} className="rounded-lg border border-marca-300 px-3 py-1.5 text-sm text-marca-800 hover:bg-marca-50">
            Mover municipio / departamento / IPS
          </button>
          {esAdmin && (
            <button type="button" onClick={() => setModo(modo === 'eliminar' ? null : 'eliminar')} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
              Eliminar registro
            </button>
          )}
        </div>
      </div>

      {modo === 'mover' && (
        <form action={accionMover} className="grid gap-3 rounded-lg bg-marca-50/50 p-3 md:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Departamento</span>
            <select name="departamento" value={depto} onChange={e => setDepto(e.target.value)} className={campo}>
              {Object.keys(ubicaciones).sort().map(d => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Municipio</span>
            <select name="municipio" key={depto} defaultValue={municipios.includes(actual.municipio) ? actual.municipio : municipios[0]} className={campo}>
              {municipios.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">IPS de seguimiento</span>
            <select name="ips" defaultValue={actual.ips} className={campo}>
              {ips.map(i => <option key={i}>{i}</option>)}
            </select>
          </label>
          <div className="md:col-span-2"><Confirmacion /></div>
          <div className="flex items-end">
            <button className="boton w-full" disabled={moviendo}>{moviendo ? 'Guardando…' : 'Mover registro'}</button>
          </div>
          <p className="text-xs text-slate-500 md:col-span-3">
            Ubicación actual: {actual.municipio}, {actual.departamento} · {actual.ips}. Al cambiar la IPS, el caso pasa a la nueva IPS en el módulo prestador.
          </p>
          <div className="md:col-span-3"><Mensaje estado={mover} /></div>
        </form>
      )}

      {modo === 'eliminar' && esAdmin && (
        <form action={accionEliminar} className="flex flex-col gap-3 rounded-lg bg-red-50/60 p-3">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-red-900">
            El registro se oculta en toda la app (indicadores, seguimiento, prestador, exportaciones e informes). No se borra: queda en
            Administración → Registros eliminados y se puede restaurar.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Motivo de la eliminación</span>
            <textarea name="motivo" required minLength={10} maxLength={300} rows={2} placeholder="Ej.: registro duplicado del documento RC 1234…" className={campo} />
          </label>
          <Confirmacion />
          <button className="w-fit rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700" disabled={eliminando}>
            {eliminando ? 'Eliminando…' : 'Eliminar registro'}
          </button>
          <Mensaje estado={eliminar} />
        </form>
      )}

      {historial.length > 0 && (
        <ul className="border-t border-slate-100 pt-2 text-xs text-slate-600">
          {historial.map((h, i) => (
            <li key={i}>
              {new Date(h.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · <b>{h.por}</b> · {h.cambio}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Botón para restaurar un registro eliminado (Administración). */
export function RestaurarCaso({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(accionRestaurarCaso, null);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="confirmacion" type="password" required placeholder="Tu contraseña" autoComplete="current-password" className={`${campo} w-36 py-1`} />
      <button className="rounded-lg border border-marca-300 px-3 py-1 text-sm text-marca-800 hover:bg-marca-50" disabled={enviando}>Restaurar</button>
      <Mensaje estado={estado} />
    </form>
  );
}
