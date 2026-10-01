import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { PanelPrestador } from '@/components/panel-prestador';
import { SelectorIps } from '@/components/selector-ips';
import Link from 'next/link';
import { listarMensajes, noLeidos } from '@/lib/dnt/mensajes';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { aFila } from '@/lib/dnt/filas';
import { getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function VistaPrestador({ searchParams }: { searchParams: Promise<{ ips?: string }> }) {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.rol === 'epsi') redirect('/epsi');
  if (sesion.debeCambiarClave) redirect('/cambiar-clave');

  const base = await obtenerBase();
  const listaIps = [...new Set(base.casos.map(c => c.ipsSeguimiento))].sort();
  // El prestador solo ve su IPS; el administrador elige cualquiera
  const casosPorIps = new Map<string, number>();
  base.casos.forEach(c => casosPorIps.set(c.ipsSeguimiento, (casosPorIps.get(c.ipsSeguimiento) ?? 0) + 1));
  const conMasCasos = listaIps.reduce<string | undefined>((a, b) => (!a || (casosPorIps.get(b) ?? 0) > (casosPorIps.get(a) ?? 0) ? b : a), undefined);
  const ips = sesion.rol === 'prestador' ? sesion.ips : ((await searchParams).ips ?? conMasCasos);
  const filas = base.casos.filter(c => c.ipsSeguimiento === ips).map(aFila);
  const pendientes = sesion.rol === 'prestador' ? noLeidos(await listarMensajes(), 'prestador', sesion.ips).length : 0;

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
        {!base.baseDisponible && (
          <p className="tarjeta border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Todavía no hay una base de seguimiento cargada. El administrador debe cargar el Excel en <b>Administración → Base de seguimiento DNT</b>.
          </p>
        )}
        {sesion.rol === 'admin' && <SelectorIps opciones={listaIps} valor={ips!} />}
        {sesion.usaNit && (
          <Link href="/cambiar-clave" className="tarjeta flex items-center justify-between border-marca-100 bg-marca-50 p-3 text-sm text-marca-900">
            <span>Ingresaste con el NIT. Te recomendamos crear una contraseña personal.</span>
            <span className="font-semibold">Crear contraseña →</span>
          </Link>
        )}
        {pendientes > 0 && (
          <Link href="/notificaciones" className="tarjeta flex items-center justify-between border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span>Tienes <b>{pendientes}</b> notificación(es) o pregunta(s) de la EPSI sin leer.</span>
            <span className="font-semibold">Ver →</span>
          </Link>
        )}
        <PanelPrestador filas={filas} fechaCorte={base.fechaCorte} />
      </main>
    </>
  );
}
