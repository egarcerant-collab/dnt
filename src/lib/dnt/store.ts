import 'server-only';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
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
  /** `fresco` ignora la copia en memoria (para leer-modificar-escribir). */
  leer<T>(nombre: string, opciones?: { fresco?: boolean }): Promise<T | null>;
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
    const tmp = `${destino}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`; // único: evita choques entre escrituras simultáneas
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

export class DriveStore implements JsonStore {
  readonly tipo = 'drive' as const;
  constructor(private folderId: string, private credenciales: object) {}

  private auth?: Promise<import('google-auth-library').GoogleAuth>;

  /** Una sola autenticación por instancia: el token se reutiliza y se renueva solo. */
  private credencialesAuth() {
    this.auth ??= import('googleapis').then(({ google }) =>
      new google.auth.GoogleAuth({ credentials: this.credenciales, scopes: ['https://www.googleapis.com/auth/drive'] }),
    );
    return this.auth;
  }

  /**
   * Inicia una subida reanudable para que el NAVEGADOR envíe el archivo directo a Drive
   * (evita el límite de 4,5 MB de Vercel). Devuelve la URL de subida de Google.
   */
  async iniciarSubidaDirecta(nombre: string, mime: string, tamano: number, origen: string): Promise<string> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    const carpeta = await this.carpetaId(DriveStore.carpetaPara(nombre));
    const token = await (await this.credencialesAuth()).getAccessToken();
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,size,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(tamano),
        Origin: origen, // Google habilita CORS para este origen en la URL de subida
      },
      body: JSON.stringify({ name: nombre, parents: [carpeta], mimeType: mime }),
    });
    const url = res.headers.get('location');
    if (!res.ok || !url) throw new Error(`Drive no aceptó la subida (${res.status})`);
    return url;
  }

  /** Verifica un archivo subido directo: nombre esperado, tamaño y firma real (primeros bytes). */
  async verificarSubida(fileId: string, nombreEsperado: string): Promise<{ tamano: number; inicio: Buffer }> {
    const drive = await this.drive();
    const meta = await drive.files.get({ fileId, fields: 'id,name,size,parents', supportsAllDrives: true });
    if (meta.data.name !== nombreEsperado) throw new Error('El archivo subido no corresponde a la autorización');
    const token = await (await this.credencialesAuth()).getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-15' },
    });
    const inicio = Buffer.from(await res.arrayBuffer());
    this.ids.set(nombreEsperado, fileId);
    return { tamano: Number(meta.data.size ?? 0), inicio };
  }

  async eliminarPorId(fileId: string) {
    const drive = await this.drive();
    await drive.files.delete({ fileId, supportsAllDrives: true }).catch(() => undefined);
  }

  /** Descarga como flujo (sin cargar todo en memoria) para archivos grandes. */
  async descargarFlujo(nombre: string): Promise<ReadableStream<Uint8Array> | null> {
    const { id } = await this.buscarId(nombre);
    if (!id) return null;
    const token = await (await this.credencialesAuth()).getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) {
      this.ids.delete(nombre);
      return null;
    }
    if (!res.ok || !res.body) throw new Error(`No se pudo descargar de Drive (${res.status})`);
    return res.body;
  }

  private carpetas = new Map<string, Promise<string>>();
  /** Id de cada archivo en Drive (evita buscarlo en cada lectura). */
  private ids = new Map<string, string>();
  /** Copia en memoria de los JSON leídos; se actualiza al escribir. */
  private cacheJson = new Map<string, { hasta: number; valor: unknown }>();
  private static TTL_JSON_MS = 15_000;
  private cliente?: Promise<import('googleapis').drive_v3.Drive>;

  /** Un solo cliente autenticado por instancia: el token se reutiliza y se renueva solo. */
  private drive() {
    // La cuenta de servicio solo ve las carpetas compartidas con ella
    this.cliente ??= Promise.all([import('googleapis'), this.credencialesAuth()]).then(([{ google }, auth]) => google.drive({ version: 'v3', auth }));
    return this.cliente;
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
    const conocido = this.ids.get(nombre);
    if (conocido) return { id: conocido, carpeta };
    const drive = await this.drive();
    const seguro = nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `'${carpeta}' in parents and name='${seguro}' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const id = res.data.files?.[0]?.id ?? null;
    if (id) this.ids.set(nombre, id); // los ids de Drive no cambian
    return { id, carpeta };
  }

  private async descargar(nombre: string, id: string): Promise<Buffer | null> {
    const drive = await this.drive();
    try {
      const res = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      return Buffer.from(res.data as ArrayBuffer);
    } catch (e: any) {
      if (e?.code === 404) {
        this.ids.delete(nombre); // borrado manualmente en Drive
        return null;
      }
      throw e;
    }
  }

  private async subir(nombre: string, contenido: Buffer | string, mime: string): Promise<void> {
    const drive = await this.drive();
    const media = { mimeType: mime, body: Readable.from([contenido]) };
    const { id, carpeta } = await this.buscarId(nombre);
    if (id) {
      await drive.files.update({ fileId: id, media, supportsAllDrives: true });
      return;
    }
    const creado = await drive.files.create({
      requestBody: { name: nombre, parents: [carpeta], mimeType: mime },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
    if (creado.data.id) this.ids.set(nombre, creado.data.id);
  }

  async leer<T>(nombre: string, opciones?: { fresco?: boolean }): Promise<T | null> {
    const c = this.cacheJson.get(nombre);
    if (!opciones?.fresco && c && c.hasta > Date.now()) return structuredClone(c.valor) as T | null;
    const { id } = await this.buscarId(nombre);
    const contenido = id ? await this.descargar(nombre, id) : null;
    const valor = contenido ? (JSON.parse(contenido.toString('utf-8')) as T) : null;
    this.cacheJson.set(nombre, { hasta: Date.now() + DriveStore.TTL_JSON_MS, valor });
    return structuredClone(valor);
  }

  async escribir(nombre: string, data: unknown): Promise<void> {
    await this.subir(nombre, JSON.stringify(data, null, 2), 'application/json');
    this.cacheJson.set(nombre, { hasta: Date.now() + DriveStore.TTL_JSON_MS, valor: structuredClone(data) });
  }

  async guardarArchivo(nombre: string, contenido: Buffer, mime: string): Promise<void> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    await this.subir(nombre, contenido, mime);
  }

  async leerArchivo(nombre: string): Promise<Buffer | null> {
    if (!NOMBRE_SEGURO.test(nombre)) throw new Error('Nombre de archivo inválido');
    const { id } = await this.buscarId(nombre);
    return id ? this.descargar(nombre, id) : null;
  }
}

/** Estructura de carpetas dentro de la carpeta raíz de Drive (GDRIVE_FOLDER_ID). */
export const CARPETAS_DRIVE = {
  base: '01_BASE_SEGUIMIENTO',
  historias: '02_HISTORIAS_CLINICAS',
  datos: '03_DATOS_APP',
} as const;

/**
 * Credenciales de la cuenta de servicio: contenido en GOOGLE_SERVICE_ACCOUNT_JSON (Vercel)
 * o ruta al archivo .json en GOOGLE_SERVICE_ACCOUNT_FILE (uso local, sin copiar la clave).
 */
function credencialesCrudas(): string | undefined {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const archivo = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!archivo) return undefined;
  try {
    return readFileSync(archivo, 'utf-8');
  } catch {
    throw new Error(`No se pudo leer GOOGLE_SERVICE_ACCOUNT_FILE (${archivo})`);
  }
}

let instancia: JsonStore | null = null;

export function getStore(): JsonStore {
  if (instancia) return instancia;
  const folderId = process.env.GDRIVE_FOLDER_ID;
  const raw = credencialesCrudas();
  if (folderId && raw) {
    let credenciales: { client_email?: string; private_key?: string };
    try {
      credenciales = JSON.parse(raw);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido: pegue el contenido completo del archivo .json');
    }
    if (!credenciales.client_email || !credenciales.private_key) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no tiene client_email o private_key: use la clave JSON de la cuenta de servicio');
    }
    instancia = new DriveStore(folderId, credenciales);
  } else {
    instancia = new LocalStore();
  }
  return instancia;
}

/** Diagnóstico de la conexión con el almacenamiento (sin exponer secretos). */
export async function diagnosticarStore(): Promise<Record<string, unknown>> {
  const r: Record<string, unknown> = {
    GDRIVE_FOLDER_ID: process.env.GDRIVE_FOLDER_ID ? 'configurado' : 'FALTA',
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'configurado' : 'FALTA',
  };
  try {
    const raw = credencialesCrudas();
    if (raw) r.cuentaServicio = JSON.parse(raw).client_email ?? 'sin client_email';
  } catch {
    r.cuentaServicio = 'JSON inválido';
  }
  try {
    const store = getStore();
    r.almacenamiento = store.tipo;
    await store.leer('diagnostico.json');
    await store.escribir('diagnostico.json', { ultimaPrueba: new Date().toISOString() });
    r.lecturaEscritura = 'OK';
  } catch (e) {
    const msg = (e as Error).message;
    r.lecturaEscritura = 'ERROR';
    r.detalle = /not found|File not found|404/i.test(msg)
      ? 'La cuenta de servicio no tiene acceso a la carpeta: compártala como Editor con el correo de cuentaServicio'
      : msg;
  }
  return r;
}

// ── Escritura serializada por archivo ──────────────────────────────────
// Evita que dos prestadores guardando al mismo tiempo se sobrescriban (leer-modificar-escribir).
// Válido para una sola instancia del servidor; con varias instancias se requiere base de datos.
const colas = new Map<string, Promise<unknown>>();

export function actualizarJson<T>(nombre: string, inicial: () => T, cambio: (datos: T) => void | Promise<void>): Promise<T> {
  const previa = colas.get(nombre) ?? Promise.resolve();
  const tarea = previa.catch(() => undefined).then(async () => {
    const store = getStore();
    const datos = (await store.leer<T>(nombre, { fresco: true })) ?? inicial();
    await cambio(datos);
    await store.escribir(nombre, datos);
    return datos;
  });
  colas.set(nombre, tarea);
  return tarea;
}
