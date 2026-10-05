/**
 * Carga masiva de historias clínicas desde las carpetas de las IPS a Google Drive.
 *
 * 1) Simulación (no sube nada; genera asignacion-historias.csv dentro de la carpeta para revisar):
 *    npx tsx scripts/importar-historias.ts --carpeta "C:/.../SEGUIMIENTOS DNT 2026" --base "C:/.../BASE.xlsx"
 *
 * 2) Carga real (lee el CSV revisado si existe):
 *    npx tsx scripts/importar-historias.ts --carpeta "C:/.../SEGUIMIENTOS DNT 2026" --credenciales "C:/.../clave.json" --aplicar
 *
 * Empareja cada PDF con un niño (documento en la ruta o nombre) y con el control de la MISMA fecha
 * que trae el nombre del archivo. Los PDF van directo a Drive (sin el límite de Vercel).
 * Se niega a subir si la carpeta raíz de Drive está compartida con "cualquier persona con el enlace".
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import { ipsCanonica } from '../src/lib/dnt/catalogo';

// ── Argumentos ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const CARPETA = arg('carpeta');
const CREDENCIALES = arg('credenciales');
const BASE_LOCAL = arg('base');
const FOLDER_ID = arg('folder') || process.env.GDRIVE_FOLDER_ID || '1OlHcNOnJuPDFIrNj8XCM9O8J7WRAJeN7';
const APLICAR = args.includes('--aplicar');
const TOLERANCIA_DIAS = Number(arg('tolerancia') ?? 3);
const CSV = CARPETA ? path.join(CARPETA, 'asignacion-historias.csv') : '';

if (!CARPETA || (!CREDENCIALES && !BASE_LOCAL)) {
  console.log('Uso: --carpeta <ruta> (--base <excel> | --credenciales <json>) [--aplicar] [--tolerancia 3]');
  process.exit(1);
}
if (APLICAR && !CREDENCIALES) {
  console.log('Para --aplicar se necesita --credenciales (clave JSON de la cuenta de servicio).');
  process.exit(1);
}

// ── Utilidades ─────────────────────────────────────────────────────────
const limpio = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const compacto = (s: unknown) => limpio(s).replace(/ /g, '');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fechaISO(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return iso(new Date(v.getFullYear(), v.getMonth(), v.getDate()));
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? iso(new Date(+m[3], +m[2] - 1, +m[1])) : null;
}

/** Fecha en el nombre del archivo: 16-07-2026, 16-7-26, 5-5-26… */
function fechaDelNombre(nombre: string): string | null {
  const m = nombre.match(/(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2,4})/);
  if (!m) return null;
  const [d, mes, a] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return iso(new Date(a, mes - 1, d));
}

function detectarTipo(b: Buffer): { mime: string; ext: string } | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { mime: 'image/png', ext: 'png' };
  return null;
}

const listar = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? listar(path.join(dir, d.name)) : [path.join(dir, d.name)]));

// ── Base de seguimiento: mismas reglas que la app (excel-source.ts) ────
const HOJA = 'BD seg ambulatorio DNTA';
// [inicio, tamaño] de cada bloque de control (AY..KF), igual que la app
const BLOQUES: [number, number][] = [
  [50, 13], [63, 13], [76, 13], [89, 13], [102, 12], [114, 12], [126, 12], [138, 12], [150, 12],
  [162, 13], [175, 13], [188, 13], [201, 13], [214, 13], [227, 13], [240, 13], [253, 13], [266, 13], [279, 13],
];
const conDatos = (r: unknown[], c: number, t: number) => Array.from({ length: t }, (_, j) => r[c + j]).some(v => v != null && String(v).trim() !== '');

interface Nino { casoId: string; doc: string; nombres: string[]; apellidos: string[]; ips: string; nombre: string; fechasControles: string[] }

function leerBase(contenido: Buffer, app: Record<string, { controles?: { fecha: string | null }[] }>): Nino[] {
  const wb = XLSX.read(contenido, { cellDates: true });
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[HOJA], { header: 1, defval: null, raw: true, range: { s: { r: 0, c: 0 }, e: { r: XLSX.utils.decode_range(wb.Sheets[HOJA]['!ref'] ?? 'A1').e.r, c: 291 } } /* solo A..KF: la hoja trae formato hasta XFD */ }).slice(3).filter(r => r[9] != null);
  const vistos = new Map<string, number>();
  return filas.map(r => {
    const doc = String(r[9]).trim();
    const rep = (vistos.get(doc) ?? 0) + 1;
    vistos.set(doc, rep);
    const casoId = rep > 1 ? `${doc}-${rep}` : doc;
    // Numeración igual a la app: bloques no vacíos del Excel en orden, luego los de la app
    const excel = BLOQUES.filter(([c, t]) => conDatos(r, c, t)).map(([c]) => fechaISO(r[c]) ?? '');
    const enApp = (app[casoId]?.controles ?? []).map(k => k.fecha ?? '');
    return {
      casoId, doc,
      nombres: [r[10], r[11]].map(limpio).filter(Boolean),
      apellidos: [r[12], r[13]].map(limpio).filter(Boolean),
      ips: ipsCanonica(r[23]) || 'SIN IPS ASIGNADA',
      nombre: [r[10], r[11], r[12], r[13]].map(v => String(v ?? '').trim()).filter(Boolean).join(' '),
      fechasControles: [...excel, ...enApp],
    };
  });
}

function emparejarNino(rel: string, ninos: Nino[]): { n: Nino | null; metodo: string } {
  const partes = rel.split(path.sep).slice(1).join(' ');
  for (const d of partes.match(/\d{8,11}/g) ?? []) {
    const n = ninos.find(x => x.doc === d);
    if (n) return { n, metodo: 'documento' };
  }
  const comp = compacto(partes);
  const tiene = (t: string) => comp.includes(t.replace(/ /g, ''));
  const porNombre = ninos.filter(x => x.apellidos.length && x.apellidos.every(tiene) && x.nombres.some(tiene));
  if (porNombre.length === 1) return { n: porNombre[0], metodo: 'nombre' };
  if (porNombre.length > 1) return { n: null, metodo: `ambiguo (${porNombre.map(x => x.doc).join(' / ')})` };
  const porApellido = ninos.filter(x => x.apellidos.length >= 2 && x.apellidos.every(tiene));
  if (porApellido.length === 1) return { n: porApellido[0], metodo: 'apellidos - REVISAR' };
  return { n: null, metodo: 'sin coincidencia' };
}

function emparejarControl(n: Nino, fecha: string | null): { control: number | null; nota: string } {
  if (!fecha) return { control: null, nota: 'el nombre del archivo no tiene fecha' };
  let mejor: { control: number; dif: number } | null = null;
  n.fechasControles.forEach((f, i) => {
    if (!f) return;
    const dif = Math.abs((new Date(f).getTime() - new Date(fecha).getTime()) / 864e5);
    if (dif <= TOLERANCIA_DIAS && (!mejor || dif < mejor.dif)) mejor = { control: i + 1, dif };
  });
  const m = mejor as { control: number; dif: number } | null;
  if (!m) return { control: null, nota: `no hay control registrado cerca del ${fecha}` };
  return { control: m.control, nota: m.dif ? `control a ${m.dif} día(s) de la fecha del archivo` : 'misma fecha' };
}

// ── CSV de asignación (editable por el usuario) ────────────────────────
const COLS = ['ruta', 'ips_carpeta', 'metodo', 'documento', 'nino_en_base', 'fecha_archivo', 'control', 'observacion', 'mb'];
const csvCelda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function leerCsv(): Map<string, { documento: string; control: string }> {
  const r = new Map<string, { documento: string; control: string }>();
  if (!fs.existsSync(CSV)) return r;
  const lineas = fs.readFileSync(CSV, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(1);
  for (const l of lineas) {
    const c = [...l.matchAll(/"((?:[^"]|"")*)"|([^;]+)|(?<=;)(?=;|$)/g)].map(m => (m[1] ?? m[2] ?? '').replace(/""/g, '"'));
    r.set(c[0], { documento: (c[3] ?? '').trim(), control: (c[6] ?? '').trim() });
  }
  return r;
}

// ── Google Drive ───────────────────────────────────────────────────────
async function clienteDrive() {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({ keyFile: CREDENCIALES, scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth });
}
type Drive = Awaited<ReturnType<typeof clienteDrive>>;

async function carpeta(drive: Drive, nombre: string) {
  const r = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  const id = r.data.files?.[0]?.id;
  if (id) return id;
  const c = await drive.files.create({ requestBody: { name: nombre, parents: [FOLDER_ID], mimeType: 'application/vnd.google-apps.folder' }, fields: 'id', supportsAllDrives: true });
  return c.data.id!;
}

async function archivoEn(drive: Drive, carpetaId: string, nombre: string) {
  const r = await drive.files.list({ q: `'${carpetaId}' in parents and name='${nombre}' and trashed=false`, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  return r.data.files?.[0]?.id ?? null;
}

async function leerDrive(drive: Drive, id: string) {
  const r = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return Buffer.from(r.data as ArrayBuffer);
}

async function escribirJsonDrive(drive: Drive, carpetaId: string, nombre: string, datos: unknown) {
  const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(datos, null, 2)]) };
  const id = await archivoEn(drive, carpetaId, nombre);
  if (id) await drive.files.update({ fileId: id, media, supportsAllDrives: true });
  else await drive.files.create({ requestBody: { name: nombre, parents: [carpetaId], mimeType: 'application/json' }, media, supportsAllDrives: true });
}

// ── Principal ──────────────────────────────────────────────────────────
async function main() {
  const drive = CREDENCIALES ? await clienteDrive() : null;

  if (drive) {
    const perms = await drive.permissions.list({ fileId: FOLDER_ID, supportsAllDrives: true, fields: 'permissions(type,role)' });
    if (perms.data.permissions?.some(p => p.type === 'anyone')) {
      console.error('\n⛔ La carpeta de Drive está compartida con "cualquier persona con el enlace".');
      console.error('   Cámbiala a "Restringido" antes de subir historias clínicas. No se subió nada.\n');
      if (APLICAR) process.exit(2);
    }
  }

  // Base y datos actuales de la app
  let base: Buffer;
  let app: Record<string, { controles?: { fecha: string | null }[] }> = {};
  let historias: Record<string, unknown>[] = [];
  let idDatos = '';
  let idHistorias = '';
  if (drive) {
    const [idBase, idD, idH] = await Promise.all([carpeta(drive, '01_BASE_SEGUIMIENTO'), carpeta(drive, '03_DATOS_APP'), carpeta(drive, '02_HISTORIAS_CLINICAS')]);
    idDatos = idD;
    idHistorias = idH;
    const fBase = await archivoEn(drive, idBase, 'base-dnt.xlsx');
    if (!fBase && !BASE_LOCAL) throw new Error('No hay base-dnt.xlsx en 01_BASE_SEGUIMIENTO: cárgala desde Administración o usa --base');
    base = BASE_LOCAL ? fs.readFileSync(BASE_LOCAL) : await leerDrive(drive, fBase!);
    const fApp = await archivoEn(drive, idDatos, 'seguimientos-app.json');
    if (fApp) app = JSON.parse((await leerDrive(drive, fApp)).toString('utf-8'));
    const fHist = await archivoEn(drive, idDatos, 'historias.json');
    if (fHist) historias = JSON.parse((await leerDrive(drive, fHist)).toString('utf-8'));
  } else {
    base = fs.readFileSync(BASE_LOCAL!);
  }

  const ninos = leerBase(base, app);
  const porDoc = new Map(ninos.map(n => [n.doc, n]));
  const correcciones = APLICAR ? leerCsv() : new Map();

  const filas = listar(CARPETA!)
    .filter(f => /\.(pdf|jpe?g|png)$/i.test(f))
    .map(f => {
      const rel = path.relative(CARPETA!, f);
      const fechaArchivo = fechaDelNombre(path.basename(f)) ?? fechaDelNombre(rel);
      const corr = correcciones.get(rel);
      let { n, metodo } = emparejarNino(rel, ninos);
      if (corr?.documento) {
        n = porDoc.get(corr.documento) ?? null;
        metodo = n ? 'corregido en CSV' : `documento ${corr.documento} no existe en la base`;
      }
      let control: number | null = null;
      let observacion = '';
      if (n) ({ control, nota: observacion } = emparejarControl(n, fechaArchivo));
      if (corr?.control !== undefined && corr.control !== '' && n) {
        control = Number(corr.control) || null;
        observacion = 'control asignado en CSV';
      }
      return { f, rel, ips: rel.split(path.sep)[0], metodo, n, fechaArchivo, control, observacion, mb: +(fs.statSync(f).size / 1048576).toFixed(1) };
    });

  // CSV para revisión (en la carpeta local de la IPS; contiene datos personales: no compartir)
  const csv = [COLS.join(';'), ...filas.map(r => [r.rel, r.ips, r.metodo, r.n?.doc ?? '', r.n?.nombre ?? '', r.fechaArchivo ?? '', r.control ?? '', r.observacion, r.mb].map(csvCelda).join(';'))].join('\r\n');
  if (!APLICAR) fs.writeFileSync(CSV, '\uFEFF' + csv, 'utf-8');

  const conNino = filas.filter(r => r.n);
  console.log(`\nArchivos: ${filas.length} · con niño: ${conNino.length} · con control: ${conNino.filter(r => r.control).length} · sin niño: ${filas.length - conNino.length}`);
  console.log(`Niños distintos: ${new Set(conNino.map(r => r.n!.casoId)).size}`);
  const porMetodo: Record<string, number> = {};
  filas.forEach(r => (porMetodo[r.metodo.split(' (')[0]] = (porMetodo[r.metodo.split(' (')[0]] ?? 0) + 1));
  console.log('Por método:', porMetodo);

  if (!APLICAR) {
    console.log(`\nSimulación: no se subió nada. Revisa y corrige (columnas "documento" y "control") en:\n  ${CSV}`);
    console.log('Luego ejecuta con --credenciales <clave.json> --aplicar.\n');
    return;
  }

  // Carga real
  const existentes = new Set(historias.filter(h => !h.anulada).map(h => `${h.casoId}|${h.nombreOriginal}|${h.tamano}`));
  let subidas = 0;
  let omitidas = 0;
  for (const r of conNino) {
    const contenido = fs.readFileSync(r.f);
    const tipo = detectarTipo(contenido);
    const nombreOriginal = path.basename(r.f).replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120);
    if (!tipo) { console.log(`  ✗ no es PDF/JPG/PNG válido: ${r.rel}`); continue; }
    if (existentes.has(`${r.n!.casoId}|${nombreOriginal}|${contenido.length}`)) { omitidas++; continue; }

    const id = crypto.randomUUID();
    const archivo = `${id}.${tipo.ext}`;
    await drive!.files.create({
      requestBody: { name: archivo, parents: [idHistorias], mimeType: tipo.mime },
      media: { mimeType: tipo.mime, body: Readable.from([contenido]) },
      fields: 'id', supportsAllDrives: true,
    });
    historias.push({
      id, casoId: r.n!.casoId, ips: r.n!.ips, control: r.control ?? undefined, nombreOriginal, archivo, mime: tipo.mime,
      tamano: contenido.length, subidoPor: `Carga masiva · ${r.ips}`, fecha: new Date().toISOString(), origen: 'carga-masiva',
    });
    subidas++;
    console.log(`  ✓ ${r.n!.nombre} · control ${r.control ?? '—'} · ${nombreOriginal}`);
  }

  if (subidas) {
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const previo = await archivoEn(drive!, idDatos, 'historias.json');
    if (previo) await drive!.files.copy({ fileId: previo, requestBody: { name: `historias.respaldo-${sello}.json`, parents: [idDatos] }, supportsAllDrives: true });
    await escribirJsonDrive(drive!, idDatos, 'historias.json', historias);
  }
  console.log(`\nSubidas: ${subidas} · ya existían: ${omitidas} · sin niño (no subidas): ${filas.length - conNino.length}\n`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
