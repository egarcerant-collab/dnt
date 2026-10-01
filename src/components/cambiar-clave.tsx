'use client';

import { useActionState } from 'react';
import { accionCambiarClavePrestador } from '@/app/acciones';

export function FormCambiarClave() {
  const [estado, accion, pendiente] = useActionState(accionCambiarClavePrestador, null);
  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nueva contraseña
        <input name="nueva" type="password" required minLength={8} autoComplete="new-password" className="input" placeholder="Mínimo 8 caracteres" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Confirmar contraseña
        <input name="confirmar" type="password" required minLength={8} autoComplete="new-password" className="input" />
      </label>
      {estado && !estado.ok && <p className="text-sm text-red-600">{estado.mensaje}</p>}
      <button className="boton py-2.5" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar y continuar'}</button>
    </form>
  );
}
