import { redirect } from 'next/navigation';
import { accionQuitarFirma } from '@/app/acciones';
import { Encabezado } from '@/components/encabezado';
import { FormFirma } from '@/components/form-firma';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';
import { listarUsuarios } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

export default async function MiFirma() {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) redirect('/');
  const [base, usuarios] = await Promise.all([obtenerBase(), listarUsuarios()]);
  const u = usuarios.find(x => x.id === sesion.id);

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Mi firma</h1>
          <p className="text-sm text-slate-600">
            Tu firma se imprime al final de los informes PDF que generes en Nutria, con tu nombre ({sesion.nombre}), cargo y Dusakawi EPSI.
          </p>
        </div>
        {u?.firma && (
          <section className="tarjeta flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-4">
              <img src={`/api/firma?v=${encodeURIComponent(u.firma.actualizada)}`} alt="Tu firma registrada"
                className="h-20 w-48 rounded border border-slate-200 bg-white object-contain p-1" />
              <div className="text-sm">
                <p className="font-semibold">{sesion.nombre.toUpperCase()}</p>
                <p>{u.firma.cargo}</p>
                <p className="text-xs text-slate-500">
                  {u.firma.compartida ? 'Compartida con otros funcionarios' : 'Solo la usas tú'} · actualizada{' '}
                  {new Date(u.firma.actualizada).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
                </p>
              </div>
            </div>
            <form action={accionQuitarFirma}>
              <button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Quitar mi firma</button>
            </form>
          </section>
        )}
        <section className="tarjeta p-4">
          <FormFirma cargo={u?.firma?.cargo ?? u?.cargo ?? ''} compartida={u?.firma?.compartida ?? false} tieneFirma={!!u?.firma} />
        </section>
      </main>
    </>
  );
}
