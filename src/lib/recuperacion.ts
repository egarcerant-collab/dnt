import 'server-only';
import crypto from 'crypto';
import { URL_APP, correoConfigurado, enviarCorreo, plantilla } from './correo';
import { establecerClavePrestador, listarPrestadores } from './prestadores';
import { firmarToken, verificarToken } from './sesion';
import { establecerClaveUsuario, estaBloqueado, limpiarIntentos, listarUsuarios, normalizarUsuario, registrarFallo } from './usuarios';

/**
 * Recuperación de contraseña por correo.
 * - Enlace firmado válido 30 minutos y de un solo uso: lleva la huella de la contraseña actual,
 *   así que deja de servir apenas se cambia la contraseña.
 * - La respuesta es siempre la misma exista o no la cuenta (no revela usuarios ni IPS registradas).
 * - Funcionarios: al correo del usuario (o usuario@dusakawiepsi.com). Prestadores: a los correos del pre-registro.
 */
const VIGENCIA_SEG = 30 * 60;
const DOMINIO = 'dusakawiepsi.com';

type Destino = { tipo: 'epsi'; id: string } | { tipo: 'prestador'; id: string };
interface TokenRecuperacion { t: 'recup'; k: Destino['tipo']; id: string; h: string }

const huella = (hash: string | undefined) => crypto.createHash('sha256').update(hash ?? 'clave-inicial').digest('hex').slice(0, 16);

export const MENSAJE_GENERICO =
  'Si los datos corresponden a una cuenta activa con correo registrado, en unos minutos llegará un enlace para crear una nueva contraseña. Revisa también la carpeta de spam. El enlace vence en 30 minutos.';

export async function solicitarRecuperacion(d: { tipo: 'epsi'; usuario: string } | { tipo: 'prestador'; ips: string }): Promise<{ ok: boolean; mensaje: string }> {
  if (!correoConfigurado()) return { ok: false, mensaje: 'El envío de correos no está disponible. Solicita al administrador que restablezca tu contraseña.' };
  const claveLimite = `recup:${d.tipo === 'epsi' ? normalizarUsuario(d.usuario) : d.ips}`;
  if (estaBloqueado(claveLimite)) return { ok: false, mensaje: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.' };
  registrarFallo(claveLimite); // cuenta cada solicitud: máximo 5 cada 5 minutos

  let para: string[] = [];
  let token = '';
  let nombre = '';
  if (d.tipo === 'epsi') {
    const buscado = normalizarUsuario(d.usuario);
    const u = (await listarUsuarios()).find(x => x.activo && !x.pendiente && x.rol !== 'prestador' && (x.usuario === buscado || x.correo?.toLowerCase() === d.usuario.trim().toLowerCase()));
    if (u) {
      para = [u.correo || (u.usuario.includes('@') ? u.usuario : `${u.usuario}@${DOMINIO}`)];
      token = firmarToken({ t: 'recup', k: 'epsi', id: u.id, h: huella(u.hash) } satisfies TokenRecuperacion, VIGENCIA_SEG);
      nombre = u.nombre;
    }
  } else {
    const p = (await listarPrestadores()).find(x => x.ips === d.ips && x.activo);
    if (p?.contacto?.correos.length) {
      para = p.contacto.correos;
      token = firmarToken({ t: 'recup', k: 'prestador', id: p.ips, h: huella(p.hash) } satisfies TokenRecuperacion, VIGENCIA_SEG);
      nombre = p.contacto.responsable || p.ips;
    }
  }
  if (!para.length) return { ok: true, mensaje: MENSAJE_GENERICO };

  const enlace = `${URL_APP}/recuperar/nueva?t=${encodeURIComponent(token)}`;
  const { html, texto } = plantilla('Recuperación de contraseña · Nutria', [
    `Hola ${nombre}. Recibimos una solicitud para crear una nueva contraseña de Nutria${d.tipo === 'prestador' ? ` para ${d.ips}` : ''}.`,
    `Para continuar abre este enlace (vence en 30 minutos y solo se puede usar una vez): ${enlace}`,
    'Si no solicitaste el cambio, ignora este mensaje: tu contraseña actual sigue funcionando.',
  ]);
  await enviarCorreo({ para, asunto: 'Nutria · Recuperación de contraseña', html, texto }).catch(() => undefined);
  return { ok: true, mensaje: MENSAJE_GENERICO };
}

/** Valida el enlace sin consumirlo (para mostrar el formulario). */
export async function revisarToken(token: string): Promise<{ ok: true; etiqueta: string } | { ok: false }> {
  const r = await resolverToken(token);
  return r ? { ok: true, etiqueta: r.etiqueta } : { ok: false };
}

async function resolverToken(token: string) {
  const d = verificarToken<TokenRecuperacion>(token);
  if (!d || d.t !== 'recup') return null;
  if (d.k === 'epsi') {
    const u = (await listarUsuarios()).find(x => x.id === d.id && x.activo && !x.pendiente);
    return u && huella(u.hash) === d.h ? { d, etiqueta: u.nombre, usuario: u.usuario } : null;
  }
  const p = (await listarPrestadores()).find(x => x.ips === d.id && x.activo);
  return p && huella(p.hash) === d.h ? { d, etiqueta: p.ips, usuario: p.ips } : null;
}

export async function restablecerConToken(token: string, nueva: string): Promise<string> {
  const r = await resolverToken(token);
  if (!r) throw new Error('El enlace no es válido, ya se usó o venció. Solicita uno nuevo.');
  if (r.d.k === 'epsi') {
    await establecerClaveUsuario(r.d.id, nueva);
    limpiarIntentos(normalizarUsuario(r.usuario));
  } else {
    await establecerClavePrestador(r.d.id, nueva);
    limpiarIntentos(`ips:${r.d.id}`);
  }
  return r.d.k;
}
