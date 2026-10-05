import { redirect } from 'next/navigation';
import { TablaPrestadores } from '@/components/admin-prestadores';
import { CargarBase } from '@/components/cargar-base';
import { AdminRespaldos } from '@/components/admin-respaldos';
import { RestaurarCaso } from '@/components/gestion-caso';
import { DESTINO_RESPALDO } from '@/lib/respaldo';
import { SolicitudesRegistro } from '@/components/admin-solicitudes';
import { FormNuevoUsuario, AccionesUsuario } from '@/components/admin-usuarios';
import { aPublico, listarPrestadores } from '@/lib/prestadores';
import { REMITENTE, correoConfigurado } from '@/lib/correo';
import { resumenesPorIps, textoWhatsApp } from '@/lib/dnt/informe-ips';
import { Encabezado } from '@/components/encabezado';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { getSesion } from '@/lib/sesion';
import { esSuperusuario, listarUsuarios, sinHash } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

const ETIQUETA = { admin: 'Administrador', epsi: 'Funcionario EPSI', prestador: 'Prestador' } as const;

export default async function Administracion() {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.rol !== 'admin') redirect('/');

  const [base, usuarios, prestadores, resumenes] = await Promise.all([obtenerBase(), listarUsuarios(), listarPrestadores(), resumenesPorIps()]);
  const casosPorIps = new Map<string, number>();
  base.casos.forEach(c => casosPorIps.set(c.ipsSeguimiento, (casosPorIps.get(c.ipsSeguimiento) ?? 0) + 1));
  const solicitudes = usuarios.filter(u => u.pendiente).map(u => ({ id: u.id, nombre: u.nombre, correo: u.correo ?? u.usuario, cargo: u.cargo ?? '', creadoEn: u.creadoEn }));
  const activos = usuarios.filter(u => !u.pendiente);
  const soySuperusuario = esSuperusuario(sesion.usuario);
  const filasPrestadores = prestadores.map(aPublico).map(p => ({
    ...p,
    casos: casosPorIps.get(p.ips) ?? 0,
    contacto: p.contacto && { responsable: p.contacto.responsable, correos: p.contacto.correos, whatsapp: p.contacto.whatsapp },
    textoWhatsApp: resumenes.get(p.ips) ? textoWhatsApp(resumenes.get(p.ips)!) : '',
  }));

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-marca-900">Administración</h1>
        <SolicitudesRegistro solicitudes={solicitudes} soySuperusuario={soySuperusuario} />
        <CargarBase origen={base.origenBase} casos={base.casos.length} almacenamiento={base.almacenamiento} />
        <AdminRespaldos destino={DESTINO_RESPALDO} cifrado={!!process.env.BACKUP_PASSWORD} />
        <TablaPrestadores prestadores={filasPrestadores} correo={{ configurado: correoConfigurado(), remitente: REMITENTE }} />
        {base.eliminados.length > 0 && (
          <section className="tarjeta overflow-x-auto">
            <h2 className="border-b border-slate-100 p-4 font-semibold">Registros eliminados ({base.eliminados.length})</h2>
            <table className="w-full text-sm">
              <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
                <tr><th className="px-3 py-2">Niño</th><th className="px-3 py-2">IPS</th><th className="px-3 py-2">Motivo</th><th className="px-3 py-2">Eliminado por</th><th className="px-3 py-2">Restaurar</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {base.eliminados.map(e => (
                  <tr key={e.id}>
                    <td className="px-3 py-2"><b>{e.nombre}</b><br /><span className="text-xs text-slate-500">{e.documento}</span></td>
                    <td className="px-3 py-2 text-xs">{e.ips}</td>
                    <td className="px-3 py-2 text-xs">{e.motivo}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{e.por}<br />{new Date(e.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
                    <td className="px-3 py-2"><RestaurarCaso id={e.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <h2 className="mt-2 text-lg font-semibold text-marca-900">Usuarios EPSI</h2>
        <FormNuevoUsuario soySuperusuario={soySuperusuario} />

        <section className="tarjeta overflow-x-auto">
          <h2 className="border-b border-slate-100 p-4 font-semibold">Usuarios registrados ({activos.length})</h2>
          <table className="w-full text-sm">
            <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
              <tr>
                <th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">IPS</th><th className="px-3 py-2">Creado</th><th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activos.map(sinHash).map(u => (
                <tr key={u.id}>
                  <td className="px-3 py-2 font-mono">{u.usuario}</td>
                  <td className="px-3 py-2">{u.nombre}</td>
                  <td className="px-3 py-2">
                    {esSuperusuario(u.usuario) ? (
                      <span className="rounded-full bg-marca-700 px-2 py-0.5 text-xs font-semibold text-white">Superusuario</span>
                    ) : (
                      ETIQUETA[u.rol]
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{u.ips ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(u.creadoEn).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.activo ? 'bg-marca-100 text-marca-800' : 'bg-slate-200 text-slate-600'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2"><AccionesUsuario id={u.id} activo={u.activo} rol={u.rol}
                    permisos={{ esSuper: esSuperusuario(u.usuario), soySuperusuario, esYo: u.id === sesion.id }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
