import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

/**
 * Almacenamiento de documentos JSON.
 * - DriveStore: misma idea que PGP (JSON en una carpeta de Google Drive vía cuenta de servicio),
 *   pero sin compartir archivos públicamente y escapando las consultas.
 * - LocalStore: data/app/*.json, para desarrollo sin credenciales.
 */
export interface JsonStore {
  readonly tipo: 'drive' | 'local';
  leer<T>(nombre: string): Promise<T | null>;
  escribir(nombre: string, data: unknown): Promise<void>;
  /** Archivos binarios (historias clínicas). `nombre` lo genera el sistema, nunca el usuario. */
  guardarArchivo(nombre: string, contenido: Buffer, mime: string): Promise<void>;
  leerArchivo(nombre: string): Promise<Buffer | null>;
}

const NOMBRE_SEGURO = /^[a-z0-9-]+\.(pdf|jpg|png|xlsx)$/;

class LocalStore implements JsonStore {
  readonly tipo = 'local' as const;
  // En Vercel el disco del proyecto es de solo lectura: /tmp funciona pero se BORRA en cada reinicio.
  // En producción configure Google Drive (GDRIVE_FOLDER_ID + GOOGLE_SERVICE_ACCOUNT_JSON).
  private dir = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/dnt' : path.join(process.cwd(), 'data', 'app'));

  async leer<T>(nombre: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, nombre), 'utf-8')) as T;
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async escribir(nombre: string, data: unknown): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const destino = path.join(this.dir, nombre);
    const tmp = `${destino}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, destino); // escritura atómica
  }

  private rutaArchivo(nombre: string) {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    return path.join(this.dir, 'archivos', nombre);
  }

  async guardarArchivo(nombre: string, contenido: Buffer): Promise<void> {
    await fs.mkdir(path.join(this.dir, 'archivos'), { recursive: true });
    await fs.writeFile(this.rutaArchivo(nombre), contenido);
  }

  async leerArchivo(nombre: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.rutaArchivo(nombre));
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
}

class DriveStore implements JsonStore {
  readonly tipo = 'drive' as const;
  constructor(private folderId: string, private credenciales: object) {}

  private carpetas = new Map<string, Promise<string>>();

  private async drive() {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: this.credenciales,
      // La cuenta de servicio solo ve las carpetas compartidas con ella
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  }

  /** Subcarpeta de DESNUTRICION según el tipo de archivo. */
  private static carpetaPara(nombre: string): string {
    if (nombre.endsWith('.xlsx')) return CARPETAS_DRIVE.base;
    if (/\.(pdf|jpg|png)$/.test(nombre)) return CARPETAS_DRIVE.historias;
    return CARPETAS_DRIVE.datos;
  }

  /** Id de la subcarpeta (la crea si no existe). Se memoriza por proceso. */
  private carpetaId(nombreCarpeta: string): Promise<string> {
    let id = this.carpetas.get(nombreCarpeta);
    if (!id) {
      id = (async () => {
        const drive = await this.drive();
        const res = await drive.files.list({
          q: `'${this.folderId}' in parents and name='${nombreCarpeta}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        const existente = res.data.files?.[0]?.id;
        if (existente) return existente;
        const creada = await drive.files.create({
          requestBody: { name: nombreCarpeta, parents: [this.folderId], mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
          supportsAllDrives: true,
        });
        return creada.data.id!;
      })();
      id.catch(() => this.carpetas.delete(nombreCarpeta));
      this.carpetas.set(nombreCarpeta, id);
    }
    return id;
  }

  private async buscarId(nombre: string): Promise<{ id: string | null; carpeta: string }> {
    const carpeta = await this.carpetaId(DriveStore.carpetaPara(nombre));
    const drive = await this.drive();
    const seguro = nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `'${carpeta}' in parents and name='${seguro}' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return { id: res.data.files?.[0]?.id ?? null, carpeta };
  }

  private async descargar(id: string): Promise<Buffer> {
    const drive = await this.drive();
    const res = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data as ArrayBuffer);
  }

  private async subir(nombre: string, contenido: Buffer | string, mime: string): Promise<void> {
    const drive = await this.drive();
    const media = { mimeType: mime, body: Readable.from([contenido]) };
    const { id, carpeta } = await this.buscarId(nombre);
    if (id) {
      await drive.files.update({ fileId: id, media, supportsAllDrives: true });
      return;
    }
    await drive.files.create({
      requestBody: { name: nombre, parents: [carpeta], mimeType: mime },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
  }

  async leer<T>(nombre: string): Promise<T | null> {
    const { id } = await this.buscarId(nombre);
    return id ? (JSON.parse((await this.descargar(id)).toString('utf-8')) as T) : null;
  }

  async escribir(nombre: string, data: unknown): Promise<void> {
    await this.subir(nombre, JSON.stringify(data, null, 2), 'application/json');
  }

  async guardarArchivo(nombre: string, contenido: Buffer, mime: string): Promise<void> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    await this.subir(nombre, contenido, mime);
  }

  async leerArchivo(nombre: string): Promise<Buffer | null> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    const { id } = await this.buscarId(nombre);
    return id ? this.descargar(id) : null;
  }
}

/** Estructura de carpetas dentro de la carpeta raíz de Drive (GDRIVE_FOLDER_ID). */
export const CARPETAS_DRIVE = {
  base: '01_BASE_SEGUIMIENTO',
  historias: '02_HISTORIAS_CLINICAS',
  datos: '03_DATOS_APP',
} as const;

let instancia: JsonStore | null = null;

export function getStore(): JsonStore {
  if (instancia) return instancia;
  const folderId = process.env.GDRIVE_FOLDER_ID;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  instancia = folderId && raw ? new DriveStore(folderId, JSON.parse(raw)) : new LocalStore();
  return instancia;
}

// ── Escritura serializada por archivo ──────────────────────────────────
// Evita que dos prestadores guardando al mismo tiempo se sobrescriban (leer-modificar-escribir).
// Válido para una sola instancia del servidor; con varias instancias se requiere base de datos.
const colas = new Map<string, Promise<unknown>>();

export function actualizarJson<T>(nombre: string, inicial: () => T, cambio: (datos: T) => void | Promise<void>): Promise<T> {
  const previa = colas.get(nombre) ?? Promise.resolve();
  const tarea = previa.catch(() => undefined).then(async () => {
    const store = getStore();
    const datos = (await store.leer<T>(nombre)) ?? inicial();
    await cambio(datos);
    await store.escribir(nombre, datos);
    return datos;
  });
  colas.set(nombre, tarea);
  return tarea;
}
