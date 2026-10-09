import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { PanelPreregistro } from '@/components/preregistro';
import { leerPreregistro } from '@/lib/dnt/preregistro';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Preregistro() {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) redirect('/');
  const [base, pre] = await Promise.all([obtenerBase(), leerPreregistro()]);
  const ips = [...new Set(base.casos.map(c => c.ipsSeguimiento).filter(i => i && i !== 'SIN IPS ASIGNADA'))].sort();

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Pre-registro</h1>
          <p className="text-sm text-slate-600">
            Niños de bases externas que faltan en Nutria ({base.casos.length} niños en la base). Se revisan aquí con todos los datos del archivo; al
            verificarlos se les asigna la IPS de seguimiento y luego se incorporan a la base.
          </p>
        </div>
        <PanelPreregistro registros={Object.values(pre.registros)} cargues={pre.cargues} ips={ips} />
      </main>
    </>
  );
}
