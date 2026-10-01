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
  const conMasCasos = listaIps.reduce((a, b) =>
    base.casos.filter(c => c.ipsSeguimiento === b).length > base.casos.filter(c => c.ipsSeguimiento === a).length ? b : a);
  const ips = sesion.rol === 'prestador' ? sesion.ips : ((await searchParams).ips ?? conMasCasos);
  const filas = base.casos.filter(c => c.ipsSeguimiento === ips).map(aFila);
  const pendientes = sesion.rol === 'prestador' ? noLeidos(await listarMensajes(), 'prestador', sesion.ips).length : 0;

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
        {sesion.rol === 'admin' && <SelectorIps opciones={listaIps} valor={ips!} />}
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
