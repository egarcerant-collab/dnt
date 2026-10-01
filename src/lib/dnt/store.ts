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

  private async drive() {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: this.credenciales,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    return google.drive({ version: 'v3', auth });
  }

  private async buscarId(nombre: string): Promise<string | null> {
    const drive = await this.drive();
    const seguro = nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `'${this.folderId}' in parents and name='${seguro}' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files?.[0]?.id ?? null;
  }

  async leer<T>(nombre: string): Promise<T | null> {
    const id = await this.buscarId(nombre);
    if (!id) return null;
    const drive = await this.drive();
    const res = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    return JSON.parse(Buffer.from(res.data as ArrayBuffer).toString('utf-8')) as T;
  }

  async escribir(nombre: string, data: unknown): Promise<void> {
    const drive = await this.drive();
    const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(data, null, 2)]) };
    const id = await this.buscarId(nombre);
    if (id) {
      await drive.files.update({ fileId: id, media, supportsAllDrives: true });
    } else {
      await drive.files.create({
        requestBody: { name: nombre, parents: [this.folderId], mimeType: 'application/json' },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
    }
  }

  async guardarArchivo(nombre: string, contenido: Buffer, mime: string): Promise<void> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    const drive = await this.drive();
    const media = { mimeType: mime, body: Readable.from([contenido]) };
    const id = await this.buscarId(nombre);
    if (id) {
      await drive.files.update({ fileId: id, media, supportsAllDrives: true });
      return;
    }
    await drive.files.create({
      requestBody: { name: nombre, parents: [this.folderId], mimeType: mime },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
  }

  async leerArchivo(nombre: string): Promise<Buffer | null> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    const id = await this.buscarId(nombre);
    if (!id) return null;
    const drive = await this.drive();
    const res = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data as ArrayBuffer);
  }
}

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
