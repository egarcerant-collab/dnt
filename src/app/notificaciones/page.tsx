import { faltaPreregistro } from '@/lib/prestadores';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { FormMensaje, HiloMensajes } from '@/components/mensajes';
import { listarMensajes, marcarLeidos, type Mensaje } from '@/lib/dnt/mensajes';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';
import { AccionesContactoIps, EnviarInformeTodas } from '@/components/contacto-ips';
import { REMITENTE, correoConfigurado, listarCorreosEnviados } from '@/lib/correo';
import { resumenesPorIps, textoWhatsApp } from '@/lib/dnt/informe-ips';
import { listarPrestadores } from '@/lib/prestadores';

export const dynamic = 'force-dynamic';

export default async function Notificaciones() {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.debeCambiarClave) redirect('/cambiar-clave');
  if (sesion.rol === 'prestador' && (await faltaPreregistro(sesion.ips))) redirect('/registro-prestador');

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

  // Correo electrónico (solo EPSI): contactos de las IPS, informes e historial de envíos
  const [prestadores, resumenes, enviados] = epsi
    ? await Promise.all([listarPrestadores(), resumenesPorIps(), listarCorreosEnviados()])
    : [[], new Map(), []];
  const ultimoEnvio = (correos: string[]) => enviados.find(e => e.para.some(p => correos.includes(p)));
  const conCorreo = prestadores.filter(p => p.contacto?.correos.length).length;

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-marca-900">Notificaciones</h1>

        {epsi && (
          <div className={`tarjeta flex flex-wrap items-center justify-between gap-3 p-4 text-sm ${correoConfigurado() ? 'border-marca-100 bg-marca-50' : 'border-amber-300 bg-amber-50'}`}>
            <span>
              {correoConfigurado() ? (
                <>✉ <b>Correo activo.</b> Las notificaciones salen desde <b>{REMITENTE}</b>. Informe automático: lunes 8:00 a. m. · {conCorreo} de {prestadores.length} IPS con correo registrado.</>
              ) : (
                <>✉ <b>Correo no configurado.</b> Falta SMTP_USER / SMTP_PASS en el servidor; las notificaciones solo se ven dentro de la app.</>
              )}
            </span>
            <EnviarInformeTodas />
          </div>
        )}

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

        {epsi && (
          <section className="tarjeta overflow-x-auto">
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-semibold">Correo electrónico y WhatsApp a prestadores</h2>
              <p className="text-sm text-slate-500">Los mensajes llevan solo cifras y el enlace a la app; nunca datos de los niños.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
                <tr><th className="px-3 py-2">Prestador</th><th className="px-3 py-2">Último correo</th><th className="px-3 py-2">Contacto y envío</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prestadores.filter(p => p.activo).map(p => {
                  const ultimo = p.contacto ? ultimoEnvio(p.contacto.correos) : undefined;
                  const r = resumenes.get(p.ips);
                  return (
                    <tr key={p.ips} className="align-top">
                      <td className="px-3 py-2"><b>{p.ips}</b>{r && <span className="block text-xs text-slate-500">{r.activos} activos · {r.controlVencido + r.sinControl4} con control pendiente</span>}</td>
                      <td className="px-3 py-2 text-xs">
                        {ultimo ? (
                          <>
                            {new Date(ultimo.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}
                            <span className={`block font-semibold ${ultimo.ok ? 'text-marca-700' : 'text-red-600'}`}>{ultimo.ok ? 'Enviado' : 'Falló'}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">Nunca</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <AccionesContactoIps
                          ips={p.ips}
                          contacto={p.contacto && { responsable: p.contacto.responsable, correos: p.contacto.correos, whatsapp: p.contacto.whatsapp }}
                          textoWhatsApp={r ? textoWhatsApp(r) : ''}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {epsi && (
          <section className="tarjeta overflow-x-auto">
            <h2 className="border-b border-slate-100 p-4 font-semibold">Historial de correos enviados ({enviados.length})</h2>
            {enviados.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Todavía no se ha enviado ningún correo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Para</th><th className="px-3 py-2">Asunto</th><th className="px-3 py-2">Resultado</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enviados.slice(0, 100).map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(e.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-3 py-2 text-xs">{e.para.join(', ')}</td>
                      <td className="px-3 py-2 text-xs">{e.asunto}</td>
                      <td className="px-3 py-2 text-xs">{e.ok ? <span className="font-semibold text-marca-700">Enviado</span> : <span className="text-red-600">Falló: {e.motivo}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>
    </>
  );
}
