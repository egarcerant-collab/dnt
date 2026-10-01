import { redirect } from 'next/navigation';
import { FormCambiarClave } from '@/components/cambiar-clave';
import { getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function CambiarClave() {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.rol !== 'prestador') redirect('/epsi');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-marca-600 bg-white shadow-lg">
        <div className="bg-marca-700 px-6 py-5 text-white">
          <h1 className="text-lg font-bold">Crea tu contraseña</h1>
          <p className="text-sm text-white/85">{sesion.ips}</p>
        </div>
        <div className="flex flex-col gap-4 px-8 py-6">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {sesion.debeCambiarClave
              ? 'Ingresaste con el NIT. Como el NIT es un dato público, debes crear una contraseña personal para proteger la información de los niños.'
              : 'Cambia la contraseña de acceso de tu IPS.'}
          </p>
          <FormCambiarClave />
        </div>
      </div>
    </main>
  );
}
