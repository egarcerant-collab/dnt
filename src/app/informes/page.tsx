import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { firmantesDisponibles } from '@/lib/firmas';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Informes() {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) redirect('/');
  const [base, firmantes] = await Promise.all([obtenerBase(), firmantesDisponibles(sesion.id)]);
  const conteo = new Map<string, number>();
  base.casos.forEach(c => conteo.set(c.ipsSeguimiento, (conteo.get(c.ipsSeguimiento) ?? 0) + 1));
  const ips = [...conteo.keys()].filter(Boolean).sort();
  const propia = firmantes.find(f => f.id === sesion.id);

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Informes PDF</h1>
          <p className="text-sm text-slate-600">
            Oficio en hoja A4 con el membrete institucional (COM-FT-03), el resumen del seguimiento y las firmas seleccionadas al final.
          </p>
        </div>
        {!propia && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aún no has registrado tu firma. <Link href="/mi-firma" className="font-semibold underline">Regístrala aquí</Link> para que aparezca en tus informes.
          </p>
        )}
        <form action="/api/informes/pdf" method="get" target="_blank" className="tarjeta flex flex-col gap-5 p-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Informe para</span>
            <select name="ips" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Consolidado de la red (todas las IPS)</option>
              {ips.map(i => <option key={i} value={i}>{i} ({conteo.get(i)} niños)</option>)}
            </select>
            <span className="text-xs text-slate-500">
              El informe de una IPS incluye el listado nominal de niños que requieren gestión. El consolidado solo trae cifras por IPS.
            </span>
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-medium">Firmas al final del informe (máximo 3)</legend>
            {firmantes.length === 0 && <p className="text-slate-500">No hay firmas disponibles. El informe saldrá con la línea de firma en blanco.</p>}
            {firmantes.map(f => (
              <label key={f.id} className="flex items-center gap-2">
                <input type="checkbox" name="firmante" value={f.id} defaultChecked={f.id === sesion.id} />
                <span><b>{f.nombre}</b> · {f.firma.cargo}{f.id === sesion.id ? ' (tú)' : ''}</span>
              </label>
            ))}
          </fieldset>
          <button className="boton w-fit">Generar PDF</button>
          <p className="text-xs text-slate-500">
            Cada informe generado queda registrado en la auditoría (usuario, fecha, IPS y firmas). Contiene datos de menores: compártalo solo por canales institucionales.
          </p>
        </form>
      </main>
    </>
  );
}
