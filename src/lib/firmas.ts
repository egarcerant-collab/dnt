import 'server-only';
import crypto from 'crypto';
import { actualizarJson, getStore } from './dnt/store';
import { listarUsuarios, type FirmaUsuario, type Usuario } from './usuarios';

/**
 * Firmas digitalizadas de los funcionarios EPSI para los informes PDF.
 * Cada usuario solo administra la suya; puede permitir que otros la incluyan en sus informes.
 */
const MAX_BYTES = 500 * 1024;

function tipoImagen(b: Buffer): 'png' | 'jpg' | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}

const nombreArchivo = (usuarioId: string, ext: string) =>
  `firma-${crypto.createHash('sha256').update(usuarioId).digest('hex').slice(0, 20)}.${ext}`;

export async function guardarFirma(usuarioId: string, datos: { imagen?: Buffer; cargo: string; compartida: boolean }) {
  const cargo = datos.cargo.trim();
  if (cargo.length < 3 || cargo.length > 80) throw new Error('Indica tu cargo (entre 3 y 80 caracteres)');
  let archivo: string | undefined;
  if (datos.imagen?.length) {
    if (datos.imagen.length > MAX_BYTES) throw new Error('La imagen de la firma no puede superar 500 KB');
    const ext = tipoImagen(datos.imagen);
    if (!ext) throw new Error('La firma debe ser una imagen PNG o JPG');
    archivo = nombreArchivo(usuarioId, ext);
    await getStore().guardarArchivo(archivo, datos.imagen, ext === 'png' ? 'image/png' : 'image/jpeg');
  }
  await actualizarJson<Usuario[]>('usuarios.json', () => [], usuarios => {
    const u = usuarios.find(x => x.id === usuarioId);
    if (!u) throw new Error('Usuario no encontrado');
    const actual = archivo ?? u.firma?.archivo;
    if (!actual) throw new Error('Adjunta la imagen de tu firma');
    u.firma = { archivo: actual, cargo, compartida: datos.compartida, actualizada: new Date().toISOString() };
  });
}

export async function quitarFirma(usuarioId: string) {
  await actualizarJson<Usuario[]>('usuarios.json', () => [], usuarios => {
    const u = usuarios.find(x => x.id === usuarioId);
    if (u) delete u.firma;
  });
}

export interface Firmante {
  id: string;
  nombre: string;
  firma: FirmaUsuario;
}

/** Firmantes que puede usar un usuario: su propia firma y las compartidas por otros funcionarios activos. */
export async function firmantesDisponibles(usuarioId: string): Promise<Firmante[]> {
  return (await listarUsuarios())
    .filter(u => u.firma && u.activo && !u.pendiente && u.rol !== 'prestador' && (u.id === usuarioId || u.firma.compartida))
    .map(u => ({ id: u.id, nombre: u.nombre, firma: u.firma! }));
}

export async function imagenFirma(archivo: string): Promise<Buffer | null> {
  return getStore().leerArchivo(archivo);
}
