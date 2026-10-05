/**
 * Reporte: cuáles niños de la base ya tienen historia clínica cargada.
 *
 * Uso:
 *   npx tsx scripts/reporte-historias.ts --credenciales "C:/.../clave.json"
 *   npx tsx scripts/reporte-historias.ts --credenciales "..." --base "C:/.../base.xlsx"
 *   npx tsx scripts/reporte-historias.ts --credenciales "..." --salida reporte.csv
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const args = process.argv.slice(2);
const arg  = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const CREDENCIALES = arg('credenciales');
const BASE_LOCAL   = arg('base');
const SALIDA       = arg('salida') || path.join(process.cwd(), 'reporte-historias.csv');
const FOLDER_ID    = arg('folder') || process.env.GDRIVE_FOLDER_ID || '1OlHcNOnJuPDFIrNj8XCM9O8J7WRAJeN7';

if (!CREDENCIALES) {
  console.log('Uso: npx tsx scripts/reporte-historias.ts --credenciales <clave.json> [--base <excel>] [--salida <archivo.csv>]');
  process.exit(1);
}

// ── Normalización (igual que la app) ───────────────────────────
const limpio = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fechaISO(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return iso(new Date(v.getFullYear(), v.getMonth(), v.getDate()));
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? iso(new Date(+m[3], +m[2] - 1, +m[1])) : null;
}

const HOJA = 'BD seg ambulatorio DNTA';
const BLOQUES: [number, number][] = [
  [50,13],[63,13],[76,13],[89,13],[102,12],[114,12],[126,12],[138,12],[150,12],
  [162,13],[175,13],[188,13],[201,13],[214,13],[227,13],[240,13],[253,13],[266,13],[279,13],
];
const conDatos = (r: unknown[], c: number, t: number) =>
  Array.from({ length: t }, (_, j) => r[c + j]).some(v => v != null && String(v).trim() !== '');

interface Nino {
  casoId: string; doc: string; nombre: string; ips: string;
  controles: number; fechasControles: string[];
}

function leerBase(buf: Buffer): Nino[] {
  const wb    = XLSX.read(buf, { cellDates: true });
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[HOJA], { header: 1, defval: null, raw: true })
    .slice(3).filter(r => r[9] != null);
  const vistos = new Map<string, number>();
  return filas.map(r => {
    const doc = String(r[9]).trim();
    const rep = (vistos.get(doc) ?? 0) + 1;
    vistos.set(doc, rep);
    const casoId = rep > 1 ? `${doc}-${rep}` : doc;
    const fechasControles = BLOQUES.filter(([c, t]) => conDatos(r, c, t)).map(([c]) => fechaISO(r[c]) ?? '');
    return {
      casoId, doc,
      nombre: [r[10], r[11], r[12], r[13]].map(v => String(v ?? '').trim()).filter(Boolean).join(' '),
      ips: String(r[23] ?? '').trim() || 'SIN IPS',
      controles: fechasControles.length,
      fechasControles,
    };
  });
}

// ── Google Drive ───────────────────────────────────────────────
async function clienteDrive() {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({ keyFile: CREDENCIALES, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth });
}
type Drive = Awaited<ReturnType<typeof clienteDrive>>;

async function encontrarArchivo(drive: Drive, parentId: string, nombre: string): Promise<string | null> {
  const r = await drive.files.list({
    q: `'${parentId}' in parents and name='${nombre}' and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return r.data.files?.[0]?.id ?? null;
}

async function encontrarCarpeta(drive: Drive, nombre: string): Promise<string | null> {
  const r = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return r.data.files?.[0]?.id ?? null;
}

async function leerArchivoDrive(drive: Drive, id: string): Promise<Buffer> {
  const r = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return Buffer.from(r.data as ArrayBuffer);
}

// ── Principal ──────────────────────────────────────────────────
async function main() {
  const drive = await clienteDrive();
  console.log('\n🔍 Conectando con Google Drive...');

  // Leer base de datos de niños
  let baseBuf: Buffer;
  if (BASE_LOCAL) {
    baseBuf = fs.readFileSync(BASE_LOCAL);
    console.log(`📋 Base: ${BASE_LOCAL} (local)`);
  } else {
    const idCarpetaBase = await encontrarCarpeta(drive, '01_BASE_SEGUIMIENTO');
    if (!idCarpetaBase) throw new Error('No se encontró la carpeta 01_BASE_SEGUIMIENTO en Drive');
    const idBase = await encontrarArchivo(drive, idCarpetaBase, 'base-dnt.xlsx');
    if (!idBase) throw new Error('No se encontró base-dnt.xlsx en 01_BASE_SEGUIMIENTO. Cárgala primero desde Administración o usa --base <archivo.xlsx>');
    console.log('📋 Leyendo base desde Drive...');
    baseBuf = await leerArchivoDrive(drive, idBase);
  }

  const ninos = leerBase(baseBuf);
  console.log(`👶 Total niños en base: ${ninos.length}`);

  // Leer historias clínicas cargadas
  const idCarpetaDatos = await encontrarCarpeta(drive, '03_DATOS_APP');
  let historias: Array<{ casoId: string; control?: number; nombreOriginal: string; fecha: string; ips: string; anulada?: unknown }> = [];
  if (idCarpetaDatos) {
    const idHist = await encontrarArchivo(drive, idCarpetaDatos, 'historias.json');
    if (idHist) {
      console.log('📁 Leyendo historias desde Drive...');
      historias = JSON.parse((await leerArchivoDrive(drive, idHist)).toString('utf-8'));
    }
  }
  const historiasActivas = historias.filter(h => !h.anulada);
  console.log(`📄 Total historias cargadas (activas): ${historiasActivas.length}`);

  // Cruzar
  const histPorCaso = new Map<string, typeof historiasActivas>();
  for (const h of historiasActivas) {
    if (!histPorCaso.has(h.casoId)) histPorCaso.set(h.casoId, []);
    histPorCaso.get(h.casoId)!.push(h);
  }

  const conHistoria   = ninos.filter(n => histPorCaso.has(n.casoId));
  const sinHistoria   = ninos.filter(n => !histPorCaso.has(n.casoId));

  console.log(`\n✅ Con historia clínica: ${conHistoria.length}`);
  console.log(`❌ Sin historia clínica: ${sinHistoria.length}`);

  // Resumen en consola
  console.log('\n═══ NIÑOS CON HISTORIA CLÍNICA ═══');
  for (const n of conHistoria) {
    const hs = histPorCaso.get(n.casoId)!;
    const controles = hs.map(h => h.control ?? '?').join(', ');
    console.log(`  ✓ [${n.doc}] ${n.nombre.padEnd(40)} | IPS: ${n.ips.slice(0,30).padEnd(30)} | Historias: ${hs.length} (controles: ${controles})`);
  }

  console.log('\n═══ NIÑOS SIN HISTORIA CLÍNICA ═══');
  for (const n of sinHistoria) {
    console.log(`  ✗ [${n.doc}] ${n.nombre.padEnd(40)} | IPS: ${n.ips.slice(0,30)} | Controles registrados: ${n.controles}`);
  }

  // Exportar CSV
  const csvLineas = [
    'Documento;Nombre;IPS;Historias_cargadas;Controles_con_historia;Controles_registrados_base;Estado',
    ...ninos.map(n => {
      const hs = histPorCaso.get(n.casoId) ?? [];
      const controlesConHist = hs.map(h => h.control ?? '?').join(' | ');
      const estado = hs.length > 0 ? 'CON HISTORIA' : 'SIN HISTORIA';
      return [n.doc, n.nombre, n.ips, hs.length, controlesConHist, n.controles, estado]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(';');
    }),
  ].join('\r\n');

  fs.writeFileSync(SALIDA, '\uFEFF' + csvLineas, 'utf-8');
  console.log(`\n📊 Reporte guardado en: ${SALIDA}`);
  console.log(`   Ábrelo en Excel para filtrar por "CON HISTORIA" / "SIN HISTORIA"\n`);
}

main().catch(e => { console.error('\nError:', e.message); process.exit(1); });
