import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { FormAtencionPrimaria, FormControl } from '@/components/form-control';
import { HistoriaClinica } from '@/components/historia-clinica';
import { FormMensaje, HiloMensajes } from '@/components/mensajes';
import { AlertaChip, EstadoBadge, SeveridadBadge, formatoFecha } from '@/components/ui';
import { BLOQUES_CONTROL } from '@/lib/dnt/excel-source';
import { listarHistorias } from '@/lib/dnt/historias';
import { listarMensajes, marcarLeidos } from '@/lib/dnt/mensajes';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { ALERTAS } from '@/lib/dnt/types';
import { getSesion, rutaInicio } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function DetalleCaso({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (sesion.debeCambiarClave) redirect('/cambiar-clave');

  const { id } = await params;
  const base = await obtenerBase();
  const caso = base.casos.find(c => c.id === decodeURIComponent(id));
  if (!caso) notFound();
  // Un prestador solo accede a los niños de su IPS
  if (sesion.rol === 'prestador' && caso.ipsSeguimiento !== sesion.ips) redirect('/prestador');

  const puedeRegistrar = sesion.rol === 'prestador' || sesion.rol === 'admin';
  const numeroSiguiente = caso.controles.length + 1;
  const conFechaFtlc = BLOQUES_CONTROL[numeroSiguiente - 1]?.[1] === 13;

  // Al abrir el caso se marcan como leídos los mensajes dirigidos a este rol
  await marcarLeidos(sesion.rol, { casoId: caso.id });
  const [mensajes, historias] = await Promise.all([
    listarMensajes().then(l => l.filter(m => m.casoId === caso.id)),
    listarHistorias(caso.id),
  ]);
  const serie = [
    { fecha: caso.fechaNotificacion, z: caso.zIngreso, etiqueta: 'Ingreso' },
    ...caso.controles.map(k => ({ fecha: k.fecha, z: k.zPesoTalla, etiqueta: `C${k.numero}` })),
  ].filter(p => p.z != null && Math.abs(p.z) < 8) as { fecha: string | null; z: number; etiqueta: string }[];

  const datos: Array<[string, string]> = [
    ['Documento', `${caso.tipoDocumento} ${caso.documento}`],
    ['Sexo / Edad', `${caso.sexo} · ${caso.edadMeses ?? '—'} meses`],
    ['Nacimiento', formatoFecha(caso.fechaNacimiento)],
    ['Etnia', caso.etnia || '—'],
    ['Residencia', `${caso.municipio}, ${caso.departamento}`],
    ['Asentamiento', caso.asentamiento || '—'],
    ['Teléfono', caso.telefono || '—'],
    ['IPS seguimiento', caso.ipsSeguimiento],
    ['Notificación', `${formatoFecha(caso.fechaNotificacion)} · SE ${caso.semanaEpi ?? '—'}`],
    ['SIVIGILA', caso.enSivigila ? `Cruza · condición final ${caso.condicionFinalSivigila === '2' ? 'muerto' : 'vivo'}` : 'No cruza'],
  ];
  const ingreso: Array<[string, string]> = [
    ['Clasificación', caso.clasificacionIngreso || '—'],
    ['Peso / Talla', `${caso.pesoIngreso ?? '—'} kg · ${caso.tallaIngreso ?? '—'} cm`],
    ['Z P/T', caso.zIngreso?.toFixed(2) ?? '—'],
    ['Edema', caso.edema || '—'],
    ['Perímetro braquial', caso.perimetroBraquial != null ? `${caso.perimetroBraquial} cm` : '—'],
    ['Entrega FTLC', formatoFecha(caso.fechaEntregaFtlc)],
    ['MIPRES FTLC', caso.mipresFtlc || '—'],
    ['Fecha recuperación', formatoFecha(caso.fechaRecuperacion)],
  ];

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={rutaInicio(sesion.rol)} className="text-sm text-marca-700 hover:underline">← Volver</Link>
            <h1 className="mt-1 text-2xl font-bold">{caso.nombre}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SeveridadBadge severidad={caso.severidad} />
              <EstadoBadge estado={caso.estado} />
              {caso.alertas.map(a => <AlertaChip key={a} tipo={a} />)}
            </div>
          </div>
        </div>

        {caso.alertas.length > 0 && (
          <div className="tarjeta border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-semibold text-amber-900">Acciones sugeridas</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
              {caso.alertas.map(a => <li key={a}><b>{ALERTAS[a].titulo}:</b> {ALERTAS[a].accion}</li>)}
            </ul>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="tarjeta p-4">
            <h2 className="mb-3 font-semibold">Datos del niño/a</h2>
            <Lista items={datos} />
          </section>
          <section className="tarjeta p-4">
            <h2 className="mb-3 font-semibold">Ingreso</h2>
            <Lista items={ingreso} />
          </section>
          <section className="tarjeta p-4">
            <h2 className="mb-3 font-semibold">Evolución Z peso/talla</h2>
            <GraficoZ serie={serie} />
          </section>
        </div>

        <section className="tarjeta overflow-x-auto">
          <h2 className="border-b border-slate-100 p-4 font-semibold">Controles ({caso.controles.length})</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Peso</th>
                <th className="px-3 py-2">Talla</th><th className="px-3 py-2">Z P/T</th><th className="px-3 py-2">Clasificación</th>
                <th className="px-3 py-2">Energía FTLC</th><th className="px-3 py-2">Medicamento</th>
                <th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Observaciones</th><th className="px-3 py-2">IPS / Profesional</th><th className="px-3 py-2">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {caso.controles.map(k => (
                <tr key={k.numero}>
                  <td className="px-3 py-2">{k.numero}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatoFecha(k.fecha)}</td>
                  <td className="px-3 py-2">{k.peso ?? '—'}</td>
                  <td className="px-3 py-2">{k.talla ?? '—'}</td>
                  <td className="px-3 py-2">{k.zPesoTalla?.toFixed(2) ?? '—'}</td>
                  <td className="px-3 py-2">{k.clasificacion || '—'}</td>
                  <td className="px-3 py-2 text-xs">{k.energia || '—'}</td>
                  <td className="px-3 py-2 text-xs">{k.medicamento || '—'}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-slate-600">{k.resultado || '—'}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-slate-600">{k.observaciones || '—'}</td>
                  <td className="px-3 py-2 text-xs">{k.ips || '—'}<span className="block text-slate-500">{k.profesional || k.registradoPor || ''}</span></td>
                  <td className="px-3 py-2 text-xs">{k.origen === 'app' ? 'App' : 'Excel'}</td>
                </tr>
              ))}
              {!caso.controles.length && <tr><td colSpan={12} className="px-3 py-8 text-center text-red-600">Sin controles registrados.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="tarjeta flex flex-col gap-3 p-4">
          <h2 className="font-semibold">Datos a diligenciar por el prestador</h2>
          {puedeRegistrar ? (
            <FormAtencionPrimaria casoId={caso.id} valor={caso.ipsAtencionPrimaria} />
          ) : (
            <p className="text-sm"><b>AX</b> · IPS / ESE de atención primaria: {caso.ipsAtencionPrimaria || <span className="text-amber-700">sin diligenciar</span>}</p>
          )}
        </section>

        {puedeRegistrar && (
          <FormControl
            casoId={caso.id}
            profesional={sesion.rol === 'prestador' ? '' : sesion.nombre}
            ips={caso.ipsSeguimiento}
            estadoActual={caso.estado}
            numeroSiguiente={numeroSiguiente}
            conFechaFtlc={conFechaFtlc}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="tarjeta flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Notificaciones y preguntas</h2>
            <HiloMensajes mensajes={mensajes} />
            <div className="border-t border-slate-100 pt-3">
              <FormMensaje casoId={caso.id} esPrestador={sesion.rol === 'prestador'} />
            </div>
          </section>
          <section className="tarjeta flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Historia clínica</h2>
            <HistoriaClinica casoId={caso.id} historias={historias} puedeSubir={puedeRegistrar} />
          </section>
        </div>
      </main>
    </>
  );
}

function Lista({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Gráfico SVG simple con bandas OMS: < -3 severa, -3 a -2 moderada, -2 a -1 riesgo. */
function GraficoZ({ serie }: { serie: { z: number; etiqueta: string }[] }) {
  if (serie.length < 1) return <p className="text-sm text-slate-500">Sin datos de Z-score.</p>;
  const W = 320, H = 180, P = 24, min = -5, max = 2;
  const y = (z: number) => P + ((max - Math.max(min, Math.min(max, z))) / (max - min)) * (H - 2 * P);
  const x = (i: number) => P + (serie.length === 1 ? (W - 2 * P) / 2 : (i / (serie.length - 1)) * (W - 2 * P));
  const bandas = [
    { de: -3, a: min, c: '#fee2e2' },
    { de: -2, a: -3, c: '#ffedd5' },
    { de: -1, a: -2, c: '#fef9c3' },
    { de: max, a: -1, c: '#dcfce7' },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolución del puntaje Z peso para la talla">
      {bandas.map(b => <rect key={b.de} x={P} width={W - 2 * P} y={y(b.de)} height={y(b.a) - y(b.de)} fill={b.c} />)}
      {[-3, -2, -1, 0].map(z => (
        <g key={z}>
          <line x1={P} x2={W - P} y1={y(z)} y2={y(z)} stroke="#cbd5e1" strokeDasharray="2 3" />
          <text x={4} y={y(z) + 3} fontSize="9" fill="#64748b">{z}</text>
        </g>
      ))}
      <polyline fill="none" stroke="#174a99" strokeWidth="2" points={serie.map((p, i) => `${x(i)},${y(p.z)}`).join(' ')} />
      {serie.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.z)} r="3.5" fill="#174a99" />
          <text x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="#475569">{p.etiqueta}</text>
        </g>
      ))}
    </svg>
  );
}
