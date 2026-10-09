import 'server-only';
import crypto from 'crypto';
import { gzipSync } from 'zlib';
import { enviarCorreo, plantilla } from './correo';
import { getStore } from './dnt/store';
import { horaColombia, hoyColombia } from './fecha';

/**
 * Respaldo diario de la información de la app (03_DATOS_APP):
 * - Se guarda comprimido en Drive (04_RESPALDOS) y se conservan los últimos DIAS_RETENCION.
 * - Se envía un correo de confirmación; si existe BACKUP_PASSWORD, adjunta el respaldo CIFRADO (AES-256-GCM).
 * Los PDF de historias clínicas y la base Excel no se incluyen (ya están en Drive y pesan >185 MB).
 */
const ARCHIVOS = [
  'seguimientos-app.json',
  'historias.json',
  'mensajes.json',
  'prestadores.json',
  'usuarios.json',
  'correos-enviados.json',
  'auditoria-exportaciones.json',
  'ajustes-casos.json',
  'preregistro.json',
  'casos-adicionales.json',
];
const DIAS_RETENCION = 30;
const MAX_ADJUNTO = 20 * 1024 * 1024;
export const DESTINO_RESPALDO = process.env.BACKUP_EMAIL || 'egarcerant@dusakawiepsi.com';

const MAGICO = Buffer.from('NUTRIA1');

/** Cifra con AES-256-GCM; clave derivada de BACKUP_PASSWORD con scrypt. Formato: NUTRIA1|sal|iv|tag|datos. */
export function cifrar(datos: Buffer, clave: string): Buffer {
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const llave = crypto.scryptSync(clave, sal, 32);
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([MAGICO, sal, iv, c.getAuthTag(), cuerpo]);
}

export interface ResultadoRespaldo {
  nombre: string;
  tamano: number;
  registros: Record<string, number>;
  correo: { ok: boolean; motivo?: string };
  eliminados: string[];
}

export async function crearRespaldo(origen: 'automatico' | 'manual', por = 'sistema'): Promise<ResultadoRespaldo> {
  const store = getStore();
  const contenido: Record<string, unknown> = {};
  const registros: Record<string, number> = {};
  for (const nombre of ARCHIVOS) {
    const datos = await store.leer<unknown>(nombre, { fresco: true });
    contenido[nombre] = datos;
    registros[nombre] = Array.isArray(datos) ? datos.length : datos && typeof datos === 'object' ? Object.keys(datos).length : 0;
  }

  const fecha = hoyColombia();
  const hora = horaColombia();
  const nombre = `respaldo-${fecha}-${hora}.json.gz`;
  const paquete = gzipSync(Buffer.from(JSON.stringify({ app: 'Nutria', creado: new Date().toISOString(), origen, por, archivos: contenido })));
  await store.guardarArchivo(nombre, paquete, 'application/gzip');

  // Retención: se eliminan los respaldos de más de DIAS_RETENCION días
  const limite = new Date(Date.now() - DIAS_RETENCION * 864e5).toISOString().slice(0, 10);
  const eliminados: string[] = [];
  for (const r of await store.listarRespaldos()) {
    if (r.nombre.slice(9, 19) < limite) {
      await store.eliminarRespaldo(r.nombre).catch(() => undefined);
      eliminados.push(r.nombre);
    }
  }

  const clave = process.env.BACKUP_PASSWORD;
  const adjunto = clave && paquete.length <= MAX_ADJUNTO ? { nombre: `${nombre}.cifrado`, contenido: cifrar(paquete, clave) } : null;
  const filas: [string, string | number][] = [
    ['Archivo', nombre],
    ['Tamaño', `${(paquete.length / 1024).toFixed(1)} KB`],
    ['Controles (niños con registros en la app)', registros['seguimientos-app.json']],
    ['Historias clínicas registradas', registros['historias.json']],
    ['Mensajes', registros['mensajes.json']],
    ['Prestadores', registros['prestadores.json']],
    ['Usuarios', registros['usuarios.json']],
    ['Respaldos antiguos eliminados', eliminados.length],
  ];
  const { html, texto } = plantilla(
    `Respaldo ${origen === 'automatico' ? 'diario' : 'manual'} · ${fecha} ${hora.replace('h', ':')}`,
    [
      `Se creó el respaldo de la información de Nutria y quedó guardado en Google Drive (carpeta 04_RESPALDOS, se conservan ${DIAS_RETENCION} días).`,
      adjunto
        ? 'Se adjunta una copia CIFRADA (AES-256). Para abrirla use: npx tsx scripts/descifrar-respaldo.ts <archivo> con la clave de respaldo.'
        : 'No se adjunta copia porque no hay clave de respaldo configurada (BACKUP_PASSWORD). El archivo está disponible en Administración → Respaldos.',
    ],
    filas,
  );
  const correo = await enviarCorreo({
    para: [DESTINO_RESPALDO],
    asunto: `Respaldo Nutria ${fecha} ${hora.replace('h', ':')}${adjunto ? ' (adjunto cifrado)' : ''}`,
    html,
    texto,
    adjuntos: adjunto ? [adjunto] : undefined,
  });

  return { nombre, tamano: paquete.length, registros, correo, eliminados };
}
