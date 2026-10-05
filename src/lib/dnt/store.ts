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
  /** Respaldos diarios guardados (04_RESPALDOS en Drive). */
  listarRespaldos(): Promise<ArchivoRespaldo[]>;
  eliminarRespaldo(nombre: string): Promise<void>;
}

const NOMBRE_SEGURO = /^([a-z0-9-]+\.(pdf|jpg|png|xlsx)|respaldo-\d{4}-\d{2}-\d{2}(-\d{2}h\d{2})?\.json\.gz)$/;
export const esRespaldo = (n: string) => /^respaldo-\d{4}-\d{2}-\d{2}(-\d{2}h\d{2})?\.json\.gz$/.test(n);
export interface ArchivoRespaldo { nombre: string; tamano: number; fecha: string }

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

  async listarRespaldos(): Promise<ArchivoRespaldo[]> {
    const dir = path.join(this.dir, 'archivos');
    const nombres = await fs.readdir(dir).catch(() => [] as string[]);
    const r = await Promise.all(
      nombres.filter(esRespaldo).map(async nombre => {
        const st = await fs.stat(path.join(dir, nombre));
        return { nombre, tamano: st.size, fecha: st.mtime.toISOString() };
      }),
    );
    return r.sort((a, b) => b.nombre.localeCompare(a.nombre));
  }

  async eliminarRespaldo(nombre: string): Promise<void> {
    if (!esRespaldo(nombre)) throw new Error('Nombre de respaldo inválido');
    await fs.rm(this.rutaArchivo(nombre), { force: true });
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
  private static TTL_JSON_MS = 30_000;
  private cliente?: Promise<import('googleapis').drive_v3.Drive>;

  /** Un solo cliente autenticado por instancia: el token se reutiliza y se renueva solo. */
  private drive() {
    // La cuenta de servicio solo ve las carpetas compartidas con ella
    this.cliente ??= Promise.all([import('googleapis'), this.credencialesAuth()]).then(([{ google }, auth]) => google.drive({ version: 'v3', auth }));
    return this.cliente;
  }

  /** Subcarpeta de DESNUTRICION según el tipo de archivo. */
  private static carpetaPara(nombre: string): string {
    if (esRespaldo(nombre)) return CARPETAS_DRIVE.respaldos;
    if (nombre.startsWith('firma-')) return CARPETAS_DRIVE.datos;
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

  /** Lecturas en curso por archivo (evita pedir el mismo archivo varias veces a la vez). */
  private enCurso = new Map<string, Promise<unknown>>();
  /** Pasado el TTL se sirve la copia en memoria y se refresca en segundo plano, hasta este límite. */
  private static MAX_OBSOLETO_MS = 10 * 60_000;

  private refrescar<T>(nombre: string): Promise<T | null> {
    let p = this.enCurso.get(nombre) as Promise<T | null> | undefined;
    if (!p) {
      p = (async () => {
        const { id } = await this.buscarId(nombre);
        const contenido = id ? await this.descargar(nombre, id) : null;
        const valor = contenido ? (JSON.parse(contenido.toString('utf-8')) as T) : null;
        this.cacheJson.set(nombre, { hasta: Date.now() + DriveStore.TTL_JSON_MS, valor });
        return valor;
      })().finally(() => this.enCurso.delete(nombre));
      this.enCurso.set(nombre, p);
    }
    return p;
  }

  /**
   * Lectura con "stale-while-revalidate": responde al instante con la copia en memoria y,
   * si ya venció, la actualiza desde Drive en segundo plano. `fresco` obliga a leer de Drive
   * (se usa al guardar, para no pisar cambios de otros usuarios).
   */
  async leer<T>(nombre: string, opciones?: { fresco?: boolean }): Promise<T | null> {
    const c = this.cacheJson.get(nombre);
    const ahora = Date.now();
    if (!opciones?.fresco && c) {
      if (c.hasta > ahora) return structuredClone(c.valor) as T | null;
      if (c.hasta + DriveStore.MAX_OBSOLETO_MS > ahora) {
        this.refrescar<T>(nombre).catch(() => undefined);
        return structuredClone(c.valor) as T | null;
      }
    }
    return structuredClone(await this.refrescar<T>(nombre));
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

  async listarRespaldos(): Promise<ArchivoRespaldo[]> {
    const carpeta = await this.carpetaId(CARPETAS_DRIVE.respaldos);
    const drive = await this.drive();
    const res = await drive.files.list({
      q: `'${carpeta}' in parents and trashed=false and name contains 'respaldo-'`,
      fields: 'files(id,name,size,createdTime)',
      orderBy: 'name desc',
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (res.data.files ?? [])
      .filter(f => f.name && esRespaldo(f.name))
      .map(f => {
        this.ids.set(f.name!, f.id!);
        return { nombre: f.name!, tamano: Number(f.size ?? 0), fecha: f.createdTime ?? '' };
      });
  }

  async eliminarRespaldo(nombre: string): Promise<void> {
    if (!esRespaldo(nombre)) throw new Error('Nombre de respaldo inválido');
    const { id } = await this.buscarId(nombre);
    if (!id) return;
    const drive = await this.drive();
    await drive.files.delete({ fileId: id, supportsAllDrives: true });
    this.ids.delete(nombre);
  }
}

/** Estructura de carpetas dentro de la carpeta raíz de Drive (GDRIVE_FOLDER_ID). */
export const CARPETAS_DRIVE = {
  base: '01_BASE_SEGUIMIENTO',
  historias: '02_HISTORIAS_CLINICAS',
  datos: '03_DATOS_APP',
  respaldos: '04_RESPALDOS',
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
