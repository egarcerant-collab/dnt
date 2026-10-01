'use client';

import { useActionState, useEffect, useRef } from 'react';
import { accionEnviarMensaje } from '@/app/acciones';

export interface MensajeVista {
  id: string;
  tipo: 'notificacion' | 'pregunta' | 'respuesta';
  texto: string;
  autorNombre: string;
  autorRol: string;
  fecha: string;
}

const ESTILO = {
  notificacion: { etiqueta: 'Notificación', clase: 'border-marca-100 bg-marca-50' },
  pregunta: { etiqueta: 'Pregunta', clase: 'border-amber-200 bg-amber-50' },
  respuesta: { etiqueta: 'Respuesta del prestador', clase: 'border-slate-200 bg-white' },
};

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });

export function HiloMensajes({ mensajes }: { mensajes: MensajeVista[] }) {
  if (!mensajes.length) return <p className="text-sm text-slate-500">Aún no hay notificaciones ni preguntas.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {mensajes.map(m => (
        <li key={m.id} className={`rounded-lg border p-3 text-sm ${ESTILO[m.tipo].clase} ${m.tipo === 'respuesta' ? 'ml-8' : 'mr-8'}`}>
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
            <span><b className="text-slate-700">{ESTILO[m.tipo].etiqueta}</b> · {m.autorNombre}</span>
            <span>{fechaHora(m.fecha)}</span>
          </div>
          <p className="whitespace-pre-wrap">{m.texto}</p>
        </li>
      ))}
    </ul>
  );
}

/** EPSI: envía notificación o pregunta. Prestador: responde. */
export function FormMensaje({ casoId, ips, esPrestador, opcionesIps }: { casoId?: string; ips?: string; esPrestador: boolean; opcionesIps?: string[] }) {
  const [estado, accion, pendiente] = useActionState(accionEnviarMensaje, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);

  return (
    <form ref={ref} action={accion} className="flex flex-col gap-2">
      {casoId && <input type="hidden" name="casoId" value={casoId} />}
      {ips && <input type="hidden" name="ips" value={ips} />}
      <div className="flex flex-wrap gap-2">
        {!esPrestador && (
          <select name="tipo" defaultValue="notificacion" className="input w-44">
            <option value="notificacion">Notificación</option>
            <option value="pregunta">Pregunta</option>
          </select>
        )}
        {opcionesIps && (
          <select name="ips" required defaultValue="" className="input min-w-64 flex-1">
            <option value="" disabled>Prestador destinatario…</option>
            {opcionesIps.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>
      <textarea name="texto" rows={3} required minLength={3} maxLength={2000} className="input"
        placeholder={esPrestador ? 'Escribe tu respuesta para la EPSI…' : 'Escribe la notificación o pregunta para el prestador…'} />
      <div className="flex items-center gap-3">
        <button className="boton" disabled={pendiente}>{pendiente ? 'Enviando…' : esPrestador ? 'Responder' : 'Enviar'}</button>
        {estado && <span className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</span>}
      </div>
    </form>
  );
}
