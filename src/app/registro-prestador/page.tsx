import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormContacto } from '@/components/form-contacto';
import { listarPrestadores } from '@/lib/prestadores';
import { getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

/** Pre-registro obligatorio del prestador (el administrador también puede editarlo con ?ips=). */
export default async function RegistroPrestador({ searchParams }: { searchParams: Promise<{ ips?: string }> }) {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.rol !== 'prestador' && sesion.rol !== 'admin') redirect('/epsi');
  const ips = sesion.rol === 'prestador' ? sesion.ips! : (await searchParams).ips;
  if (!ips) redirect('/admin');
  const p = (await listarPrestadores()).find(x => x.ips === ips);
  if (!p) redirect('/');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border-2 border-marca-600 bg-white shadow-lg">
        <div className="bg-marca-700 px-6 py-5 text-white">
          <h1 className="text-lg font-bold">{p.contacto ? 'Datos de contacto de la IPS' : 'Pre-registro del prestador'}</h1>
          <p className="text-sm text-white/85">{ips}</p>
        </div>
        <div className="flex flex-col gap-4 px-6 py-6">
          {!p.contacto && sesion.rol === 'prestador' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Antes de ingresar al módulo, registra el responsable y los medios de contacto de tu IPS. Es necesario para recibir notificaciones e informes de la EPSI.
            </p>
          )}
          <FormContacto ips={ips} inicial={p.contacto} esAdmin={sesion.rol === 'admin'} />
          <Link href={sesion.rol === 'admin' ? '/admin' : '/prestador'} className="text-center text-sm text-marca-700 hover:underline">
            {sesion.rol === 'admin' ? '← Volver a Administración' : p.contacto ? '← Volver a mis niños' : ''}
          </Link>
        </div>
      </div>
    </main>
  );
}
