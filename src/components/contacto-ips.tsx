'use client';

import { useActionState } from 'react';
import { accionEnviarInforme } from '@/app/acciones';

export interface ContactoIps { responsable?: string; correos: string[]; whatsapp?: string }

/** Botones para notificar a una IPS: informe por correo y mensaje de WhatsApp (solo cifras, sin datos de niños). */
export function AccionesContactoIps({ ips, contacto, textoWhatsApp, compacto }: { ips: string; contacto?: ContactoIps; textoWhatsApp: string; compacto?: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionEnviarInforme, null);
  if (!contacto) return <span className="text-xs font-semibold text-amber-700">Sin pre-registro: la IPS aún no registra correo ni WhatsApp</span>;

  const wa = contacto.whatsapp ? `https://wa.me/57${contacto.whatsapp}?text=${encodeURIComponent(textoWhatsApp)}` : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {!compacto && (
        <span className="text-slate-600">
          {contacto.responsable && <b className="text-slate-800">{contacto.responsable} · </b>}
          {contacto.correos.join(', ')}
          {contacto.whatsapp && ` · WhatsApp ${contacto.whatsapp}`}
        </span>
      )}
      <form action={accion}>
        <input type="hidden" name="ips" value={ips} />
        <button className="boton px-3 py-1 text-xs" disabled={pendiente}>{pendiente ? 'Enviando…' : '✉ Enviar informe por correo'}</button>
      </form>
      {wa && (
        <a href={wa} target="_blank" rel="noopener" className="inline-flex items-center rounded-lg bg-[#25D366] px-3 py-1 font-semibold text-white hover:opacity-90">
          WhatsApp
        </a>
      )}
      {estado && <span className={estado.ok ? 'text-marca-700' : 'text-red-600'}>{estado.mensaje}</span>}
    </div>
  );
}

export function EnviarInformeTodas() {
  const [estado, accion, pendiente] = useActionState(accionEnviarInforme, null);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2 text-sm">
      <button className="boton" disabled={pendiente}>{pendiente ? 'Enviando…' : '✉ Enviar informe a todas las IPS'}</button>
      {estado && <span className={estado.ok ? 'text-marca-700' : 'text-red-600'}>{estado.mensaje}</span>}
    </form>
  );
}
