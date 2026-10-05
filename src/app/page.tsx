import { redirect } from 'next/navigation';
import { FormIngreso } from '@/components/ingreso';
import { listarPrestadores } from '@/lib/prestadores';
import { getSesion, rutaInicio } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Ingreso({ searchParams }: { searchParams: Promise<{ error?: string; modo?: string }> }) {
  const sesion = await getSesion();
  if (sesion) redirect(sesion.debeCambiarClave ? '/cambiar-clave' : rutaInicio(sesion.rol));
  const { error, modo } = await searchParams;
  const prestadores = (await listarPrestadores()).filter(p => p.activo).map(p => p.ips);

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
        <FormIngreso prestadores={prestadores} error={error} pestanaInicial={modo === 'prestador' ? 'prestador' : 'epsi'} />
        <p className="max-w-md text-center text-xs text-slate-500">
          Dirección Nacional de Gestión del Riesgo en Salud · Dusakawi EPSI
          <br />
          Información con reserva legal (Ley 1581/2012 · Res. 1995/1999).
        </p>
      </main>
    </div>
  );
}
