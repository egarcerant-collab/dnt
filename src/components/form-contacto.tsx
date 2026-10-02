'use client';

import { useActionState } from 'react';
import { accionGuardarContacto } from '@/app/acciones';

export interface ContactoVista { responsable: string; cargo: string; correos: string[]; whatsapp: string; telefono?: string }

/** Pre-registro de la IPS: responsable y medios de contacto para notificaciones. */
export function FormContacto({ ips, inicial, esAdmin }: { ips: string; inicial?: ContactoVista; esAdmin: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionGuardarContacto, null);
  return (
    <form action={accion} className="flex flex-col gap-4">
      {esAdmin && <input type="hidden" name="ips" value={ips} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Responsable del seguimiento DNT *
          <input name="responsable" required minLength={5} maxLength={100} defaultValue={inicial?.responsable} className="input" placeholder="Nombre completo" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Cargo
          <input name="cargo" maxLength={100} defaultValue={inicial?.cargo} className="input" placeholder="Ej: Nutricionista, Coordinador(a) médico" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Correo(s) de la IPS para notificaciones *
          <input name="correos" required defaultValue={inicial?.correos.join(', ')} className="input" placeholder="seguimiento@ips.com, coordinacion@ips.com" />
          <span className="text-xs font-normal text-slate-500">Hasta 5, separados por coma. Aquí llegarán los avisos e informes de la EPSI.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          WhatsApp (celular) *
          <input name="whatsapp" required inputMode="numeric" defaultValue={inicial?.whatsapp} className="input" placeholder="3001234567" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Teléfono fijo (opcional)
          <input name="telefono" defaultValue={inicial?.telefono} className="input" placeholder="(605) 000 0000" />
        </label>
      </div>
      <label className="flex items-start gap-2 rounded-lg bg-marca-50 p-3 text-xs text-slate-700">
        <input type="checkbox" name="autoriza" required defaultChecked={!!inicial} className="mt-0.5" />
        <span>
          Autorizo a Dusakawi EPSI a usar estos datos de contacto para enviar notificaciones, informes y recordatorios del seguimiento
          de desnutrición aguda (Ley 1581 de 2012). Los mensajes no incluirán datos personales de los niños.
        </span>
      </label>
      {estado && <p className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</p>}
      <button className="boton py-2.5" disabled={pendiente}>{pendiente ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Completar pre-registro'}</button>
    </form>
  );
}
