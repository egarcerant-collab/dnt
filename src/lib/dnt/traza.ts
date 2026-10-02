import { semaforoCaso, ultimoZ } from './filtros';
import type { ClaveSemaforo } from './semaforo';
import type { HistoriaClinica } from './historias';
import type { Mensaje } from './mensajes';
import type { Caso } from './types';

/** Fila del módulo de seguimiento: estado de diligenciamiento de un niño por parte del prestador. */
export interface FilaTraza {
  id: string;
  tipoDocumento: string;
  documento: string;
  nombre: string;
  departamento: string;
  municipio: string;
  ips: string;
  clasificacion: string;
  estado: string;
  ultimoZ: number | null;
  semaforo: ClaveSemaforo;
  porcentaje: number;
  pendientes: string[];
  controlesExcel: number;
  controlesApp: number;
  ultimoControl: string | null;
  ultimoRegistroApp: { fecha: string; por: string } | null;
  historias: { id: string; nombre: string; fecha: string; control?: number }[];
  /** Controles que todavía no tienen su historia clínica. */
  controlesSinHc: number[];
  mensajes: number;
  sinResponder: number;
  ax: boolean;
}

export type TipoEvento = 'control' | 'historia' | 'anulacion' | 'respuesta' | 'notificacion' | 'pregunta';

export interface EventoTraza {
  fecha: string;
  tipo: TipoEvento;
  casoId: string | null;
  nino: string;
  ips: string;
  por: string;
  detalle: string;
}

/** Criterios de diligenciamiento que se revisan por niño (Res. 2350/2020 y libro de prestadores). */
function completitud(c: Caso, controlesSinHc: number[]) {
  const ultimo = [...c.controles].filter(k => k.fecha).sort((a, b) => a.fecha!.localeCompare(b.fecha!)).at(-1);
  const criterios: [boolean, string][] = [
    [!!c.ipsAtencionPrimaria, 'IPS de atención primaria (AX)'],
    [c.controles.length > 0, 'Al menos un control'],
    [!!ultimo && ultimo.peso != null && ultimo.talla != null && ultimo.zPesoTalla != null, 'Antropometría completa en el último control'],
    [!!ultimo?.resultado, 'Resultado del seguimiento'],
    [!!ultimo?.profesional, 'Profesional que atiende'],
    [c.estado !== 'SIN DILIGENCIAR', 'Estado actual'],
    [c.controles.length > 0 && controlesSinHc.length === 0, controlesSinHc.length ? `Historia clínica de los controles ${controlesSinHc.join(', ')}` : 'Historia clínica de cada control'],
  ];
  const ok = criterios.filter(([v]) => v).length;
  return { porcentaje: Math.round((ok / criterios.length) * 100), pendientes: criterios.filter(([v]) => !v).map(([, t]) => t) };
}

export function construirTraza(casos: Caso[], historias: HistoriaClinica[], mensajes: Mensaje[]) {
  const histPorCaso = new Map<string, HistoriaClinica[]>();
  // Las anuladas no cuentan como cargadas, pero sí dejan rastro en la actividad
  historias.filter(h => !h.anulada).forEach(h => histPorCaso.set(h.casoId, [...(histPorCaso.get(h.casoId) ?? []), h]));
  const msgPorCaso = new Map<string, Mensaje[]>();
  mensajes.forEach(m => m.casoId && msgPorCaso.set(m.casoId, [...(msgPorCaso.get(m.casoId) ?? []), m]));

  const eventos: EventoTraza[] = [];
  const filas: FilaTraza[] = casos.map(c => {
    const hs = histPorCaso.get(c.id) ?? [];
    const ms = msgPorCaso.get(c.id) ?? [];
    const sinHc = c.controles.filter(k => !hs.some(h => h.control === k.numero)).map(k => k.numero);
    const app = c.controles.filter(k => k.origen === 'app');
    const ultimoApp = app.filter(k => k.registradoEn).sort((a, b) => a.registradoEn!.localeCompare(b.registradoEn!)).at(-1);
    const fechas = c.controles.map(k => k.fecha).filter((f): f is string => !!f).sort();

    app.forEach(k =>
      k.registradoEn &&
      eventos.push({
        fecha: k.registradoEn, tipo: 'control', casoId: c.id, nino: c.nombre, ips: c.ipsSeguimiento,
        por: k.registradoPor ?? k.profesional,
        detalle: `Control ${k.numero} · ${k.peso ?? '—'} kg · ${k.talla ?? '—'} cm · Z ${k.zPesoTalla ?? '—'}${k.clasificacion ? ' · ' + k.clasificacion : ''}`,
      }),
    );
    historias.filter(h => h.casoId === c.id).forEach(h => {
      eventos.push({ fecha: h.fecha, tipo: 'historia', casoId: c.id, nino: c.nombre, ips: c.ipsSeguimiento, por: h.subidoPor, detalle: `Historia clínica: ${h.nombreOriginal}` });
      if (h.anulada) eventos.push({ fecha: h.anulada.fecha, tipo: 'anulacion', casoId: c.id, nino: c.nombre, ips: c.ipsSeguimiento, por: h.anulada.por, detalle: `Eliminó la historia clínica ${h.nombreOriginal}. Motivo: ${h.anulada.motivo}` });
    });

    // Preguntas de la EPSI sin una respuesta posterior del prestador
    const sinResponder = ms.filter(m => m.tipo === 'pregunta' && !ms.some(r => r.tipo === 'respuesta' && r.fecha > m.fecha)).length;

    return {
      id: c.id,
      tipoDocumento: c.tipoDocumento,
      documento: c.documento,
      nombre: c.nombre,
      departamento: c.departamento,
      municipio: c.municipio,
      ips: c.ipsSeguimiento,
      clasificacion: c.clasificacionNutricional,
      estado: c.estado,
      ultimoZ: ultimoZ(c),
      semaforo: semaforoCaso(c).clave,
      ...completitud(c, sinHc),
      controlesSinHc: sinHc,
      controlesExcel: c.controles.length - app.length,
      controlesApp: app.length,
      ultimoControl: fechas.at(-1) ?? null,
      ultimoRegistroApp: ultimoApp ? { fecha: ultimoApp.registradoEn!, por: ultimoApp.registradoPor ?? '' } : null,
      historias: hs.map(h => ({ id: h.id, nombre: h.nombreOriginal, fecha: h.fecha, control: h.control })),
      mensajes: ms.length,
      sinResponder,
      ax: !!c.ipsAtencionPrimaria,
    };
  });

  const nombres = new Map(casos.map(c => [c.id, c.nombre]));
  mensajes.forEach(m =>
    eventos.push({
      fecha: m.fecha, tipo: m.tipo, casoId: m.casoId, nino: m.casoId ? nombres.get(m.casoId) ?? '' : 'Notificación general',
      ips: m.ips, por: m.autorNombre, detalle: m.texto.length > 140 ? m.texto.slice(0, 140) + '…' : m.texto,
    }),
  );
  eventos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { filas, eventos };
}
