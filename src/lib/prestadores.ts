import 'server-only';
import { ipsCanonica } from './dnt/catalogo';
import { leerExcel } from './dnt/excel-source';
import { actualizarJson, getStore } from './dnt/store';
import { estaBloqueado, hashPassword, limpiarIntentos, registrarFallo, verificarPassword } from './usuarios';

/**
 * Cuenta de acceso de cada prestador (una por IPS de seguimiento).
 * - Primer ingreso (o tras restablecer el acceso): contraseña inicial 123456 (PRESTADOR_CLAVE_INICIAL).
 * - Es una clave conocida: en ese ingreso se OBLIGA a crear una contraseña personal antes de ver cualquier dato.
 */
export const CLAVE_INICIAL = process.env.PRESTADOR_CLAVE_INICIAL || '123456';

export interface Prestador {
  ips: string;
  nit: string; // sin dígito de verificación
  dv: string;
  hash?: string; // contraseña personal; si no existe, se acepta la clave inicial
  activo: boolean;
  nitConfirmado: boolean; // false si el NIT se tomó automáticamente de SIVIGILA
  actualizadoEn: string;
  /** Pre-registro obligatorio: datos de contacto de la IPS para notificaciones. */
  contacto?: ContactoPrestador;
}

export interface ContactoPrestador {
  responsable: string;
  cargo: string;
  correos: string[];
  whatsapp: string; // celular colombiano de 10 dígitos
  telefono?: string;
  autorizaDatos: boolean; // autorización de tratamiento de datos de contacto (Ley 1581/2012)
  registradoPor: string;
  registradoEn: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Valida y normaliza el pre-registro del prestador. */
export function validarContacto(d: { responsable?: string; cargo?: string; correos?: string; whatsapp?: string; telefono?: string; autoriza?: boolean }): Omit<ContactoPrestador, 'registradoPor' | 'registradoEn'> {
  const responsable = String(d.responsable ?? '').trim().replace(/\s+/g, ' ');
  if (responsable.length < 5) throw new Error('Escribe el nombre completo del responsable');
  const correos = [...new Set(String(d.correos ?? '').split(/[,;\s]+/).map(c => c.trim().toLowerCase()).filter(Boolean))];
  if (!correos.length) throw new Error('Registra al menos un correo de la IPS');
  if (correos.length > 5) throw new Error('Máximo 5 correos');
  const malo = correos.find(c => !CORREO.test(c));
  if (malo) throw new Error(`Correo inválido: ${malo}`);
  const whatsapp = String(d.whatsapp ?? '').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');
  if (!/^3\d{9}$/.test(whatsapp)) throw new Error('El WhatsApp debe ser un celular de 10 dígitos que empiece por 3');
  if (!d.autoriza) throw new Error('Debes autorizar el tratamiento de los datos de contacto');
  return {
    responsable: responsable.slice(0, 100),
    cargo: String(d.cargo ?? '').trim().slice(0, 100),
    correos,
    whatsapp,
    telefono: String(d.telefono ?? '').replace(/[^\d+ -]/g, '').slice(0, 20) || undefined,
    autorizaDatos: true,
  };
}

export type PrestadorPublico = Omit<Prestador, 'hash'> & { tieneClave: boolean };

const ARCHIVO = 'prestadores.json';
const soloDigitos = (v: string) => v.replace(/\D/g, '');

/**
 * NIT por IPS tomado de SIVIGILA (nom_upgd / nit_upgd). SIVIGILA suele concatenar el dígito
 * de verificación: 10 dígitos que inician en 8 o 9 → 9 de NIT + 1 de DV.
 */
async function nitsDesdeSivigila(): Promise<Map<string, { nit: string; dv: string }>> {
  const conteo = new Map<string, Map<string, number>>();
  for (const u of (await leerExcel()).upgd) {
    const ips = ipsCanonica(u.nombre);
    if (!ips || !u.nit || /^0+$/.test(u.nit)) continue;
    const m = conteo.get(ips) ?? new Map<string, number>();
    m.set(u.nit, (m.get(u.nit) ?? 0) + 1);
    conteo.set(ips, m);
  }
  const r = new Map<string, { nit: string; dv: string }>();
  for (const [ips, m] of conteo) {
    const nit = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    r.set(ips, nit.length === 10 && /^[89]/.test(nit) ? { nit: nit.slice(0, 9), dv: nit.slice(9) } : { nit, dv: '' });
  }
  return r;
}

/** Catálogo de prestadores: uno por IPS de seguimiento de la base, con NIT sugerido desde SIVIGILA. */
export async function listarPrestadores(): Promise<Prestador[]> {
  const store = getStore();
  const guardados = (await store.leer<Prestador[]>(ARCHIVO)) ?? [];
  const porIps = new Map(guardados.map(p => [p.ips, p]));
  const sugeridos = await nitsDesdeSivigila();
  let cambios = false;

  for (const ips of new Set((await leerExcel()).casos.map(c => c.ipsSeguimiento))) {
    if (ips === 'SIN IPS ASIGNADA' || porIps.has(ips)) continue;
    const s = sugeridos.get(ips);
    porIps.set(ips, { ips, nit: s?.nit ?? '', dv: s?.dv ?? '', activo: true, nitConfirmado: false, actualizadoEn: new Date().toISOString() });
    cambios = true;
  }
  const lista = [...porIps.values()].sort((a, b) => a.ips.localeCompare(b.ips));
  if (cambios) await store.escribir(ARCHIVO, lista);
  return lista;
}

export const aPublico = ({ hash, ...p }: Prestador): PrestadorPublico => ({ ...p, tieneClave: !!hash });

export type ResultadoPrestador =
  | { ok: true; prestador: Prestador; debeCambiarClave: boolean }
  | { ok: false; motivo: 'credenciales' | 'bloqueado' | 'inactivo' | 'sin-nit' };

export async function autenticarPrestador(ips: string, password: string): Promise<ResultadoPrestador> {
  const clave = `ips:${ips}`;
  if (estaBloqueado(clave)) return { ok: false, motivo: 'bloqueado' };
  const p = (await listarPrestadores()).find(x => x.ips === ips);
  if (!p) return { ok: false, motivo: 'credenciales' };
  if (!p.activo) return { ok: false, motivo: 'inactivo' };

  if (p.hash) {
    if (!verificarPassword(password, p.hash)) return registrarFallo(clave), { ok: false, motivo: 'credenciales' };
    limpiarIntentos(clave);
    return { ok: true, prestador: p, debeCambiarClave: false };
  }
  if (password.trim() !== CLAVE_INICIAL) return registrarFallo(clave), { ok: false, motivo: 'credenciales' };
  limpiarIntentos(clave);
  return { ok: true, prestador: p, debeCambiarClave: true };
}

async function guardar(ips: string, cambio: (p: Prestador) => void) {
  await listarPrestadores(); // asegura que el catálogo exista
  await actualizarJson<Prestador[]>(ARCHIVO, () => [], lista => {
    const p = lista.find(x => x.ips === ips);
    if (!p) throw new Error('Prestador no encontrado');
    cambio(p);
    p.actualizadoEn = new Date().toISOString();
  });
}

/** Dígito de verificación del NIT (algoritmo DIAN, módulo 11). */
export function digitoVerificacion(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const suma = [...nit].reverse().reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11;
  return String(suma >= 2 ? 11 - suma : suma);
}

export function validarNit(nit: string, dv: string): { nit: string; dv: string } {
  const n = soloDigitos(nit);
  const d = soloDigitos(dv);
  if (!/^d{6,10}$/.test(n)) throw new Error('El NIT debe tener entre 6 y 10 dígitos, sin puntos ni dígito de verificación');
  if (!/^d$/.test(d)) throw new Error('Escribe el dígito de verificación del NIT (un solo número)');
  if (digitoVerificacion(n) !== d) throw new Error('El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la IPS');
  return { nit: n, dv: d };
}

export async function guardarContactoPrestador(
  ips: string,
  datos: Parameters<typeof validarContacto>[0] & { nit?: string; dv?: string },
  por: string,
) {
  const c = validarContacto(datos);
  const nit = validarNit(datos.nit ?? '', datos.dv ?? '');
  await guardar(ips, p => {
    p.contacto = { ...c, registradoPor: por, registradoEn: new Date().toISOString() };
    // El NIT declarado por la IPS queda registrado; el administrador lo puede corregir y confirmar
    if (p.nit !== nit.nit || p.dv !== nit.dv) Object.assign(p, nit, { nitConfirmado: false });
  });
}

export async function establecerClavePrestador(ips: string, nueva: string) {
  if (nueva.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  const p = (await listarPrestadores()).find(x => x.ips === ips);
  if (nueva.trim() === CLAVE_INICIAL || /^(d)+$|^(0?123456789?|12345678)$/.test(nueva.trim())) throw new Error('Elige una contraseña distinta a la inicial y que no sea una secuencia');
  if (p && soloDigitos(nueva).length >= 6 && [p.nit, p.nit + p.dv].includes(soloDigitos(nueva))) {
    throw new Error('La nueva contraseña no puede ser el NIT');
  }
  await guardar(ips, x => (x.hash = hashPassword(nueva)));
}

/** Administrador: corrige el NIT, activa/desactiva o restablece el acceso (vuelve a la clave inicial 123456). */
export async function actualizarPrestador(ips: string, cambios: { nit?: string; activo?: boolean; restablecer?: boolean }) {
  await guardar(ips, p => {
    if (cambios.nit !== undefined) {
      const d = soloDigitos(cambios.nit);
      if (d.length < 6) throw new Error('NIT inválido');
      // Si viene con DV (10 dígitos), se separa
      [p.nit, p.dv] = d.length === 10 && /^[89]/.test(d) ? [d.slice(0, 9), d.slice(9)] : [d, ''];
      p.nitConfirmado = true;
    }
    if (cambios.activo !== undefined) p.activo = cambios.activo;
    if (cambios.restablecer) delete p.hash;
  });
}

/** El prestador debe completar el pre-registro (contacto) antes de usar el módulo. */
export async function faltaPreregistro(ips: string | undefined): Promise<boolean> {
  if (!ips) return false;
  const p = (await listarPrestadores()).find(x => x.ips === ips);
  // El pre-registro está completo cuando hay contacto (correo y WhatsApp) y NIT con dígito de verificación
  return !p?.contacto || !p.nit || !p.dv;
}
