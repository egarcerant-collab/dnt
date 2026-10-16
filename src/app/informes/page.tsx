import Link from 'next/link';
import { redirect } from 'next/navigation';
import { accionQuitarFirma } from '@/app/acciones';
import { Encabezado } from '@/components/encabezado';
import { FormFirma } from '@/components/form-firma';
import { FormInforme } from '@/components/form-informe';
import { firmantesDisponibles } from '@/lib/firmas';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';
import { listarUsuarios } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

/** Informes PDF y firma en una sola pestaña: 1) generar el informe, 2) registrar la firma que va al final. */
export default async function Informes({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) redirect('/');
  const [base, firmantes, usuarios, { vista: v }] = await Promise.all([obtenerBase(), firmantesDisponibles(sesion.id), listarUsuarios(), searchParams]);
  const vista = v === 'firma' ? 'firma' : 'informe';
  const conteo = new Map<string, number>();
  base.casos.forEach(c => conteo.set(c.ipsSeguimiento, (conteo.get(c.ipsSeguimiento) ?? 0) + 1));
  const ips = [...conteo.keys()].filter(Boolean).sort();
  const propia = firmantes.find(f => f.id === sesion.id);
  const u = usuarios.find(x => x.id === sesion.id);
  // Departamento → municipios con número de niños, para el informe territorial
  const territorios: Record<string, { municipio: string; casos: number }[]> = {};
  const porMuni = new Map<string, number>();
  base.casos.forEach(c => porMuni.set(`${c.departamento}|${c.municipio}`, (porMuni.get(`${c.departamento}|${c.municipio}`) ?? 0) + 1));
  porMuni.forEach((n, k) => {
    const [d, m] = k.split('|');
    if (d && m) (territorios[d] ??= []).push({ municipio: m, casos: n });
  });
  Object.values(territorios).forEach(l => l.sort((a, b) => b.casos - a.casos));

  const pestanas = [
    ['informe', '1. Generar informe PDF', 'Oficio A4 con membrete y firmas'],
    ['firma', '2. Mi firma', propia ? 'Registrada ✓' : 'Pendiente de registrar'],
  ] as const;

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Informes PDF y firma</h1>
          <p className="text-sm text-slate-600">
            Oficio en hoja A4 con el membrete institucional (COM-FT-03), el resumen del seguimiento, la distribución poblacional y las firmas al final.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 border-b border-slate-200" aria-label="Vistas">
          {pestanas.map(([k, t, d]) => (
            <Link key={k} href={k === 'firma' ? '/informes?vista=firma' : '/informes'} scroll={false}
              className={`-mb-px flex flex-col rounded-t-lg border px-5 py-2 ${vista === k ? 'border-slate-200 border-b-white bg-white font-semibold text-marca-800' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
              <span>{t}</span>
              <span className={`text-xs font-normal ${k === 'firma' && !propia ? 'text-amber-700' : 'text-slate-500'}`}>{d}</span>
            </Link>
          ))}
        </nav>

        {vista === 'informe' ? (
          <>
            {!propia && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Aún no has registrado tu firma.{' '}
                <Link href="/informes?vista=firma" className="font-semibold underline">Regístrala en la vista 2. Mi firma</Link> para que aparezca en tus informes.
              </p>
            )}
            <FormInforme
              ips={ips.map(i => ({ nombre: i, casos: conteo.get(i) ?? 0 }))}
              territorios={territorios}
              firmantes={firmantes.map(f => ({ id: f.id, nombre: f.nombre, cargo: f.firma.cargo, propia: f.id === sesion.id }))}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Tu firma se imprime al final de los informes PDF que generes, con tu nombre ({sesion.nombre}), cargo y Dusakawi EPSI.
            </p>
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
            {propia && <Link href="/informes" className="boton w-fit">Ir a generar el informe →</Link>}
          </>
        )}
      </main>
    </>
  );
}
