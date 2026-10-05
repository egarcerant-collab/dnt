import 'server-only';
import { URL_APP, enviarCorreo, plantilla } from '../correo';
import { listarPrestadores } from '../prestadores';
import { listarHistorias } from './historias';
import { listarMensajes } from './mensajes';
import { obtenerBase } from './repositorio';
import { construirTraza } from './traza';

export interface ResumenIps {
  ips: string;
  ninos: number;
  activos: number;
  sinControl4: number;
  controlVencido: number;
  controlesSinHc: number;
  sinEstado: number;
  preguntas: number;
  diligenciamiento: number;
}

const CERRADOS = ['RECUPERADO', 'FALLECIDO', 'DESCARTADO', 'DESERTADO'];

/** Cifras por IPS (sin datos personales) para correos y WhatsApp. */
export async function resumenesPorIps(): Promise<Map<string, ResumenIps>> {
  const [base, historias, mensajes] = await Promise.all([obtenerBase(), listarHistorias(), listarMensajes()]);
  const { filas } = construirTraza(base.casos, historias, mensajes);
  const porCaso = new Map(base.casos.map(c => [c.id, c]));
  const r = new Map<string, ResumenIps>();
  for (const f of filas) {
    const c = porCaso.get(f.id)!;
    const s = r.get(f.ips) ?? { ips: f.ips, ninos: 0, activos: 0, sinControl4: 0, controlVencido: 0, controlesSinHc: 0, sinEstado: 0, preguntas: 0, diligenciamiento: 0 };
    s.ninos++;
    if (!CERRADOS.includes(c.estado)) s.activos++;
    if (c.alertas.includes('SIN_CONTROL_4_SEMANAS')) s.sinControl4++;
    if (c.alertas.includes('CONTROL_VENCIDO')) s.controlVencido++;
    if (c.estado === 'SIN DILIGENCIAR') s.sinEstado++;
    s.controlesSinHc += f.controlesSinHc.length;
    s.preguntas += f.sinResponder;
    s.diligenciamiento += f.porcentaje;
    r.set(f.ips, s);
  }
  r.forEach(s => (s.diligenciamiento = s.ninos ? Math.round(s.diligenciamiento / s.ninos) : 0));
  return r;
}

export function textoWhatsApp(s: ResumenIps): string {
  return [
    `Nutria · Dusakawi EPSI (Monitoreo DNT)`,
    `${s.ips}:`,
    `• Niños activos: ${s.activos}`,
    `• Sin control hace más de 4 semanas: ${s.sinControl4}`,
    `• Control vencido (>14 días): ${s.controlVencido}`,
    `• Controles sin historia clínica: ${s.controlesSinHc}`,
    `• Preguntas de la EPSI sin responder: ${s.preguntas}`,
    `Diligenciamiento: ${s.diligenciamiento}%`,
    `Ingrese a ${URL_APP} para ver el detalle.`,
  ].join('\n');
}

/** Envía el informe por correo a una IPS (o a todas las que tengan correo registrado). */
export async function enviarInformes(soloIps?: string) {
  const [resumenes, prestadores] = await Promise.all([resumenesPorIps(), listarPrestadores()]);
  const resultados: { ips: string; ok: boolean; motivo?: string }[] = [];
  // Envío a una IPS concreta: se permite aunque esté desactivada. Envío masivo: solo IPS activas.
  for (const p of prestadores.filter(x => (soloIps ? x.ips === soloIps : x.activo))) {
    const s = resumenes.get(p.ips);
    if (!s) {
      resultados.push({ ips: p.ips, ok: false, motivo: 'La IPS no tiene niños en la base actual' });
      continue;
    }
    if (!p.contacto?.correos.length) {
      resultados.push({ ips: p.ips, ok: false, motivo: 'Sin correo registrado (falta el pre-registro)' });
      continue;
    }
    const { html, texto } = plantilla(
      `Informe de seguimiento · ${p.ips}`,
      [`Cordial saludo${p.contacto.responsable ? ', ' + p.contacto.responsable : ''}.`, 'Este es el estado actual del seguimiento de los niños y niñas con desnutrición aguda asignados a su IPS:'],
      [
        ['Niños asignados', s.ninos],
        ['Niños activos', s.activos],
        ['Sin control hace más de 4 semanas', s.sinControl4],
        ['Control vencido (más de 14 días)', s.controlVencido],
        ['Controles sin historia clínica', s.controlesSinHc],
        ['Sin estado diligenciado', s.sinEstado],
        ['Preguntas de la EPSI sin responder', s.preguntas],
        ['Diligenciamiento promedio', `${s.diligenciamiento}%`],
      ],
    );
    const r = await enviarCorreo({ para: p.contacto.correos, asunto: `Informe de seguimiento DNT · ${p.ips}`, html, texto });
    resultados.push({ ips: p.ips, ...r });
  }
  return resultados;
}

/** Aviso a la IPS cuando la EPSI le envía una notificación o pregunta (sin el contenido). */
export async function avisarMensajeIps(ips: string, tipo: 'notificacion' | 'pregunta', sobreUnNino: boolean) {
  const p = (await listarPrestadores()).find(x => x.ips === ips);
  if (!p?.contacto?.correos.length) return { ok: false, motivo: 'Sin correo registrado' };
  const que = tipo === 'pregunta' ? 'una pregunta' : 'una notificación';
  const { html, texto } = plantilla(`Tiene ${que} de la EPSI`, [
    `Dusakawi EPSI le envió ${que}${sobreUnNino ? ' sobre uno de los niños en seguimiento' : ''} a ${ips}.`,
    tipo === 'pregunta' ? 'Por favor ingrese a la app y responda.' : 'Por favor ingrese a la app para leerla.',
  ]);
  return enviarCorreo({ para: p.contacto.correos, asunto: `Nueva ${tipo === 'pregunta' ? 'pregunta' : 'notificación'} de la EPSI · ${ips}`, html, texto });
}
