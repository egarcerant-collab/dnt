import 'server-only';
import crypto from 'crypto';
import { actualizarJson, getStore } from './store';

/** Historias clínicas cargadas por los prestadores (metadatos; el archivo va al almacenamiento). */
export interface HistoriaClinica {
  id: string;
  casoId: string;
  ips: string;
  /** Número de control al que corresponde (cada control debe tener su historia clínica). */
  control?: number;
  nombreOriginal: string;
  archivo: string; // nombre interno generado (uuid.ext)
  mime: string;
  tamano: number;
  subidoPor: string;
  fecha: string;
  /** Origen de la carga: app (navegador) o carga masiva desde carpetas de la IPS. */
  origen?: 'app' | 'carga-masiva';
  /**
   * Anulación por el administrador. El archivo NO se borra de Drive: la historia clínica
   * debe conservarse (Res. 1995/1999); solo deja de mostrarse y queda la trazabilidad.
   */
  anulada?: { por: string; fecha: string; motivo: string };
}

const ARCHIVO = 'historias.json';
/** Subida directa del navegador a Drive. */
export const TAMANO_MAX = 30 * 1024 * 1024;
/** Subida a través del servidor (solo almacenamiento local o respaldo): límite de Vercel. */
export const TAMANO_MAX_SERVIDOR = 4 * 1024 * 1024;

export type TipoArchivo = { mime: string; ext: 'pdf' | 'jpg' | 'png' };

/** Detecta el tipo real por la firma del archivo, no por la extensión que manda el navegador. */
export function detectarTipo(b: Buffer): TipoArchivo | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  return null;
}

/** Tipo esperado según lo que declara el navegador (se confirma luego con la firma del archivo). */
export function tipoDeclarado(mime: string, nombre: string): TipoArchivo | null {
  if (mime === 'application/pdf' || /\.pdf$/i.test(nombre)) return { mime: 'application/pdf', ext: 'pdf' };
  if (mime === 'image/jpeg' || /\.jpe?g$/i.test(nombre)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (mime === 'image/png' || /\.png$/i.test(nombre)) return { mime: 'image/png', ext: 'png' };
  return null;
}

export const limpiarNombre = (n: string) => n.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120);

/** Por defecto excluye las anuladas; `incluirAnuladas` se usa para auditoría. */
export async function listarHistorias(casoId?: string, opciones?: { incluirAnuladas?: boolean }): Promise<HistoriaClinica[]> {
  const todas = (await getStore().leer<HistoriaClinica[]>(ARCHIVO)) ?? [];
  return todas.filter(h => (!casoId || h.casoId === casoId) && (opciones?.incluirAnuladas || !h.anulada));
}

export async function anularHistoria(id: string, por: string, motivo: string) {
  const m = motivo.trim();
  if (m.length < 5) throw new Error('Escribe el motivo de la eliminación (mínimo 5 caracteres)');
  await actualizarJson<HistoriaClinica[]>(ARCHIVO, () => [], lista => {
    const h = lista.find(x => x.id === id);
    if (!h) throw new Error('Historia clínica no encontrada');
    if (h.anulada) throw new Error('La historia clínica ya fue eliminada');
    h.anulada = { por, fecha: new Date().toISOString(), motivo: m.slice(0, 300) };
  });
}

/** Registra los metadatos de un archivo ya guardado en el almacenamiento. */
export async function registrarHistoria(h: Omit<HistoriaClinica, 'fecha'> & { fecha?: string }) {
  await actualizarJson<HistoriaClinica[]>(ARCHIVO, () => [], lista => {
    if (lista.some(x => x.id === h.id)) return; // idempotente
    lista.push({ ...h, nombreOriginal: limpiarNombre(h.nombreOriginal), fecha: h.fecha ?? new Date().toISOString() });
  });
}

/** Subida a través del servidor (almacenamiento local o archivos pequeños). */
export async function guardarHistoria(datos: { casoId: string; ips: string; control?: number; nombreOriginal: string; contenido: Buffer; subidoPor: string }) {
  if (datos.contenido.length > TAMANO_MAX_SERVIDOR) throw new Error('El archivo supera 4 MB');
  const tipo = detectarTipo(datos.contenido);
  if (!tipo) throw new Error('Solo se permiten archivos PDF, JPG o PNG');

  const id = crypto.randomUUID();
  const archivo = `${id}.${tipo.ext}`;
  await getStore().guardarArchivo(archivo, datos.contenido, tipo.mime);
  await registrarHistoria({
    id, casoId: datos.casoId, ips: datos.ips, control: datos.control, nombreOriginal: datos.nombreOriginal,
    archivo, mime: tipo.mime, tamano: datos.contenido.length, subidoPor: datos.subidoPor, origen: 'app',
  });
}
