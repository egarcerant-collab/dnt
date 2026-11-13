import 'server-only';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { hoyColombia } from '../fecha';
import { NOMBRE_PRESTADOR, type PrestadorRed } from './asignacion';
import { ipsCanonica } from './catalogo';
import { obtenerBase } from './repositorio';
import { ALERTAS, type Caso } from './types';

/**
 * Formato de reporte nominal de menores de cinco años con alteraciones nutricionales (Word).
 * Cada prestador de seguimiento (las 5 IPSI de la red) lo genera para cada IPS de primer nivel
 * dueña de sus niños: secciones 1 y 2 diligenciadas automáticamente; 3 a 7 las diligencia la IPS receptora.
 */
const PLANTILLA = path.join(process.cwd(), 'plantillas', 'reporte-nominal.docx');
const CERRADOS = ['FALLECIDO', 'DESCARTADO'];
const DIAS_RESPUESTA = 8;

/** IPS de primer nivel del niño: la IPSI original de la base (columna X); si no hay, la de atención primaria (AX). */
export function primerNivelDe(c: Caso): string {
  return ipsCanonica(c.ipsPrimerNivel) || ipsCanonica(c.ipsAtencionPrimaria) || 'SIN IPS DE PRIMER NIVEL';
}

export interface GrupoPrimerNivel { primaria: string; ruta: string; ninos: number; severos: number }

/** Grupos IPS de primer nivel × prestador de seguimiento (opcionalmente de un solo prestador). */
export async function gruposPrimerNivel(ruta?: string): Promise<GrupoPrimerNivel[]> {
  const base = await obtenerBase();
  const m = new Map<string, GrupoPrimerNivel>();
  for (const c of base.casos) {
    if (CERRADOS.includes(c.estado) || (ruta && c.ipsSeguimiento !== ruta)) continue;
    const primaria = primerNivelDe(c);
    const k = `${c.ipsSeguimiento}|${primaria}`;
    const g = m.get(k) ?? { primaria, ruta: c.ipsSeguimiento, ninos: 0, severos: 0 };
    g.ninos++;
    if (c.severidad === 'SEVERA') g.severos++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => a.ruta.localeCompare(b.ruta) || b.ninos - a.ninos);
}

// ── Utilidades XML de Word ──────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);
const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const celdas = (fila: string) => [...fila.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(m => m[0]);
const filas = (tabla: string) => [...tabla.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(m => m[0]);
const textoDe = (xml: string) => (xml.match(/<w:t[^>]*>[^<]*/g) ?? []).map(t => t.replace(/<w:t[^>]*>/, '')).join('');

/** Reemplaza el texto de una celda conservando el formato del primer párrafo y de su primer run. */
function ponerTexto(tc: string, texto: string): string {
  const p = tc.match(/<w:p[ >][\s\S]*?<\/w:p>/)?.[0];
  if (!p) return tc;
  const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const rPr = p.match(/<w:r[ >][\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? '';
  const runs = texto.split('\n').map((l, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(l)}</w:t>`).join('');
  const nuevoP = `<w:p>${pPr}<w:r>${rPr}${runs}</w:r></w:p>`;
  // Solo queda el primer párrafo de la celda (los demás se eliminan)
  const inicio = tc.indexOf(p);
  const resto = tc.slice(inicio + p.length).replace(/<w:p[ >][\s\S]*?<\/w:p>/g, '');
  return tc.slice(0, inicio) + nuevoP + resto;
}

function llenarFila(fila: string, valores: (string | number | null | undefined)[]): string {
  let i = 0;
  return fila.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, tc => {
    const v = valores[i++];
    return v === undefined ? tc : ponerTexto(tc, v == null ? '' : String(v));
  });
}

/** Reemplaza las filas numeradas de la plantilla por una fila por niño (clonando la fila "1"). */
function filasPorNino(tabla: string, n: number, valores: (i: number) => (string | number | null | undefined)[]): string {
  const fs_ = filas(tabla);
  const modelo = fs_[1];
  const numeradas = fs_.slice(1).filter(f => /^\d+$/.test(textoDe(f).trim()));
  const nuevas = Array.from({ length: Math.max(n, 1) }, (_, i) => llenarFila(modelo, n ? valores(i) : [''])).join('');
  let t = tabla;
  numeradas.forEach((f, i) => (t = t.replace(f, i === 0 ? nuevas : '')));
  return t;
}

/** Corrige los "\n" escritos como texto en la plantilla (saltos de línea reales). */
function arreglarSaltos(xml: string): string {
  return xml
    .replace(/\\n/g, '</w:t><w:br/><w:t xml:space="preserve">')
    .replace(/\\(<\/w:t><\/w:r>(?:(?!<w:t[ >]).)*?<w:t[^>]*>)n/gs, ' $1');
}

const prioridad = (c: Caso) =>
  c.severidad === 'SEVERA' || c.alertas.some(a => ALERTAS[a].nivel === 'alta') ? 'ALTA' : c.severidad === 'MODERADA' ? 'MEDIA' : 'BAJA';

function alteracion(c: Caso): string {
  const z = c.zIngreso != null ? ` · Z P/T ${c.zIngreso.toFixed(2)}` : '';
  return `${c.clasificacionNutricional.replace('DESNUTRICION AGUDA', 'DNT')}${z}${c.enSivigila ? ' · SIVIGILA' : ''}`;
}

export interface ReporteNominal { docx: Buffer; nombre: string; ninos: number }

export async function generarReporteNominal(opciones: { primaria: string; ruta: string }): Promise<ReporteNominal> {
  const base = await obtenerBase();
  const casos = base.casos
    .filter(c => !CERRADOS.includes(c.estado) && c.ipsSeguimiento === opciones.ruta && primerNivelDe(c) === opciones.primaria)
    .sort((a, b) => Number(b.severidad === 'SEVERA') - Number(a.severidad === 'SEVERA') || a.municipio.localeCompare(b.municipio) || a.nombre.localeCompare(b.nombre));

  const docx = await armarDocx(fs.readFileSync(PLANTILLA), casos, { primaria: opciones.primaria, ruta: opciones.ruta, fechaCorte: base.fechaCorte });
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { docx, nombre: `Reporte-nominal-${limpio(opciones.primaria)}-${hoyColombia()}.docx`, ninos: casos.length };
}

/** Diligencia la plantilla Word con los niños (función pura, sin acceso a datos). */
export async function armarDocx(plantilla: Buffer, casos: Caso[], meta: { primaria: string; ruta: string; fechaCorte: string }): Promise<Buffer> {
  const opciones = meta;
  const zip = await JSZip.loadAsync(plantilla);
  let doc = arreglarSaltos(await zip.file('word/document.xml')!.async('string'));
  const tablas = [...doc.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(m => m[0]);
  const [t1, t2, t3, t4, t5] = tablas;

  // 1. Identificación del reporte
  const hoy = hoyColombia();
  const limite = new Date(Date.now() + DIAS_RESPUESTA * 864e5).toISOString().slice(0, 10);
  const territorios = [...new Set(casos.map(c => `${c.departamento} / ${c.municipio}`))];
  const ruta = NOMBRE_PRESTADOR[opciones.ruta as PrestadorRed] ?? opciones.ruta;
  const valores1 = ['DNT-RN-01', '1', dmy(hoy), `Corte ${dmy(meta.fechaCorte)}`, `${opciones.primaria}\n(seguimiento: ${ruta})`, null, territorios.slice(0, 4).join('; ') + (territorios.length > 4 ? '…' : ''), dmy(limite)];
  let k = 0;
  const n1 = t1.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, tc => {
    if (!/_{3,}/.test(textoDe(tc))) return tc;
    const v = valores1[k++];
    return v == null ? tc : ponerTexto(tc, v);
  });

  // 2. Base nominal
  const n2 = filasPorNino(t2, casos.length, i => {
    const c = casos[i];
    return [i + 1, `${c.tipoDocumento} ${c.documento}`, c.nombre, dmy(c.fechaNacimiento), c.edadMeses ?? '', [c.departamento, c.municipio, c.asentamiento].filter(Boolean).join(' / '), alteracion(c), dmy(c.fechaNotificacion), prioridad(c)];
  });
  // 3 y 4: una fila por niño con su número (las diligencia la IPS)
  const n3 = filasPorNino(t3, casos.length, i => [i + 1, '', '', '', '', '', '']);
  const n4 = filasPorNino(t4, casos.length, i => [i + 1, '', '', '', '', '', '']);
  // 5. Consolidado: menores recibidos
  const f5 = filas(t5).find(f => textoDe(f).includes('recibidos'));
  const n5 = f5 ? t5.replace(f5, llenarFila(f5, [undefined, casos.length, `${casos.filter(c => c.severidad === 'SEVERA').length} con DNT severa`])) : t5;

  doc = doc.replace(t1, n1).replace(t2, n2).replace(t3, n3).replace(t4, n4).replace(t5, n5);
  zip.file('word/document.xml', doc);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
