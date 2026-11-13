'use client';

import { useActionState, useState } from 'react';
import { accionCorreosPrimaria, accionEnviarAvisoPrimaria, type EstadoAccion } from '@/app/acciones';
import type { IpsPrimaria } from '@/lib/dnt/aviso-primaria';

const dmy = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

function Fila({ p }: { p: IpsPrimaria }) {
  const [eCorreo, accionCorreo, guardando] = useActionState<EstadoAccion, FormData>(accionCorreosPrimaria, null);
  const [eEnvio, accionEnvio, enviando] = useActionState<EstadoAccion, FormData>(accionEnviarAvisoPrimaria, null);
  const [ver, setVer] = useState(false);
  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-2">
          <b>{p.ips}</b>
          <button type="button" onClick={() => setVer(!ver)} className="block text-xs text-marca-700 hover:underline">
            {p.ninos.length} niño(s) · {p.pendientes} sin avisar {ver ? '▲' : '▼'}
          </button>
        </td>
        <td className="px-3 py-2">
          <form action={accionCorreo} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="ips" value={p.ips} />
            <input name="correos" defaultValue={p.correos.join(', ')} placeholder="correo@ips.com" className="input w-64 py-1 text-sm" />
            <button className="boton-sec px-2 py-1 text-xs" disabled={guardando}>Guardar</button>
          </form>
          {eCorreo && <p className={`text-xs ${eCorreo.ok ? 'text-marca-700' : 'text-red-600'}`}>{eCorreo.mensaje}</p>}
        </td>
        <td className="px-3 py-2">
          <form action={accionEnvio} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="ips" value={p.ips} />
            <button className="boton px-2 py-1 text-xs" disabled={enviando || !p.correos.length || !p.pendientes}>Avisar {p.pendientes} pendiente(s)</button>
            <button name="reenviar" value="si" className="boton-sec px-2 py-1 text-xs" disabled={enviando || !p.correos.length}>Reenviar todos</button>
          </form>
          {!p.correos.length && <p className="text-xs text-amber-700">Registra un correo para poder avisar</p>}
          {eEnvio && <p className={`text-xs ${eEnvio.ok ? 'text-marca-700' : 'text-red-600'}`}>{eEnvio.mensaje}</p>}
        </td>
      </tr>
      {ver && (
        <tr>
          <td colSpan={3} className="bg-slate-50 px-3 py-2">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500"><tr><th className="py-1">Documento</th><th>Nombre</th><th>Municipio</th><th>Notificación</th><th>Prestador de la ruta</th><th>Avisado</th></tr></thead>
              <tbody>
                {p.ninos.map(n => (
                  <tr key={n.id} className="border-t border-slate-200">
                    <td className="py-1">{n.documento}</td><td>{n.nombre}</td><td>{n.municipio}</td><td>{dmy(n.notificacion)}</td><td>{n.ruta}</td>
                    <td>{n.avisado ? dmy(n.avisado) : <span className="font-semibold text-amber-700">Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/** Aviso a las IPS de atención primaria distintas del prestador de la ruta DNT. */
export function AvisoPrimaria({ ips }: { ips: IpsPrimaria[] }) {
  const [eTodos, accionTodos, enviando] = useActionState<EstadoAccion, FormData>(accionEnviarAvisoPrimaria, null);
  const pendientes = ips.reduce((t, p) => t + p.pendientes, 0);
  return (
    <section className="tarjeta overflow-x-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="font-semibold">Aviso a la IPS de atención primaria</h2>
          <p className="max-w-3xl text-sm text-slate-500">
            Niños cuya IPS de atención primaria (columna AX) es distinta del prestador de la ruta DNT. Se le informa a esa IPS que el niño ingresó a la Ruta
            de Alteraciones Nutricionales y que debe garantizarle las actividades de la Ruta de Promoción y Mantenimiento de la Salud según su curso de vida.
            Es un correo aparte: el resumen al prestador de la ruta no cambia. Los pendientes se envían también automáticamente cada lunes.
          </p>
        </div>
        <form action={accionTodos}>
          <button className="boton" disabled={enviando || !pendientes}>{enviando ? 'Enviando…' : `Avisar todos los pendientes (${pendientes})`}</button>
          {eTodos && <p className={`mt-1 text-xs ${eTodos.ok ? 'text-marca-700' : 'text-red-600'}`}>{eTodos.mensaje}</p>}
        </form>
      </div>
      {ips.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Todos los niños tienen como IPS de atención primaria al mismo prestador de la ruta.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
            <tr><th className="px-3 py-2">IPS de atención primaria</th><th className="px-3 py-2">Correo de notificación</th><th className="px-3 py-2">Aviso</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{ips.map(p => <Fila key={p.ips} p={p} />)}</tbody>
        </table>
      )}
    </section>
  );
}
