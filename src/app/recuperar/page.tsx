import { FormSolicitarRecuperacion } from '@/components/form-recuperar';
import { NOMBRE_PRESTADOR, type PrestadorRed } from '@/lib/dnt/asignacion';
import { listarPrestadores } from '@/lib/prestadores';

export const dynamic = 'force-dynamic';

export default async function Recuperar({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const { modo } = await searchParams;
  const prestadores = (await listarPrestadores())
    .filter(p => p.activo)
    .map(p => ({ ips: p.ips, nombre: NOMBRE_PRESTADOR[p.ips as PrestadorRed] ?? p.ips }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-marca-600 bg-white shadow-lg">
        <div className="bg-marca-700 px-6 py-5 text-white">
          <h1 className="text-lg font-bold">Recuperar contraseña</h1>
          <p className="text-sm text-white/85">Nutria · Monitoreo de Desnutrición</p>
        </div>
        <div className="flex flex-col gap-4 px-8 py-6">
          <FormSolicitarRecuperacion modo={modo === 'prestador' ? 'prestador' : 'epsi'} prestadores={prestadores} />
          <a href={`/?modo=${modo === 'prestador' ? 'prestador' : 'epsi'}`} className="text-center text-sm text-marca-700 hover:underline">← Volver al ingreso</a>
        </div>
      </div>
    </main>
  );
}
