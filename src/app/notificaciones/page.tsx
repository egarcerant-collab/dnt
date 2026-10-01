import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { FormMensaje, HiloMensajes } from '@/components/mensajes';
import { listarMensajes, marcarLeidos, type Mensaje } from '@/lib/dnt/mensajes';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Notificaciones() {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.debeCambiarClave) redirect('/cambiar-clave');

  const base = await obtenerBase();
  const epsi = esEpsi(sesion.rol);
  // Los generales del prestador se marcan leídos al abrir esta página
  if (!epsi) await marcarLeidos('prestador', { ips: sesion.ips });

  const todos = (await listarMensajes()).filter(m => epsi || m.ips === sesion.ips);
  const nombres = new Map(base.casos.map(c => [c.id, c.nombre]));
  const generales = todos.filter(m => m.casoId === null).sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Conversaciones por niño, con las pendientes de este rol primero
  const porCaso = new Map<string, Mensaje[]>();
  for (const m of todos) if (m.casoId) porCaso.set(m.casoId, [...(porCaso.get(m.casoId) ?? []), m]);
  const pendiente = (m: Mensaje) => (epsi ? !m.leidoEpsi : !m.leidoPrestador);
  const hilos = [...porCaso.entries()]
    .map(([casoId, ms]) => ({ casoId, ms, pendientes: ms.filter(pendiente).length, ultimo: ms[ms.length - 1] }))
    .sort((a, b) => b.pendientes - a.pendientes || b.ultimo.fecha.localeCompare(a.ultimo.fecha));

  const listaIps = [...new Set(base.casos.map(c => c.ipsSeguimiento))].sort();

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-marca-900">Notificaciones</h1>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="tarjeta flex flex-col gap-3 p-4">
            <h2 className="font-semibold">{epsi ? 'Notificación general a un prestador' : 'Notificaciones generales de la EPSI'}</h2>
            {epsi ? (
              <FormMensaje esPrestador={false} opcionesIps={listaIps} />
            ) : (
              <HiloMensajes mensajes={[...generales].reverse()} />
            )}
            {epsi && generales.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-marca-700">Ver notificaciones generales enviadas ({generales.length})</summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {generales.map(m => (
                    <li key={m.id} className="rounded-lg border border-slate-200 p-2">
                      <b>{m.ips}</b> · {new Date(m.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                      <p className="whitespace-pre-wrap text-slate-700">{m.texto}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="tarjeta p-4">
            <h2 className="mb-3 font-semibold">Conversaciones por niño ({hilos.length})</h2>
            {hilos.length === 0 && <p className="text-sm text-slate-500">No hay conversaciones.</p>}
            <ul className="divide-y divide-slate-100">
              {hilos.map(h => (
                <li key={h.casoId} className="py-2">
                  <Link href={`/caso/${encodeURIComponent(h.casoId)}`} className="flex items-start justify-between gap-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <b className="block text-marca-800">{nombres.get(h.casoId) ?? h.casoId}</b>
                      <span className="block text-xs text-slate-500">{h.ultimo.ips}</span>
                      <span className="line-clamp-1 text-sm text-slate-700">{h.ultimo.texto}</span>
                    </span>
                    {h.pendientes > 0 && <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{h.pendientes} nuevo{h.pendientes > 1 ? 's' : ''}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
