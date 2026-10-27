import { redirect } from 'next/navigation';
import { NOMBRE_PRESTADOR, type PrestadorRed } from '@/lib/dnt/asignacion';
import { FormIngreso } from '@/components/ingreso';
import { listarPrestadores } from '@/lib/prestadores';
import { getSesion, rutaInicio } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Ingreso({ searchParams }: { searchParams: Promise<{ error?: string; modo?: string; clave?: string }> }) {
  const sesion = await getSesion();
  if (sesion) redirect(sesion.debeCambiarClave ? '/cambiar-clave' : rutaInicio(sesion.rol));
  const { error, modo, clave } = await searchParams;
  // Nombre para mostrar de la red vigente (Dusakawi IPSI, Fundación Suma…); el valor sigue siendo el nombre canónico
  const prestadores = (await listarPrestadores())
    .filter(p => p.activo)
    .map(p => ({ ips: p.ips, nombre: NOMBRE_PRESTADOR[p.ips as PrestadorRed] ?? p.ips }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-marca-600 text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <img src="/nutria.svg" alt="" className="h-11 w-11 rounded-full bg-white p-0.5 shadow" />
          <span className="flex flex-col leading-tight">
            <span className="text-xl font-bold tracking-wide">Nutria</span>
            <span className="text-xs text-white/85">Monitoreo de Desnutrición · Dusakawi EPSI</span>
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
        {clave === 'actualizada' && (
          <p className="w-full max-w-md rounded-lg border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-900">
            ✓ Contraseña actualizada. Ya puedes ingresar con tu nueva contraseña.
          </p>
        )}
        <FormIngreso prestadores={prestadores} error={error} pestanaInicial={modo === 'prestador' ? 'prestador' : 'epsi'} />
      </main>
    </div>
  );
}
