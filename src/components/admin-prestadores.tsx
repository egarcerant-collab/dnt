'use client';

import { useActionState } from 'react';
import { accionActualizarPrestador } from '@/app/acciones';
import { AccionesContactoIps, EnviarInformeTodas, type ContactoIps } from './contacto-ips';

export interface PrestadorFila {
  ips: string; nit: string; dv: string; activo: boolean; nitConfirmado: boolean; tieneClave: boolean; casos: number;
  contacto?: ContactoIps; textoWhatsApp: string;
}

function Fila({ p }: { p: PrestadorFila }) {
  const [estado, accion, pendiente] = useActionState(accionActualizarPrestador, null);
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <b>{p.ips}</b>
        <span className="block text-xs text-slate-500">{p.casos} niños</span>
      </td>
      <td className="px-3 py-2">
        <form action={accion} className="flex items-center gap-2">
          <input type="hidden" name="ips" value={p.ips} />
          <input name="nit" defaultValue={p.nit ? `${p.nit}${p.dv ? '-' + p.dv : ''}` : ''} placeholder="NIT-DV" className="input w-36" required />
          <button className="boton-sec" disabled={pendiente}>Guardar</button>
        </form>
        {!p.nit ? (
          <span className="text-xs font-semibold text-red-600">Sin NIT: no puede ingresar</span>
        ) : !p.nitConfirmado ? (
          <span className="text-xs text-amber-700">Tomado de SIVIGILA · verificar con el RUT</span>
        ) : (
          <span className="text-xs text-marca-700">Confirmado</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">{p.tieneClave ? 'Contraseña personal' : 'Entra con el NIT'}</td>
      <td className="max-w-sm px-3 py-2">
        <AccionesContactoIps ips={p.ips} contacto={p.contacto} textoWhatsApp={p.textoWhatsApp} />
        <a href={`/registro-prestador?ips=${encodeURIComponent(p.ips)}`} className="mt-1 inline-block text-xs text-marca-700 hover:underline">{p.contacto ? 'Editar contacto' : 'Registrar contacto'}</a>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <form action={accion}>
            <input type="hidden" name="ips" value={p.ips} />
            <input type="hidden" name="activo" value={String(!p.activo)} />
            <button className="boton-sec" disabled={pendiente}>{p.activo ? 'Desactivar' : 'Activar'}</button>
          </form>
          {p.tieneClave && (
            <form action={accion}>
              <input type="hidden" name="ips" value={p.ips} />
              <input type="hidden" name="restablecer" value="true" />
              <button className="boton-sec" disabled={pendiente} title="El prestador vuelve a entrar con el NIT y crea una nueva contraseña">Restablecer acceso</button>
            </form>
          )}
        </div>
        {estado && <span className={`text-xs ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</span>}
      </td>
    </tr>
  );
}

export function TablaPrestadores({ prestadores, correo }: { prestadores: PrestadorFila[]; correo: { configurado: boolean; remitente: string } }) {
  const sinNit = prestadores.filter(p => !p.nit).length;
  return (
    <section className="tarjeta overflow-x-auto">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-semibold">Prestadores ({prestadores.length})</h2>
        <p className="text-sm text-slate-500">
          Cada IPS elige su nombre en la lista y entra con su NIT. En el primer ingreso debe completar el pre-registro (responsable, correos y WhatsApp).
          {sinNit > 0 && <b className="text-red-600"> {sinNit} sin NIT registrado.</b>}{' '}
          <b>{prestadores.filter(p => p.contacto).length} de {prestadores.length}</b> con pre-registro.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <EnviarInformeTodas />
          <span className={`text-xs ${correo.configurado ? 'text-marca-700' : 'font-semibold text-amber-700'}`}>
            {correo.configurado
              ? `Los correos salen desde ${correo.remitente}. Informe automático: lunes 8:00 a. m.`
              : `Correo no configurado: falta SMTP_USER y SMTP_PASS (contraseña de aplicación de ${correo.remitente}) en Vercel.`}
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
          <tr><th className="px-3 py-2">Prestador</th><th className="px-3 py-2">NIT</th><th className="px-3 py-2">Acceso</th><th className="px-3 py-2">Contacto y notificación</th><th className="px-3 py-2">Acciones</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {prestadores.map(p => <Fila key={p.ips} p={p} />)}
        </tbody>
      </table>
    </section>
  );
}
