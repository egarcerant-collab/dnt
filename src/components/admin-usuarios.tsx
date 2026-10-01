'use client';

import { useActionState, useState } from 'react';
import { accionActualizarUsuario, accionCrearUsuario, type EstadoAccion } from '@/app/acciones';

function Mensaje({ estado }: { estado: EstadoAccion }) {
  if (!estado) return null;
  return <span className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</span>;
}

export function FormNuevoUsuario() {
  const [estado, accion, pendiente] = useActionState(accionCrearUsuario, null);
  const [rol, setRol] = useState('epsi');

  return (
    <form action={accion} className="tarjeta flex flex-col gap-4 p-4">
      <h2 className="font-semibold">Crear usuario</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">Usuario<input name="usuario" required className="input" placeholder="ej: jperez" /></label>
        <label className="flex flex-col gap-1 text-sm">Nombre completo<input name="nombre" required className="input" /></label>
        <label className="flex flex-col gap-1 text-sm">
          Rol
          <select name="rol" value={rol} onChange={e => setRol(e.target.value)} className="input">
            <option value="epsi">Funcionario EPSI</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Contraseña<input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" placeholder="Mínimo 8 caracteres" /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className="boton" disabled={pendiente}>{pendiente ? 'Creando…' : 'Crear usuario'}</button>
        <Mensaje estado={estado} />
      </div>
    </form>
  );
}

export function AccionesUsuario({ id, activo, esYo }: { id: string; activo: boolean; esYo: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionActualizarUsuario, null);
  const [cambiarClave, setCambiarClave] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!esYo && (
        <form action={accion}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="activo" value={String(!activo)} />
          <button className="boton-sec" disabled={pendiente}>{activo ? 'Desactivar' : 'Activar'}</button>
        </form>
      )}
      {cambiarClave ? (
        <form action={accion} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input w-40" placeholder="Nueva contraseña" />
          <button className="boton" disabled={pendiente}>Guardar</button>
          <button type="button" className="boton-sec" onClick={() => setCambiarClave(false)}>Cancelar</button>
        </form>
      ) : (
        <button className="boton-sec" onClick={() => setCambiarClave(true)}>Cambiar contraseña</button>
      )}
      <Mensaje estado={estado} />
    </div>
  );
}
