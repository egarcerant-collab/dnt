import 'server-only';
import crypto from 'crypto';
import { actualizarJson, getStore } from './dnt/store';

export type RolUsuario = 'admin' | 'epsi' | 'prestador';

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: RolUsuario;
  ips?: string;
  hash: string;
  activo: boolean;
  creadoEn: string;
  /** Registro hecho por el propio funcionario, pendiente de aprobación del administrador. */
  pendiente?: boolean;
  correo?: string;
  cargo?: string;
}

export type UsuarioPublico = Omit<Usuario, 'hash'>;

const ARCHIVO = 'usuarios.json';
const ITERACIONES = 210_000; // PBKDF2-SHA512, recomendación OWASP

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERACIONES, 64, 'sha512').toString('hex');
  return `pbkdf2$${ITERACIONES}$${salt}$${hash}`;
}

export function verificarPassword(password: string, almacenado: string): boolean {
  const [alg, iter, salt, hash] = almacenado.split('$');
  if (alg !== 'pbkdf2' || !salt || !hash) return false;
  const intento = crypto.pbkdf2Sync(password, salt, Number(iter), 64, 'sha512');
  const esperado = Buffer.from(hash, 'hex');
  return intento.length === esperado.length && crypto.timingSafeEqual(intento, esperado);
}

/** Acepta 'usuario' o 'usuario@dusakawiepsi.com'. */
const normalizarUsuario = (u: string) => u.trim().toLowerCase().replace(/@dusakawiepsi\.com$/, '');

/**
 * Carga usuarios. Si no existe ninguno, crea el administrador inicial
 * desde ADMIN_USUARIO / ADMIN_PASSWORD (.env.local, nunca en el código).
 */
export async function listarUsuarios(): Promise<Usuario[]> {
  const store = getStore();
  const usuarios = (await store.leer<Usuario[]>(ARCHIVO)) ?? [];
  const hayAdmin = usuarios.some(u => u.rol === 'admin' && !u.pendiente);
  const usuarioAdmin = normalizarUsuario(process.env.ADMIN_USUARIO || 'egarcerant');
  if (!hayAdmin && process.env.ADMIN_PASSWORD) {
    // Una solicitud de registro pendiente con el mismo usuario no puede bloquear al administrador
    const i = usuarios.findIndex(u => u.usuario === usuarioAdmin);
    if (i >= 0) usuarios.splice(i, 1);
    usuarios.push({
      id: crypto.randomUUID(),
      usuario: usuarioAdmin,
      nombre: process.env.ADMIN_NOMBRE || 'Eduardo Garcerant',
      rol: 'admin',
      hash: hashPassword(process.env.ADMIN_PASSWORD),
      activo: true,
      creadoEn: new Date().toISOString(),
    });
    await store.escribir(ARCHIVO, usuarios);
  }
  return usuarios;
}

export const sinHash = ({ hash: _hash, ...u }: Usuario): UsuarioPublico => u;

// ── Bloqueo por intentos fallidos (en memoria del proceso) ─────────────
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60_000;
const g = globalThis as { __dntIntentos?: Map<string, { n: number; hasta: number }> };
const intentos = (g.__dntIntentos ??= new Map());

export const estaBloqueado = (clave: string) => (intentos.get(clave)?.hasta ?? 0) > Date.now();
export function registrarFallo(clave: string) {
  const n = (intentos.get(clave)?.n ?? 0) + 1;
  intentos.set(clave, { n, hasta: n >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : 0 });
}
export const limpiarIntentos = (clave: string) => intentos.delete(clave);

export type ResultadoLogin = { ok: true; usuario: Usuario } | { ok: false; motivo: 'credenciales' | 'bloqueado' | 'inactivo' | 'pendiente' };

export async function autenticar(usuario: string, password: string): Promise<ResultadoLogin> {
  const clave = normalizarUsuario(usuario);
  if (estaBloqueado(clave)) return { ok: false, motivo: 'bloqueado' };

  const u = (await listarUsuarios()).find(x => x.usuario === clave);
  // Se verifica siempre un hash para no revelar si el usuario existe por tiempo de respuesta
  const valido = verificarPassword(password, u?.hash ?? 'pbkdf2$210000$00$00');
  if (!u || !valido) {
    registrarFallo(clave);
    return { ok: false, motivo: 'credenciales' };
  }
  limpiarIntentos(clave);
  if (u.pendiente) return { ok: false, motivo: 'pendiente' };
  if (!u.activo) return { ok: false, motivo: 'inactivo' };
  return { ok: true, usuario: u };
}

const DOMINIO = '@dusakawiepsi.com';
const MAX_PENDIENTES = 50;

/**
 * Autorregistro de funcionarios EPSI: solo correo institucional. La cuenta queda inactiva
 * y pendiente hasta que un administrador la apruebe y le asigne el rol.
 */
export async function registrarSolicitud(datos: { correo: string; nombre: string; cargo: string; password: string }) {
  const correo = datos.correo.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}@dusakawiepsi\.com$/.test(correo)) throw new Error(`Usa tu correo institucional ${DOMINIO}`);
  const nombre = datos.nombre.trim().replace(/\s+/g, ' ');
  if (nombre.length < 5 || nombre.length > 100) throw new Error('Escribe tu nombre completo');
  if (datos.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const usuario = normalizarUsuario(correo);
  await actualizarJson<Usuario[]>(ARCHIVO, () => [], usuarios => {
    // Mensaje genérico para no revelar qué correos ya tienen cuenta
    if (usuarios.some(u => u.usuario === usuario)) throw new Error('No fue posible registrar la solicitud con ese correo');
    if (usuarios.filter(u => u.pendiente).length >= MAX_PENDIENTES) throw new Error('Hay demasiadas solicitudes pendientes. Intenta más tarde.');
    usuarios.push({
      id: crypto.randomUUID(),
      usuario,
      nombre,
      rol: 'epsi',
      hash: hashPassword(datos.password),
      activo: false,
      pendiente: true,
      correo,
      cargo: datos.cargo.trim().slice(0, 100),
      creadoEn: new Date().toISOString(),
    });
  });
}

/** Administrador: aprueba (con rol) o rechaza (elimina) una solicitud de registro. */
export async function resolverSolicitud(id: string, decision: { aprobar: true; rol: 'epsi' | 'admin' } | { aprobar: false }) {
  await actualizarJson<Usuario[]>(ARCHIVO, () => [], usuarios => {
    const i = usuarios.findIndex(u => u.id === id && u.pendiente);
    if (i < 0) throw new Error('Solicitud no encontrada');
    if (!decision.aprobar) {
      usuarios.splice(i, 1);
      return;
    }
    Object.assign(usuarios[i], { pendiente: false, activo: true, rol: decision.rol });
  });
}

export async function crearUsuario(datos: { usuario: string; nombre: string; rol: RolUsuario; ips?: string; password: string }) {
  const usuarios = await listarUsuarios();
  const usuario = normalizarUsuario(datos.usuario);
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error('Usuario inválido (3–40 caracteres: letras, números, punto, guion)');
  if (usuarios.some(u => u.usuario === usuario)) throw new Error('Ese usuario ya existe');
  if (datos.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  if (datos.rol === 'prestador' && !datos.ips) throw new Error('Un prestador debe tener IPS asignada');
  usuarios.push({
    id: crypto.randomUUID(),
    usuario,
    nombre: datos.nombre.trim(),
    rol: datos.rol,
    ips: datos.rol === 'prestador' ? datos.ips : undefined,
    hash: hashPassword(datos.password),
    activo: true,
    creadoEn: new Date().toISOString(),
  });
  await getStore().escribir(ARCHIVO, usuarios);
}

export async function actualizarUsuario(id: string, cambios: { activo?: boolean; password?: string }) {
  const usuarios = await listarUsuarios();
  const u = usuarios.find(x => x.id === id);
  if (!u) throw new Error('Usuario no encontrado');
  if (cambios.activo === false && u.rol === 'admin' && usuarios.filter(x => x.rol === 'admin' && x.activo).length === 1) {
    throw new Error('No se puede desactivar el único administrador');
  }
  if (cambios.activo !== undefined) u.activo = cambios.activo;
  if (cambios.password) {
    if (cambios.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    u.hash = hashPassword(cambios.password);
  }
  await getStore().escribir(ARCHIVO, usuarios);
}
