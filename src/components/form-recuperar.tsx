'use client';

import { useActionState, useState } from 'react';
import { accionRestablecerClave, accionSolicitarRecuperacion, type EstadoAccion } from '@/app/acciones';

const campo = 'input';

/** Paso 1: pedir el enlace de recuperación (funcionario por usuario/correo; prestador por IPS). */
export function FormSolicitarRecuperacion({ modo, prestadores }: { modo: 'epsi' | 'prestador'; prestadores: { ips: string; nombre: string }[] }) {
  const [tipo, setTipo] = useState(modo);
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(accionSolicitarRecuperacion, null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {([['epsi', 'Funcionario EPSI'], ['prestador', 'Prestador (IPS)']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setTipo(k)} className={`flex-1 rounded-md px-3 py-1.5 ${tipo === k ? 'bg-white font-semibold text-marca-800 shadow-sm' : 'text-slate-600'}`}>{t}</button>
        ))}
      </div>
      {estado?.ok ? (
        <p className="rounded-lg bg-marca-50 px-3 py-3 text-sm text-marca-900">{estado.mensaje}</p>
      ) : (
        <form action={accion} className="flex flex-col gap-4">
          <input type="hidden" name="tipo" value={tipo} />
          {tipo === 'epsi' ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Usuario o correo
              <input name="usuario" required autoComplete="username" autoCapitalize="none" className={campo} placeholder="usuario o correo @dusakawiepsi.com" />
              <span className="text-xs font-normal text-slate-500">El enlace llega a tu correo institucional.</span>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Prestador (IPS)
              <select name="ips" required defaultValue="" className={campo}>
                <option value="" disabled>Selecciona tu IPS…</option>
                {prestadores.map(p => <option key={p.ips} value={p.ips}>{p.nombre}</option>)}
              </select>
              <span className="text-xs font-normal text-slate-500">
                El enlace llega a los correos registrados en el pre-registro de la IPS. Si aún no los registraste, entra con 123456 o pide a la EPSI que restablezca el acceso.
              </span>
            </label>
          )}
          {estado && !estado.ok && <p className="text-sm text-red-600">{estado.mensaje}</p>}
          <button className="boton py-2.5" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace de recuperación'}</button>
        </form>
      )}
    </div>
  );
}

/** Paso 2: crear la nueva contraseña con el enlace recibido. */
export function FormNuevaClave({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(accionRestablecerClave, null);
  const [ver, setVer] = useState(false);
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="t" value={token} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nueva contraseña
        <input name="nueva" type={ver ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className={campo} />
        <span className="text-xs font-normal text-slate-500">Mínimo 8 caracteres. No uses 123456 ni secuencias.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Confirmar contraseña
        <input name="confirmar" type={ver ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className={campo} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} /> Mostrar contraseña</label>
      {estado && !estado.ok && <p className="text-sm text-red-600">{estado.mensaje}</p>}
      <button className="boton py-2.5" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
    </form>
  );
}
