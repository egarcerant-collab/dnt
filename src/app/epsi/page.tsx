import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { FiltrosCascada } from '@/components/filtros-cascada';
import { AlertaChip, EstadoBadge, SeveridadBadge, formatoFecha } from '@/components/ui';
import { calcularIndicadores, contarAlertas, type Indicador } from '@/lib/dnt/indicadores';
import { aQueryString, filtrarCasos, grupoEdad } from '@/lib/dnt/filtros';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { ALERTAS, type Caso, type TipoAlerta } from '@/lib/dnt/types';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

type Filtros = { depto?: string; municipio?: string; ips?: string };

export default async function VistaEpsi({ searchParams }: { searchParams: Promise<Filtros> }) {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (!esEpsi(sesion.rol)) redirect('/prestador');

  const f = await searchParams;
  const base = await obtenerBase();
  const todos = base.casos;
  const filtroGeo = { depto: f.depto, municipio: f.municipio, ips: f.ips };
  const casos = filtrarCasos(todos, filtroGeo);
  // URL de exportación con los filtros geográficos actuales más un filtro extra opcional
  const urlExportar = (extra: Record<string, string> = {}) => `/api/exportar?${aQueryString({ ...filtroGeo, ...extra })}`;

  const indicadores = calcularIndicadores(casos);
  const alertas = contarAlertas(casos);
  const combinaciones = [...new Map(todos.map(c => [`${c.departamento}|${c.municipio}|${c.ipsSeguimiento}`, { depto: c.departamento, municipio: c.municipio, ips: c.ipsSeguimiento }])).values()];
  const porIps = resumenPorGrupo(casos, c => c.ipsSeguimiento);
  const porMunicipio = resumenPorGrupo(casos, c => `${c.municipio} (${c.departamento.replace('LA ', '')})`);
  const prioritarios = casos
    .filter(c => c.alertas.some(a => ALERTAS[a].nivel === 'alta'))
    .sort((a, b) => Number(b.severidad === 'SEVERA') - Number(a.severidad === 'SEVERA') || (a.fechaNotificacion ?? '').localeCompare(b.fechaNotificacion ?? ''));

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        {!base.baseDisponible && (
          <p className="tarjeta border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Todavía no hay una base de seguimiento cargada. El administrador debe cargar el Excel en <b>Administración → Base de seguimiento DNT</b>.
          </p>
        )}
        <FiltrosCascada combinaciones={combinaciones} valores={filtroGeo} total={casos.length} />
        <div className="-mt-3 flex flex-wrap justify-end gap-2">
          <a href={`/api/exportar-matriz?${aQueryString(filtroGeo)}`} className="boton-sec gap-2" download
            title="Matriz completa A–KF en el formato del libro, con los controles diligenciados por los prestadores">
            <IconoDescarga /> Matriz completa A–KF
          </a>
          <a href={urlExportar()} className="boton gap-2" download>
            <IconoDescarga /> Exportar a Excel ({casos.length} casos)
          </a>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Indicadores trazadores</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {indicadores.map(i => <TarjetaIndicador key={i.clave} i={i} />)}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="tarjeta p-4">
            <h3 className="mb-3 font-semibold">Estado actual</h3>
            <Barras datos={contar(casos, c => c.estado)} total={casos.length} exportar={k => urlExportar({ estado: k })} />
          </section>
          <section className="tarjeta p-4">
            <h3 className="mb-3 font-semibold">Clasificación nutricional</h3>
            <Barras datos={contar(casos, c => c.clasificacionNutricional)} total={casos.length} exportar={k => urlExportar({ clasificacion: k })} />
            <p className="mt-2 text-xs text-slate-500">{casos.filter(c => c.clasificacionPorZ).length} casos sin clasificación escrita se clasificaron por su Z-score de ingreso.</p>
            <h3 className="mb-3 mt-5 font-semibold">Grupo de edad</h3>
            <Barras datos={contar(casos, grupoEdad)} total={casos.length} exportar={k => urlExportar({ edad: k })} />
          </section>
          <section className="tarjeta p-4">
            <h3 className="mb-3 font-semibold">Alertas activas</h3>
            <ul className="space-y-2 text-sm">
              {(Object.keys(ALERTAS) as TipoAlerta[]).map(a => (
                <li key={a} className="flex items-center justify-between gap-2">
                  <AlertaChip tipo={a} />
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{alertas[a] ?? 0}</span>
                    {(alertas[a] ?? 0) > 0 && <BotonExportar href={urlExportar({ alerta: a })} />}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-slate-100 pt-3 text-sm">
              <p className="etiqueta mb-1">Cruce SIVIGILA ({base.sivigila.hoja ?? '—'})</p>
              <p>Notificados: <b>{base.sivigila.total}</b></p>
              <p>Notificados sin seguimiento: <b className="text-red-600">{base.sivigila.sinSeguimiento}</b></p>
              <p>Seguimiento sin notificación: <b>{alertas.NO_CRUZA_SIVIGILA ?? 0}</b></p>
            </div>
          </section>
        </div>

        <TablaGrupos titulo="Cumplimiento por IPS" filas={porIps} />
        <TablaGrupos titulo="Cumplimiento por municipio" filas={porMunicipio} />

        <section className="tarjeta overflow-x-auto">
          <h3 className="border-b border-slate-100 p-4 font-semibold">
            Casos prioritarios para auditoría <span className="font-normal text-slate-500">({prioritarios.length} con alerta alta)</span>
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Niño/a</th><th className="px-3 py-2">Municipio</th><th className="px-3 py-2">IPS</th>
                <th className="px-3 py-2">Clasificación</th><th className="px-3 py-2">Estado actual</th><th className="px-3 py-2">Notificación</th>
                <th className="px-3 py-2">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prioritarios.slice(0, 50).map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><Link href={`/caso/${encodeURIComponent(c.id)}`} className="font-medium text-marca-700 hover:underline">{c.nombre}</Link></td>
                  <td className="px-3 py-2">{c.municipio}</td>
                  <td className="px-3 py-2 text-xs">{c.ipsSeguimiento}</td>
                  <td className="px-3 py-2"><SeveridadBadge severidad={c.severidad} /></td>
                  <td className="px-3 py-2"><EstadoBadge estado={c.estado} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatoFecha(c.fechaNotificacion)}</td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{c.alertas.map(a => <AlertaChip key={a} tipo={a} />)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {prioritarios.length > 50 && <p className="p-3 text-xs text-slate-500">Mostrando 50 de {prioritarios.length}. Filtra por IPS o municipio para ver el resto.</p>}
        </section>

        <section className="tarjeta p-4">
          <h3 className="mb-3 font-semibold">Calidad del dato</h3>
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {completitud(casos).map(([campo, v]) => (
              <div key={campo} className="text-sm">
                <div className="flex justify-between"><span>{campo}</span><b>{v}%</b></div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div className={`h-2 rounded ${v >= 95 ? 'bg-marca-600' : v >= 80 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

// ── Helpers de presentación ─────────────────────────────────────────────


function contar(casos: Caso[], k: (c: Caso) => string): [string, number][] {
  const m = new Map<string, number>();
  casos.forEach(c => m.set(k(c), (m.get(k(c)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function completitud(casos: Caso[]): [string, number][] {
  const n = casos.length || 1;
  const p = (f: (c: Caso) => boolean) => Math.round((casos.filter(f).length / n) * 100);
  return [
    ['Estado actual', p(c => c.estado !== 'SIN DILIGENCIAR')],
    ['Clasificación de ingreso (escrita)', p(c => !c.clasificacionPorZ && c.clasificacionNutricional !== 'SIN DATO')],
    ['Z-score de ingreso', p(c => c.zIngreso != null)],
    ['Perímetro braquial', p(c => c.perimetroBraquial != null)],
    ['Prescripción MIPRES FTLC', p(c => !!c.mipresFtlc)],
    ['Fecha entrega FTLC', p(c => !!c.fechaEntregaFtlc)],
    ['Fecha de recuperación (recuperados)', Math.round((casos.filter(c => c.estado === 'RECUPERADO' && c.fechaRecuperacion).length / (casos.filter(c => c.estado === 'RECUPERADO').length || 1)) * 100)],
    ['Teléfono de contacto', p(c => /\d{7,}/.test(c.telefono))],
    ['Al menos un control', p(c => c.controles.length > 0)],
  ];
}

interface FilaGrupo { nombre: string; total: number; recuperacion: number | null; oportunidad: number | null; sinControl: number; sinEstado: number }

function resumenPorGrupo(casos: Caso[], k: (c: Caso) => string): FilaGrupo[] {
  const grupos = new Map<string, Caso[]>();
  casos.forEach(c => grupos.set(k(c), [...(grupos.get(k(c)) ?? []), c]));
  return [...grupos.entries()]
    .map(([nombre, cs]) => {
      const ind = Object.fromEntries(calcularIndicadores(cs).map(i => [i.clave, i.valor]));
      return { nombre, total: cs.length, recuperacion: ind.recuperacion, oportunidad: ind.oportunidad, sinControl: ind.sinControl ?? 0, sinEstado: ind.sinEstado ?? 0 };
    })
    .sort((a, b) => b.total - a.total);
}

function TarjetaIndicador({ i }: { i: Indicador }) {
  const color = i.cumple == null ? 'border-slate-200' : i.cumple ? 'border-marca-600' : 'border-red-300';
  const punto = i.cumple == null ? 'bg-slate-300' : i.cumple ? 'bg-marca-600' : 'bg-red-500';
  return (
    <div className={`tarjeta border-l-4 p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <p className="etiqueta">{i.nombre}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${punto}`} />
      </div>
      <p className="mt-1 text-3xl font-bold text-slate-900">
        {i.valor ?? '—'}
        <span className="ml-1 text-base font-medium text-slate-500">{i.unidad === '%' ? '%' : i.unidad === 'días' ? 'días' : ''}</span>
      </p>
      <p className="text-xs text-slate-500">Meta {i.meta} · {i.detalle}</p>
    </div>
  );
}

function Barras({ datos, total, exportar }: { datos: [string, number][]; total: number; exportar?: (clave: string) => string }) {
  return (
    <ul className="space-y-2 text-sm">
      {datos.map(([k, v]) => (
        <li key={k}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{k}</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold">{v}</span>
              {exportar && <BotonExportar href={exportar(k)} />}
            </span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-marca-600" style={{ width: `${(v / (total || 1)) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function IconoDescarga() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
    </svg>
  );
}

function BotonExportar({ href }: { href: string }) {
  return (
    <a href={href} download title="Exportar estos casos a Excel" aria-label="Exportar estos casos a Excel"
      className="rounded p-1 text-marca-700 hover:bg-marca-50">
      <IconoDescarga />
    </a>
  );
}

function TablaGrupos({ titulo, filas }: { titulo: string; filas: FilaGrupo[] }) {
  const celda = (v: number | null, meta: number) =>
    v == null ? <span className="text-slate-400">—</span> : <span className={v >= meta ? 'font-semibold text-marca-700' : 'font-semibold text-red-600'}>{v}%</span>;
  return (
    <section className="tarjeta overflow-x-auto">
      <h3 className="border-b border-slate-100 p-4 font-semibold">{titulo}</h3>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Nombre</th><th className="px-3 py-2 text-right">Casos</th>
            <th className="px-3 py-2 text-right">Recuperación (≥75%)</th><th className="px-3 py-2 text-right">Oportunidad 1er control (≥90%)</th>
            <th className="px-3 py-2 text-right">Sin control &gt; 4 sem</th><th className="px-3 py-2 text-right">Sin estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map(g => (
            <tr key={g.nombre} className="hover:bg-slate-50">
              <td className="px-3 py-2">{g.nombre}</td>
              <td className="px-3 py-2 text-right">{g.total}</td>
              <td className="px-3 py-2 text-right">{celda(g.recuperacion, 75)}</td>
              <td className="px-3 py-2 text-right">{celda(g.oportunidad, 90)}</td>
              <td className={`px-3 py-2 text-right ${g.sinControl ? 'font-semibold text-red-600' : ''}`}>{g.sinControl}</td>
              <td className={`px-3 py-2 text-right ${g.sinEstado ? 'text-amber-700' : ''}`}>{g.sinEstado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
