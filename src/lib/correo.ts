import 'server-only';
import { actualizarJson } from './dnt/store';

/**
 * Envío de correos desde la cuenta de Google Workspace de Dusakawi (SMTP de Gmail).
 * Requiere en el servidor: SMTP_USER (ej. egarcerant@dusakawiepsi.com) y SMTP_PASS (contraseña de aplicación).
 * Regla: los correos NO llevan datos de los niños; solo cifras y el enlace a la app.
 */
export const REMITENTE = process.env.SMTP_USER || 'egarcerant@dusakawiepsi.com';
export const URL_APP = process.env.APP_URL || 'https://dnt-nine.vercel.app';

export const correoConfigurado = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

interface Envio { para: string[]; asunto: string; texto: string; html: string }

const ARCHIVO_LOG = 'correos-enviados.json';

export async function enviarCorreo(e: Envio): Promise<{ ok: boolean; motivo?: string }> {
  if (!e.para.length) return { ok: false, motivo: 'La IPS no tiene correos registrados' };
  if (!correoConfigurado()) return { ok: false, motivo: 'Correo no configurado en el servidor (SMTP_USER / SMTP_PASS)' };
  let r: { ok: boolean; motivo?: string };
  try {
    const nodemailer = await import('nodemailer');
    const transporte = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporte.sendMail({ from: `"Monitoreo DNT · Dusakawi EPSI" <${REMITENTE}>`, to: e.para.join(', '), subject: e.asunto, text: e.texto, html: e.html });
    r = { ok: true };
  } catch (err) {
    r = { ok: false, motivo: (err as Error).message };
  }
  // Trazabilidad de envíos (sin contenido)
  await actualizarJson<object[]>(ARCHIVO_LOG, () => [], log => {
    log.push({ fecha: new Date().toISOString(), para: e.para, asunto: e.asunto, ok: r.ok, motivo: r.motivo });
    if (log.length > 5000) log.splice(0, log.length - 5000);
  }).catch(() => undefined);
  return r;
}

const escapar = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Plantilla HTML sencilla, legible en cualquier cliente de correo. */
export function plantilla(titulo: string, parrafos: string[], filas?: [string, string | number][]): { html: string; texto: string } {
  const tabla = filas?.length
    ? `<table style="border-collapse:collapse;margin:12px 0;font-size:14px">${filas
        .map(([k, v]) => `<tr><td style="padding:6px 12px;border:1px solid #dbeafe">${escapar(k)}</td><td style="padding:6px 12px;border:1px solid #dbeafe;font-weight:bold;text-align:right">${escapar(String(v))}</td></tr>`)
        .join('')}</table>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:560px">
  <div style="background:#174a99;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0"><b>Monitoreo Desnutrición · Dusakawi EPSI</b></div>
  <div style="border:1px solid #dbeafe;border-top:0;padding:18px;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 10px;font-size:18px;color:#0c2a57">${escapar(titulo)}</h2>
    ${parrafos.map(p => `<p style="margin:8px 0">${escapar(p)}</p>`).join('')}
    ${tabla}
    <p style="margin:16px 0"><a href="${URL_APP}" style="background:#1d5fbf;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ingresar a la app</a></p>
    <p style="font-size:11px;color:#64748b">Mensaje automático. El detalle de los niños solo se consulta dentro de la app (Ley 1581/2012 · Res. 1995/1999).</p>
  </div></div>`;
  const texto = [titulo, '', ...parrafos, '', ...(filas ?? []).map(([k, v]) => `${k}: ${v}`), '', `Ingrese a: ${URL_APP}`].join('\n');
  return { html, texto };
}

/** Verifica usuario y contraseña de aplicación contra Gmail sin enviar ningún correo. */
export async function verificarCorreo(): Promise<string> {
  if (!correoConfigurado()) return 'NO CONFIGURADO (faltan SMTP_USER / SMTP_PASS)';
  try {
    const nodemailer = await import('nodemailer');
    await nodemailer
      .createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
      .verify();
    return `OK (conectado como ${process.env.SMTP_USER})`;
  } catch (e) {
    const m = (e as Error).message;
    return /Username and Password not accepted|535|BadCredentials/i.test(m)
      ? 'ERROR: Gmail rechazó la clave. SMTP_PASS debe ser una CONTRASEÑA DE APLICACIÓN de 16 letras (myaccount.google.com/apppasswords), no la contraseña normal'
      : `ERROR: ${m}`;
  }
}

export interface CorreoEnviado { fecha: string; para: string[]; asunto: string; ok: boolean; motivo?: string }

/** Historial de correos enviados (el más reciente primero). */
export async function listarCorreosEnviados(): Promise<CorreoEnviado[]> {
  const { getStore } = await import('./dnt/store');
  const log = (await getStore().leer<CorreoEnviado[]>(ARCHIVO_LOG)) ?? [];
  return [...log].reverse();
}
