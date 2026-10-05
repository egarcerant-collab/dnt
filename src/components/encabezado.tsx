import Link from 'next/link';
import { cerrarSesion } from '@/app/acciones';
import { listarMensajes, noLeidos } from '@/lib/dnt/mensajes';
import { esEpsi, rutaInicio, type Sesion } from '@/lib/sesion';
import { formatoFecha } from './ui';

const ETIQUETA_ROL = { admin: 'Administrador', epsi: 'Funcionario EPSI', prestador: 'Prestador' } as const;

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="relative rounded-md px-3 py-1.5 hover:bg-white/10">{children}</Link>;
}

export async function Encabezado({ sesion, fechaCorte, almacenamiento }: { sesion: Sesion; fechaCorte: string; almacenamiento: string }) {
  const pendientes = noLeidos(await listarMensajes(), sesion.rol, sesion.ips).length;

  return (
    <header className="bg-marca-700 text-white shadow">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href={rutaInicio(sesion.rol)} className="flex items-center gap-3">
          <img src="/nutria.svg" alt="" className="h-10 w-10 rounded-full bg-white p-0.5" />
          <span className="flex flex-col">
            <span className="text-lg font-bold">Nutria <span className="text-sm font-normal text-white/80">· Monitoreo de Desnutrición</span></span>
            <span className="text-xs text-white/80">
              {ETIQUETA_ROL[sesion.rol]}
              {sesion.ips ? ` · ${sesion.ips}` : ''} · Corte {formatoFecha(fechaCorte)} · Datos: {almacenamiento === 'drive' ? 'Google Drive' : 'local'}
            </span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {esEpsi(sesion.rol) ? <Enlace href="/epsi">Indicadores</Enlace> : <Enlace href="/prestador">Mis niños</Enlace>}
          {esEpsi(sesion.rol) && <Enlace href="/seguimiento">Seguimiento</Enlace>}
          <Enlace href="/notificaciones">
            Notificaciones
            {pendientes > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold">{pendientes}</span>
            )}
          </Enlace>
          {sesion.rol === 'admin' && (
            <>
              <Enlace href="/prestador">Módulo prestador</Enlace>
              <Enlace href="/admin">Administración</Enlace>
            </>
          )}
          {sesion.rol === 'prestador' && (
            <>
              <Enlace href="/registro-prestador">Mis datos</Enlace>
              <Enlace href="/cambiar-clave">Contraseña</Enlace>
            </>
          )}
          <span className="ml-2 hidden text-white/90 md:inline">{sesion.nombre}</span>
          <form action={cerrarSesion}>
            <button className="ml-2 rounded-lg border border-white/40 px-3 py-1.5 hover:bg-white/10">Salir</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
