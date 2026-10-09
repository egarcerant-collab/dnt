import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { ModuloCruce } from '@/components/modulo-cruce';
import { leerPreregistro, sugerirIps } from '@/lib/dnt/preregistro';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Cruce({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) redirect('/');
  const [base, pre, { vista }] = await Promise.all([obtenerBase(), leerPreregistro(), searchParams]);
  const ips = [...new Set(base.casos.map(c => c.ipsSeguimiento).filter(i => i && i !== 'SIN IPS ASIGNADA'))].sort();

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Cruce de bases y pre-registro</h1>
          <p className="text-sm text-slate-600">
            Suba una base externa (por ejemplo SeguimientoDNT) para ver qué niños faltan en Nutria ({base.casos.length} niños). Los faltantes se
            registran como un cargue en el pre-registro, donde se verifican con todos sus datos antes de incorporarlos a la base.
          </p>
        </div>
        <ModuloCruce sugerencias={sugerirIps(Object.values(pre.registros).filter(r => r.estado !== 'incorporado'), base.casos)} registros={Object.values(pre.registros)} cargues={pre.cargues} ips={ips} inicial={vista === 'pre' ? 'pre' : 'cruce'} />
      </main>
    </>
  );
}
