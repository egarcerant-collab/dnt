import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { RolUsuario } from './usuarios';

/** Sesión firmada con HMAC-SHA256 en cookie httpOnly. */
export type Rol = RolUsuario;
export interface Sesion {
  id: string;
  usuario: string;
  rol: Rol;
  nombre: string;
  ips?: string; // IPS del prestador
  debeCambiarClave?: boolean; // reservado: obliga a cambiar la contraseña antes de continuar
  usaNit?: boolean; // el prestador ingresó con el NIT (se le recomienda crear contraseña personal)
  exp: number; // epoch en segundos
}

export const COOKIE = 'dnt_sesion';
export const DURACION_SEG = 60 * 60 * 10;

// En desarrollo se genera un secreto por proceso (compartido entre bundles vía globalThis).
// Se resuelve al usarse (no al importar) para que `next build` no lo exija.
const g = globalThis as { __dntSecreto?: string };
function secreto(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Sin SESSION_SECRET se deriva una clave de ADMIN_PASSWORD (scrypt), igual en todas las instancias.
  // Recomendado: definir SESSION_SECRET propio en producción.
  if (process.env.ADMIN_PASSWORD) {
    return (g.__dntSecreto ??= crypto.scryptSync(process.env.ADMIN_PASSWORD, 'dnt-dusakawi-sesion', 32).toString('hex'));
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Falta la variable ADMIN_PASSWORD (o SESSION_SECRET) en el servidor');
  return (g.__dntSecreto ??= crypto.randomBytes(32).toString('hex'));
}

function firmar(valor: string) {
  return crypto.createHmac('sha256', secreto()).update(valor).digest('base64url');
}

export function codificarSesion(s: Omit<Sesion, 'exp'>): string {
  const cuerpo = Buffer.from(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + DURACION_SEG })).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function decodificarSesion(token: string | undefined): Sesion | null {
  if (!token) return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = firmar(cuerpo);
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const s = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf-8')) as Sesion;
    if (!s.id || !['admin', 'epsi', 'prestador'].includes(s.rol)) return null;
    if (!s.exp || s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSesion(): Promise<Sesion | null> {
  return decodificarSesion((await cookies()).get(COOKIE)?.value);
}

/** Página inicial de cada rol. El administrador usa la vista EPSI. */
export const rutaInicio = (rol: Rol) => (rol === 'prestador' ? '/prestador' : '/epsi');
export const esEpsi = (rol: Rol) => rol === 'epsi' || rol === 'admin';
