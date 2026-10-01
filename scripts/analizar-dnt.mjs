/**
 * analizar-dnt.mjs
 * Calcula indicadores agregados de seguimiento a DNT aguda (evento 113 SIVIGILA)
 * a partir de la matriz "BD seg ambulatorio DNTA" y la hoja SIVIGILA "SEM NN".
 *
 * Uso: node scripts/analizar-dnt.mjs [ruta.xlsx]
 * Salida: solo agregados (sin nombres, documentos ni teléfonos).
 */
import XLSX from 'xlsx';

const FILE = process.argv[2] || 'data/raw/BASE_DNT_SEM36_2026.xlsx';
const HOJA_SEG = 'BD seg ambulatorio DNTA';

// Índices de columna (0-based) de la matriz de seguimiento
const COL = {
  semana: 2, fechaNotif: 3, depto: 5, municipio: 6, id: 9, sexo: 14, fechaNac: 15,
  etnia: 18, fechaAtencion: 22, ipsSeg: 23, etiologia: 24, vacunacion: 27, rpms: 28,
  estado: 29, fechaRecup: 30, f75: 31, zIngreso: 37, clasifIngreso: 38, edema: 39,
  perimetroBraquial: 41, fechaFtlc: 45, mipres: 46,
};
// Columna "Fecha de consulta" de cada control (1..10)
const CONTROLES = [50, 63, 76, 89, 102, 114, 126, 138, 150, 162];

const norm = v => (v == null ? '' : String(v).trim().toUpperCase().replace(/\s+/g, ' '));
const lleno = v => norm(v) !== '';

function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/aaaa
  return m ? new Date(+m[3], m[2] - 1, +m[1]) : null;
}
const dias = (a, b) => (a && b ? Math.round((b - a) / 864e5) : null);

function estadoNormalizado(v) {
  const s = norm(v);
  if (!s) return 'SIN DILIGENCIAR';
  if (/PROCESO|RPOCESO/.test(s)) return 'EN PROCESO DE RECUPERACION';
  return s;
}
function severidad(v) {
  const s = norm(v);
  if (/SEVERA|KWASH|KWAH|MARASMO/.test(s)) return 'SEVERA';
  if (/MOD|MDOER/.test(s)) return 'MODERADA';
  return 'SIN CLASIFICAR';
}

const contar = (rows, fn) =>
  Object.entries(rows.reduce((m, r) => ((m[fn(r)] = (m[fn(r)] || 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1]);

function resumen(valores) {
  const v = valores.filter(x => x != null && x >= 0).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  return { n: v.length, mediana: v[Math.floor(v.length / 2)], p90: v[Math.floor(v.length * 0.9)] };
}
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');

// ── Carga ────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(FILE, { cellDates: true });
const seg = XLSX.utils
  .sheet_to_json(wb.Sheets[HOJA_SEG], { header: 1, defval: null, raw: true })
  .slice(3)
  .filter(r => r[COL.id] != null);
const hojaSiv = wb.SheetNames.find(n => /^SEM \d+$/.test(n));
const siv = hojaSiv ? XLSX.utils.sheet_to_json(wb.Sheets[hojaSiv], { defval: null, raw: false }) : [];

const N = seg.length;
const out = {};

// ── 1. Magnitud ─────────────────────────────────────────────────────────
out.magnitud = {
  casosSeguimiento: N,
  casosSivigila: siv.length,
  hojaSivigila: hojaSiv,
  porDepartamento: contar(seg, r => norm(r[COL.depto]) || 'SIN DATO'),
  porMunicipioTop10: contar(seg, r => norm(r[COL.municipio]) || 'SIN DATO').slice(0, 10),
  porEtnia: contar(seg, r => norm(r[COL.etnia]).replace('ARHUACO', 'ARHUACA') || 'SIN DATO'),
  porSexo: contar(seg, r => norm(r[COL.sexo]) || 'SIN DATO'),
  porSeveridadIngreso: contar(seg, r => severidad(r[COL.clasifIngreso])),
};

// Edad en meses calculada (la columna "Edad en Meses" viene casi vacía)
const edades = seg
  .map(r => { const n = toDate(r[COL.fechaNac]), f = toDate(r[COL.fechaNotif]); return n && f ? (f - n) / (864e5 * 30.44) : null; })
  .filter(x => x != null);
out.magnitud.gruposEdad = {
  '<6m': edades.filter(x => x < 6).length,
  '6-11m': edades.filter(x => x >= 6 && x < 12).length,
  '12-23m': edades.filter(x => x >= 12 && x < 24).length,
  '24-59m': edades.filter(x => x >= 24 && x < 60).length,
};

// ── 2. Desenlaces ───────────────────────────────────────────────────────
const est = contar(seg, r => estadoNormalizado(r[COL.estado]));
const n = k => (est.find(([e]) => e === k) || [0, 0])[1];
const conEstado = N - n('SIN DILIGENCIAR');
out.desenlaces = {
  distribucion: est,
  recuperacionSobreTotal: pct(n('RECUPERADO'), N),
  recuperacionSobreConEstado: pct(n('RECUPERADO'), conEstado),
  letalidad: pct(n('FALLECIDO'), N),
  estadoPorSeveridad: contar(seg, r => `${severidad(r[COL.clasifIngreso])} | ${estadoNormalizado(r[COL.estado])}`),
  recuperadosPorDepto: contar(seg, r => `${norm(r[COL.depto])} | ${estadoNormalizado(r[COL.estado]) === 'RECUPERADO' ? 'RECUPERADO' : 'NO/SIN DATO'}`),
};

// ── 3. Oportunidad ──────────────────────────────────────────────────────
out.oportunidad = {
  notifAPrimerControl: resumen(seg.map(r => dias(toDate(r[COL.fechaNotif]), toDate(r[CONTROLES[0]])))),
  primerControlDentroDe7d: pct(
    seg.filter(r => { const d = dias(toDate(r[COL.fechaNotif]), toDate(r[CONTROLES[0]])); return d != null && d >= 0 && d <= 7; }).length, N),
  primerASegundoControl: resumen(seg.map(r => dias(toDate(r[CONTROLES[0]]), toDate(r[CONTROLES[1]])))),
  notifAEntregaFtlc: resumen(seg.map(r => dias(toDate(r[COL.fechaNotif]), toDate(r[COL.fechaFtlc])))),
  notifARecuperacion: resumen(seg.map(r => dias(toDate(r[COL.fechaNotif]), toDate(r[COL.fechaRecup])))),
};

// ── 4. Adherencia al seguimiento ────────────────────────────────────────
const nControles = seg.map(r => CONTROLES.filter(c => r[c] != null).length);
const semanaActual = Math.max(...seg.map(r => +r[COL.semana] || 0).filter(s => s < 53));
out.seguimiento = {
  distribucionControles: contar(nControles.map(x => [x]), r => String(r[0])),
  promedioControles: (nControles.reduce((a, x) => a + x, 0) / N).toFixed(2),
  sinNingunControl: nControles.filter(x => x === 0).length,
  sinControlConMasDe4Semanas: seg.filter((r, i) => nControles[i] === 0 && +r[COL.semana] <= semanaActual - 4).length,
};

// ── 5. Calidad del dato ─────────────────────────────────────────────────
const campos = ['etiologia', 'estado', 'fechaRecup', 'zIngreso', 'clasifIngreso', 'perimetroBraquial', 'fechaFtlc', 'mipres', 'vacunacion', 'rpms', 'f75'];
out.calidad = {
  completitud: Object.fromEntries(campos.map(c => [c, pct(seg.filter(r => lleno(r[COL[c]])).length, N)])),
  variantesClasificacionIngreso: new Set(seg.map(r => norm(r[COL.clasifIngreso])).filter(Boolean)).size,
  variantesEdema: new Set(seg.map(r => norm(r[COL.edema])).filter(Boolean)).size,
  variantesIpsSeguimiento: new Set(seg.map(r => norm(r[COL.ipsSeg])).filter(Boolean)).size,
  idsDuplicados: Object.values(seg.reduce((m, r) => ((m[r[COL.id]] = (m[r[COL.id]] || 0) + 1), m), {})).filter(x => x > 1).length,
  fechasIncoherentes: seg.filter(r => { const d = dias(toDate(r[COL.fechaNotif]), toDate(r[CONTROLES[0]])); return d != null && d < 0; }).length,
};

// ── 6. Cruce SIVIGILA vs seguimiento ────────────────────────────────────
if (siv.length) {
  const idsSeg = new Set(seg.map(r => String(r[COL.id]).trim()));
  const idsSiv = new Set(siv.map(r => String(r.num_ide_).trim()));
  out.cruceSivigila = {
    sivigilaSinSeguimiento: [...idsSiv].filter(i => !idsSeg.has(i)).length,
    seguimientoSinSivigila: [...idsSeg].filter(i => !idsSiv.has(i)).length,
    fallecidosEnSivigila: siv.filter(r => norm(r.con_fin_) === '2').length,
    fallecidosEnSeguimiento: n('FALLECIDO'),
    hospitalizadosSivigila: siv.filter(r => norm(r.pac_hos_) === '1').length,
  };
}

console.log(JSON.stringify(out, null, 2));
