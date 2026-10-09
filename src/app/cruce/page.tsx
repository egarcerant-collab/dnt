import { redirect } from 'next/navigation';
import { CruceSeguimiento } from '@/components/cruce-seguimiento';
import { Encabezado } from '@/components/encabezado';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Cruce() {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) redirect('/');
  const base = await obtenerBase();

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Cruce de bases</h1>
          <p className="text-sm text-slate-600">
            Sube una base externa de seguimiento (por ejemplo SeguimientoDNT) para saber qué niños faltan en Nutria ({base.casos.length} niños) y cuáles de
            Nutria no aparecen en esa base.
          </p>
        </div>
        <CruceSeguimiento />
      </main>
    </>
  );
}
