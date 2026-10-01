import 'server-only';
import crypto from 'crypto';
import { actualizarJson, getStore } from './store';

/** Historias clínicas cargadas por los prestadores (metadatos; el archivo va al almacenamiento). */
export interface HistoriaClinica {
  id: string;
  casoId: string;
  ips: string;
  nombreOriginal: string;
  archivo: string; // nombre interno generado (uuid.ext)
  mime: string;
  tamano: number;
  subidoPor: string;
  fecha: string;
}

const ARCHIVO = 'historias.json';
export const TAMANO_MAX = 10 * 1024 * 1024;

/** Detecta el tipo real por la firma del archivo, no por la extensión que manda el navegador. */
export function detectarTipo(b: Buffer): { mime: string; ext: 'pdf' | 'jpg' | 'png' } | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  return null;
}

export async function listarHistorias(casoId?: string): Promise<HistoriaClinica[]> {
  const todas = (await getStore().leer<HistoriaClinica[]>(ARCHIVO)) ?? [];
  return casoId ? todas.filter(h => h.casoId === casoId) : todas;
}

export async function guardarHistoria(datos: { casoId: string; ips: string; nombreOriginal: string; contenido: Buffer; subidoPor: string }) {
  if (datos.contenido.length > TAMANO_MAX) throw new Error('El archivo supera 10 MB');
  const tipo = detectarTipo(datos.contenido);
  if (!tipo) throw new Error('Solo se permiten archivos PDF, JPG o PNG');

  const id = crypto.randomUUID();
  const archivo = `${id}.${tipo.ext}`;
  const store = getStore();
  await store.guardarArchivo(archivo, datos.contenido, tipo.mime);

  await actualizarJson<HistoriaClinica[]>(ARCHIVO, () => [], lista => {
  lista.push({
    id,
    casoId: datos.casoId,
    ips: datos.ips,
    nombreOriginal: datos.nombreOriginal.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120),
    archivo,
    mime: tipo.mime,
    tamano: datos.contenido.length,
    subidoPor: datos.subidoPor,
    fecha: new Date().toISOString(),
  });
  });
}
