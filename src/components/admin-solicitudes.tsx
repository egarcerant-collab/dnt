'use client';

import { useActionState } from 'react';
import { accionResolverSolicitud } from '@/app/acciones';

export interface SolicitudVista { id: string; nombre: string; correo: string; cargo: string; creadoEn: string }

function Fila({ s, soySuperusuario }: { s: SolicitudVista; soySuperusuario: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionResolverSolicitud, null);
  return (
    <tr className="align-top">
      <td className="px-3 py-2"><b>{s.nombre}</b><span className="block text-xs text-slate-500">{s.cargo || '—'}</span></td>
      <td className="px-3 py-2 font-mono text-xs">{s.correo}</td>
      <td className="px-3 py-2 text-xs">{new Date(s.creadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <form action={accion} className="flex items-center gap-2">
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="decision" value="aprobar" />
            <select name="rol" defaultValue="epsi" className="input w-40">
              <option value="epsi">Funcionario EPSI</option>
              {soySuperusuario && <option value="admin">Administrador</option>}
            </select>
            <button className="boton" disabled={pendiente}>Aprobar</button>
          </form>
          <form action={accion}>
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="decision" value="rechazar" />
            <button className="boton-sec text-red-700" disabled={pendiente}>Rechazar</button>
          </form>
        </div>
        {estado && <span className={`text-xs ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</span>}
      </td>
    </tr>
  );
}

export function SolicitudesRegistro({ solicitudes, soySuperusuario }: { solicitudes: SolicitudVista[]; soySuperusuario: boolean }) {
  return (
    <section className={`tarjeta overflow-x-auto ${solicitudes.length ? 'border-amber-300' : ''}`}>
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-semibold">
          Solicitudes de registro
          {solicitudes.length > 0 && <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{solicitudes.length}</span>}
        </h2>
        <p className="text-sm text-slate-500">Funcionarios que se registraron con correo @dusakawiepsi.com. No pueden ingresar hasta que los apruebes.</p>
      </div>
      {solicitudes.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">No hay solicitudes pendientes.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
            <tr><th className="px-3 py-2">Solicitante</th><th className="px-3 py-2">Correo</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Decisión</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{solicitudes.map(s => <Fila key={s.id} s={s} soySuperusuario={soySuperusuario} />)}</tbody>
        </table>
      )}
    </section>
  );
}
