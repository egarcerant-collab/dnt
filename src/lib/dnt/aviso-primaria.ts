import 'server-only';
import { URL_APP, enviarCorreo } from '../correo';
import { NOMBRE_PRESTADOR, type PrestadorRed } from './asignacion';
import { ipsCanonica } from './catalogo';
import { obtenerBase } from './repositorio';
import { actualizarJson, getStore } from './store';
import type { Caso } from './types';

/**
 * Aviso a la IPS de atención primaria (columna AX) cuando es distinta del prestador de la ruta DNT.
 * Se le informa que el niño ingresó a la ruta de alteraciones nutricionales y que debe garantizarle
 * las actividades de la Ruta de Promoción y Mantenimiento de la Salud (Res. 3280 de 2018) según su curso de vida.
 * No reemplaza el resumen que se envía al prestador de la ruta: es un correo aparte.
 * Cada niño se avisa una sola vez por IPS (queda registrado); se puede reenviar.
 */
const ARCHIVO_DIRECTORIO = 'directorio-primaria.json';
const ARCHIVO_AVISOS = 'avisos-primaria.json';
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Directorio = Record<string, { correos: string[]; actualizado: string; por: string }>;
type Avisos = Record<string, { ips: string; fecha: string }[]>; // casoId → avisos enviados

export interface NinoAviso { id: string; documento: string; nombre: string; municipio: string; notificacion: string | null; ruta: string; avisado: string | null }
export interface IpsPrimaria { ips: string; correos: string[]; ninos: NinoAviso[]; pendientes: number }

const nombreRuta = (ips: string) => NOMBRE_PRESTADOR[ips as PrestadorRed] ?? ips;
const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export async function leerDirectorio(): Promise<Directorio> {
  return (await getStore().leer<Directorio>(ARCHIVO_DIRECTORIO)) ?? {};
}

export async function guardarCorreosPrimaria(ips: string, texto: string, por: string) {
  const correos = [...new Set(texto.split(/[,;\s]+/).map(c => c.trim().toLowerCase()).filter(Boolean))];
  const malo = correos.find(c => !CORREO.test(c));
  if (malo) throw new Error(`Correo inválido: ${malo}`);
  if (correos.length > 5) throw new Error('Máximo 5 correos');
  await actualizarJson<Directorio>(ARCHIVO_DIRECTORIO, () => ({}), d => {
    if (correos.length) d[ips] = { correos, actualizado: new Date().toISOString(), por };
    else delete d[ips];
  });
}

/** Niños cuya IPS de atención primaria es distinta del prestador de la ruta, agrupados por IPS primaria. */
export async function ipsPrimariasConAviso(): Promise<IpsPrimaria[]> {
  const [base, dir, avisos] = await Promise.all([obtenerBase(), leerDirectorio(), getStore().leer<Avisos>(ARCHIVO_AVISOS).then(a => a ?? {})]);
  const grupos = new Map<string, NinoAviso[]>();
  for (const c of base.casos) {
    const primaria = ipsCanonica(c.ipsAtencionPrimaria);
    if (!primaria || primaria === c.ipsSeguimiento || ['FALLECIDO', 'DESCARTADO'].includes(c.estado)) continue;
    const avisado = avisos[c.id]?.filter(a => a.ips === primaria).at(-1)?.fecha ?? null;
    grupos.set(primaria, [...(grupos.get(primaria) ?? []), aNino(c, avisado)]);
  }
  return [...grupos.entries()]
    .map(([ips, ninos]) => ({ ips, correos: dir[ips]?.correos ?? [], ninos, pendientes: ninos.filter(n => !n.avisado).length }))
    .sort((a, b) => b.pendientes - a.pendientes || b.ninos.length - a.ninos.length);
}

function aNino(c: Caso, avisado: string | null): NinoAviso {
  return { id: c.id, documento: `${c.tipoDocumento} ${c.documento}`, nombre: c.nombre, municipio: c.municipio, notificacion: c.fechaNotificacion, ruta: c.ipsSeguimiento, avisado };
}

const esc = (s: string) => s.replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);

function correoAviso(ips: string, ninos: NinoAviso[]) {
  const intro = `Señor(a) ${ips}:`;
  const cuerpo =
    ninos.length === 1
      ? 'Le informamos que el niño o niña relacionado a continuación ingresó a la Ruta de Alteraciones Nutricionales de Dusakawi EPSI, al cual se le deben garantizar todas las actividades contempladas en la Ruta de Promoción y Mantenimiento de la Salud de acuerdo con su curso de vida (Resolución 3280 de 2018).'
      : `Le informamos que los ${ninos.length} niños y niñas relacionados a continuación ingresaron a la Ruta de Alteraciones Nutricionales de Dusakawi EPSI, a los cuales se les deben garantizar todas las actividades contempladas en la Ruta de Promoción y Mantenimiento de la Salud de acuerdo con su curso de vida (Resolución 3280 de 2018).`;
  const cierre = 'Su IPS figura como IPS de atención primaria de estos niños. El seguimiento nutricional lo realiza el prestador de la ruta indicado; se solicita coordinar con él las atenciones.';
  const filas = ninos
    .map(n => `<tr><td style="padding:6px 8px;border:1px solid #dbeafe">${esc(n.documento)}</td><td style="padding:6px 8px;border:1px solid #dbeafe">${esc(n.nombre)}</td><td style="padding:6px 8px;border:1px solid #dbeafe">${esc(n.municipio)}</td><td style="padding:6px 8px;border:1px solid #dbeafe">${dmy(n.notificacion)}</td><td style="padding:6px 8px;border:1px solid #dbeafe">${esc(nombreRuta(n.ruta))}</td></tr>`)
    .join('');
  const html = `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:680px">
  <div style="background:#174a99;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0"><img src="${URL_APP}/nutria.png" alt="" width="32" height="32" style="vertical-align:middle;border-radius:50%;background:#fff;margin-right:8px"><b>Dusakawi EPSI</b> · Ruta de Alteraciones Nutricionales</div>
  <div style="border:1px solid #dbeafe;border-top:0;padding:18px;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 10px;font-size:18px;color:#0c2a57">Ingreso a la Ruta de Alteraciones Nutricionales</h2>
    <p style="margin:8px 0">${esc(intro)}</p><p style="margin:8px 0">${esc(cuerpo)}</p>
    <table style="border-collapse:collapse;margin:12px 0;font-size:13px"><tr style="background:#eff6ff"><th style="padding:6px 8px;border:1px solid #dbeafe;text-align:left">Documento</th><th style="padding:6px 8px;border:1px solid #dbeafe;text-align:left">Nombre</th><th style="padding:6px 8px;border:1px solid #dbeafe;text-align:left">Municipio</th><th style="padding:6px 8px;border:1px solid #dbeafe;text-align:left">Notificación</th><th style="padding:6px 8px;border:1px solid #dbeafe;text-align:left">Prestador de la ruta</th></tr>${filas}</table>
    <p style="margin:8px 0">${esc(cierre)}</p>
    <p style="font-size:11px;color:#64748b">Información confidencial de salud de menores de edad, para uso exclusivo de la atención en salud (Ley 1581 de 2012 · Res. 1995 de 1999). Si recibió este correo por error, elimínelo e informe a Dusakawi EPSI.</p>
  </div></div>`;
  const texto = [intro, '', cuerpo, '', ...ninos.map(n => `- ${n.documento} · ${n.nombre} · ${n.municipio} · notificación ${dmy(n.notificacion)} · ruta: ${nombreRuta(n.ruta)}`), '', cierre].join('\n');
  return { html, texto };
}

/**
 * Envía el aviso a una IPS primaria (o a todas las que tengan correo).
 * Por defecto solo los niños aún no avisados; con reenviar=true, todos los de esa IPS.
 */
export async function enviarAvisosPrimaria(opciones: { ips?: string; reenviar?: boolean } = {}) {
  const lista = (await ipsPrimariasConAviso()).filter(p => !opciones.ips || p.ips === opciones.ips);
  const resultados: { ips: string; ok: boolean; ninos: number; motivo?: string }[] = [];
  for (const p of lista) {
    const ninos = opciones.reenviar ? p.ninos : p.ninos.filter(n => !n.avisado);
    if (!ninos.length) continue;
    if (!p.correos.length) {
      resultados.push({ ips: p.ips, ok: false, ninos: ninos.length, motivo: 'Sin correo de notificación registrado' });
      continue;
    }
    const { html, texto } = correoAviso(p.ips, ninos);
    const r = await enviarCorreo({ para: p.correos, asunto: `Ingreso a la Ruta de Alteraciones Nutricionales · ${p.ips}`, html, texto });
    if (r.ok) {
      const fecha = new Date().toISOString();
      await actualizarJson<Avisos>(ARCHIVO_AVISOS, () => ({}), a => {
        ninos.forEach(n => (a[n.id] = [...(a[n.id] ?? []), { ips: p.ips, fecha }]));
      });
    }
    resultados.push({ ips: p.ips, ninos: ninos.length, ...r });
  }
  return resultados;
}

/** Párrafo adicional para el resumen del prestador de la ruta (no reemplaza el resumen). */
export async function textoAvisoParaRuta(ipsRuta: string): Promise<string | null> {
  const lista = (await ipsPrimariasConAviso())
    .map(p => ({ ips: p.ips, n: p.ninos.filter(x => x.ruta === ipsRuta).length }))
    .filter(x => x.n);
  if (!lista.length) return null;
  const total = lista.reduce((s, x) => s + x.n, 0);
  return `Adicionalmente, ${total} niño(s) de su ruta tienen otra IPS de atención primaria (${lista.map(x => `${x.ips}: ${x.n}`).join('; ')}). A esas IPS se les informa que deben garantizar las actividades de la Ruta de Promoción y Mantenimiento de la Salud según el curso de vida; coordine con ellas las atenciones.`;
}
