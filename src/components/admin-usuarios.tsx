'use client';

import { useActionState, useState } from 'react';
import { accionActualizarUsuario, accionCrearUsuario, type EstadoAccion } from '@/app/acciones';

function Mensaje({ estado }: { estado: EstadoAccion }) {
  if (!estado) return null;
  return <span className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</span>;
}

/** Solo el superusuario puede crear administradores. */
export function FormNuevoUsuario({ soySuperusuario }: { soySuperusuario: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionCrearUsuario, null);

  return (
    <form action={accion} className="tarjeta flex flex-col gap-4 p-4">
      <h2 className="font-semibold">Crear usuario</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">Usuario<input name="usuario" required className="input" placeholder="ej: jperez" /></label>
        <label className="flex flex-col gap-1 text-sm">Nombre completo<input name="nombre" required className="input" /></label>
        <label className="flex flex-col gap-1 text-sm">
          Rol
          <select name="rol" defaultValue="epsi" className="input">
            <option value="epsi">Funcionario EPSI</option>
            {soySuperusuario && <option value="admin">Administrador</option>}
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

export interface PermisosFila {
  /** El usuario de la fila es el superusuario (no se desactiva ni cambia de rol). */
  esSuper: boolean;
  /** Quien está en sesión es el superusuario. */
  soySuperusuario: boolean;
  esYo: boolean;
}

export function AccionesUsuario({ id, activo, rol, permisos }: { id: string; activo: boolean; rol: 'admin' | 'epsi' | 'prestador'; permisos: PermisosFila }) {
  const [estado, accion, pendiente] = useActionState(accionActualizarUsuario, null);
  const [cambiarClave, setCambiarClave] = useState(false);
  const { esSuper, soySuperusuario, esYo } = permisos;

  // Un administrador común solo gestiona funcionarios EPSI (y su propia contraseña)
  const puedeEditar = soySuperusuario || rol !== 'admin' || esYo;
  const puedeCambiarRol = soySuperusuario && !esSuper;
  const puedeActivar = !esYo && !esSuper && (soySuperusuario || rol !== 'admin');
  const puedeClave = esSuper ? esYo : puedeEditar;

  if (!puedeEditar && !puedeCambiarRol) return <span className="text-xs text-slate-400">Solo el superusuario</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {puedeCambiarRol && (
        <form action={accion} className="flex items-center gap-1">
          <input type="hidden" name="id" value={id} />
          <select name="rol" defaultValue={rol} className="input w-44 py-1.5" aria-label="Rol"
            onChange={e => e.currentTarget.form?.requestSubmit()} disabled={pendiente}>
            <option value="epsi">Funcionario EPSI</option>
            <option value="admin">Administrador</option>
          </select>
        </form>
      )}
      {puedeActivar && (
        <form action={accion}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="activo" value={String(!activo)} />
          <button className="boton-sec" disabled={pendiente}>{activo ? 'Desactivar' : 'Activar'}</button>
        </form>
      )}
      {puedeClave &&
        (cambiarClave ? (
          <form action={accion} className="flex items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input w-40" placeholder="Nueva contraseña" />
            <button className="boton" disabled={pendiente}>Guardar</button>
            <button type="button" className="boton-sec" onClick={() => setCambiarClave(false)}>Cancelar</button>
          </form>
        ) : (
          <button className="boton-sec" onClick={() => setCambiarClave(true)}>Cambiar contraseña</button>
        ))}
      <Mensaje estado={estado} />
    </div>
  );
}
