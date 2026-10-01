import 'server-only';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { departamentoCanonico, ipsCanonica, municipioCanonico } from './catalogo';
import type { Caso, ClasificacionNutricional, Control, Estado, Severidad } from './types';

const HOJA_SEGUIMIENTO = 'BD seg ambulatorio DNTA';
const FILA_INICIO_DATOS = 3;

// Columnas (0-based) de la matriz "BD seg ambulatorio DNTA"
const COL = {
  consecutivo: 0, semana: 2, fechaNotif: 3, depto: 5, municipio: 6, asentamiento: 7, tipoId: 8, id: 9,
  nombre1: 10, nombre2: 11, apellido1: 12, apellido2: 13, sexo: 14, fechaNac: 15, telefono: 17,
  etnia: 18, ipsInicial: 21, ipsSeg: 23, estado: 29, fechaRecup: 30, peso: 35, talla: 36,
  zIngreso: 37, clasifIngreso: 38, edema: 39, perimetroBraquial: 41, fechaFtlc: 45, mipres: 46,
  ipsAtencionPrimaria: 49, // AX: primera columna que diligencia el prestador
} as const;
export const COL_AX = COL.ipsAtencionPrimaria;
export const TOTAL_COLUMNAS = 292; // A..KF

// Bloques de control: [columna "Fecha de consulta", tamaño del bloque].
// Los bloques de 12 columnas no traen "Fecha de entrega FTLC".
export const BLOQUES_CONTROL: Array<[number, 12 | 13]> = [
  [50, 13], [63, 13], [76, 13], [89, 13], [102, 12], [114, 12], [126, 12], [138, 12], [150, 12],
  [162, 13], [175, 13], [188, 13], [201, 13], [214, 13], [227, 13], [240, 13], [253, 13], [266, 13], [279, 13],
];

export const norm = (v: unknown) => (v == null ? '' : String(v).trim().toUpperCase().replace(/\s+/g, ' '));

function texto(v: unknown): string {
  return v == null ? '' : String(v).trim().replace(/\s+/g, ' ');
}

function numero(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Acepta Date de Excel o texto dd/mm/aaaa. Devuelve yyyy-mm-dd. */
export function fechaISO(v: unknown): string | null {
  if (v == null || v === '') return null;
  let d: Date | null = null;
  if (v instanceof Date) d = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  else {
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) d = new Date(+m[3], +m[2] - 1, +m[1]);
  }
  if (!d || isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function normalizarEstado(v: unknown): Estado {
  const s = norm(v);
  if (!s) return 'SIN DILIGENCIAR';
  if (/PROCESO|RPOCESO/.test(s)) return 'EN PROCESO DE RECUPERACION';
  if (/RECUPERADO/.test(s)) return 'RECUPERADO';
  if (/FALLEC/.test(s)) return 'FALLECIDO';
  if (/DESCART/.test(s)) return 'DESCARTADO';
  if (/DESERT/.test(s)) return 'DESERTADO';
  if (/BUSQUEDA/.test(s)) return 'BUSQUEDA FALLIDA';
  if (/RECAIDA|RECAÍDA/.test(s)) return 'RECAIDA';
  return 'SIN DILIGENCIAR';
}

/**
 * Clasificación nutricional detallada (Res. 2350/2020). Si el texto está vacío o no es
 * reconocible, se deriva del puntaje Z peso/talla de ingreso.
 */
export function clasificacionNutricional(texto: string, z: number | null): { clasificacion: ClasificacionNutricional; porZ: boolean } {
  const s = norm(texto);
  const kwash = /KWASH|KWAH/.test(s);
  const marasmo = /MARASMO|MERASMO|MASRASMO/.test(s);
  if (kwash && marasmo) return { clasificacion: 'DNT AGUDA SEVERA MIXTA', porZ: false };
  if (kwash) return { clasificacion: 'DNT AGUDA SEVERA KWASHIORKOR', porZ: false };
  if (marasmo) return { clasificacion: 'DNT AGUDA SEVERA MARASMO', porZ: false };
  if (/SEVERA/.test(s)) return { clasificacion: 'DNT AGUDA SEVERA', porZ: false };
  if (/MOD|MDOER/.test(s)) return { clasificacion: 'DNT AGUDA MODERADA', porZ: false };
  if (/RIESGO/.test(s)) return { clasificacion: 'RIESGO DE DNT AGUDA', porZ: false };
  if (/PESO ADECUADO/.test(s)) return { clasificacion: 'PESO ADECUADO PARA LA TALLA', porZ: false };
  if (z == null || Math.abs(z) > 8) return { clasificacion: 'SIN DATO', porZ: false };
  if (z < -3) return { clasificacion: 'DNT AGUDA SEVERA', porZ: true };
  if (z < -2) return { clasificacion: 'DNT AGUDA MODERADA', porZ: true };
  if (z < -1) return { clasificacion: 'RIESGO DE DNT AGUDA', porZ: true };
  return { clasificacion: 'PESO ADECUADO PARA LA TALLA', porZ: true };
}

export function severidadDe(c: ClasificacionNutricional): Severidad {
  if (c.startsWith('DNT AGUDA SEVERA')) return 'SEVERA';
  if (c === 'DNT AGUDA MODERADA') return 'MODERADA';
  return 'SIN CLASIFICAR';
}

/** Posición de cada campo dentro de un bloque de control (los bloques de 12 no traen fecha FTLC). */
export function camposBloque(tam: 12 | 13) {
  const off = tam === 13 ? 1 : 0;
  return {
    fecha: 0, peso: 1, talla: 2, z: 3, clasificacion: 4, energia: 5,
    fechaFtlc: tam === 13 ? 6 : null,
    medicamento: 6 + off, recomendaciones: 7 + off, resultado: 8 + off, ips: 9 + off, observaciones: 10 + off, profesional: 11 + off,
  };
}

function leerControles(r: unknown[]): Control[] {
  const controles: Control[] = [];
  BLOQUES_CONTROL.forEach(([c, tam], i) => {
    const fecha = fechaISO(r[c]);
    if (!fecha && r[c + 1] == null) return;
    const k = camposBloque(tam);
    controles.push({
      numero: i + 1,
      fecha,
      peso: numero(r[c + k.peso]),
      talla: numero(r[c + k.talla]),
      zPesoTalla: numero(r[c + k.z]),
      clasificacion: texto(r[c + k.clasificacion]),
      energia: texto(r[c + k.energia]),
      fechaEntregaFtlc: k.fechaFtlc == null ? null : fechaISO(r[c + k.fechaFtlc]),
      medicamento: texto(r[c + k.medicamento]),
      recomendaciones: texto(r[c + k.recomendaciones]),
      resultado: texto(r[c + k.resultado]),
      ips: ipsCanonica(r[c + k.ips]),
      observaciones: texto(r[c + k.observaciones]),
      profesional: texto(r[c + k.profesional]),
      origen: 'excel',
    });
  });
  return controles;
}

function edadMeses(nac: string | null, ref: string | null): number | null {
  if (!nac || !ref) return null;
  const m = (new Date(ref).getTime() - new Date(nac).getTime()) / (864e5 * 30.44);
  return m >= 0 ? Math.floor(m) : null;
}

type CasoBase = Omit<Caso, 'alertas' | 'enSivigila' | 'condicionFinalSivigila'>;

export interface UpgdSivigila { nombre: string; nit: string }

export interface DatosExcel {
  casos: CasoBase[];
  sivigila: Map<string, { condicionFinal: string }>;
  hojaSivigila: string | null;
  /** Fila original A..KF de cada caso, para reconstruir la matriz al exportar. */
  filas: Map<string, unknown[]>;
  /** Instituciones notificadoras (nombre y NIT) reportadas en SIVIGILA. */
  upgd: UpgdSivigila[];
}

let cache: { mtime: number; datos: DatosExcel } | null = null;

export function rutaExcel(): string {
  return process.env.DNT_EXCEL_PATH || path.join(process.cwd(), 'data', 'raw', 'BASE_DNT_SEM36_2026.xlsx');
}

export function leerExcel(): DatosExcel {
  const ruta = rutaExcel();
  const mtime = fs.statSync(ruta).mtimeMs;
  if (cache && cache.mtime === mtime) return cache.datos;

  const wb = XLSX.read(fs.readFileSync(ruta), { cellDates: true });
  const filas = XLSX.utils
    .sheet_to_json<unknown[]>(wb.Sheets[HOJA_SEGUIMIENTO], { header: 1, defval: null, raw: true })
    .slice(FILA_INICIO_DATOS)
    .filter(r => r[COL.id] != null);

  const vistos = new Map<string, number>();
  const filasPorId = new Map<string, unknown[]>();
  const casos: CasoBase[] = filas.map(r => {
    const documento = texto(r[COL.id]);
    const rep = (vistos.get(documento) ?? 0) + 1;
    vistos.set(documento, rep);
    const clasif = texto(r[COL.clasifIngreso]);
    const zIngreso = numero(r[COL.zIngreso]);
    const cn = clasificacionNutricional(clasif, zIngreso);
    const fechaNacimiento = fechaISO(r[COL.fechaNac]);
    const fechaNotificacion = fechaISO(r[COL.fechaNotif]);
    const id = rep > 1 ? `${documento}-${rep}` : documento;
    filasPorId.set(id, r);
    return {
      id,
      consecutivo: numero(r[COL.consecutivo]),
      tipoDocumento: norm(r[COL.tipoId]),
      documento,
      nombre: [r[COL.nombre1], r[COL.nombre2], r[COL.apellido1], r[COL.apellido2]].map(texto).filter(Boolean).join(' '),
      sexo: norm(r[COL.sexo]),
      fechaNacimiento,
      edadMeses: edadMeses(fechaNacimiento, fechaNotificacion),
      departamento: departamentoCanonico(r[COL.depto]),
      municipio: municipioCanonico(r[COL.municipio]),
      asentamiento: texto(r[COL.asentamiento]),
      etnia: norm(r[COL.etnia]).replace('ARHUACO', 'ARHUACA'),
      telefono: texto(r[COL.telefono]),
      semanaEpi: numero(r[COL.semana]),
      fechaNotificacion,
      ipsInicial: ipsCanonica(r[COL.ipsInicial]),
      ipsSeguimiento: ipsCanonica(r[COL.ipsSeg]) || 'SIN IPS ASIGNADA',
      severidad: severidadDe(cn.clasificacion),
      clasificacionNutricional: cn.clasificacion,
      clasificacionPorZ: cn.porZ,
      clasificacionIngreso: clasif,
      zIngreso,
      pesoIngreso: numero(r[COL.peso]),
      tallaIngreso: numero(r[COL.talla]),
      edema: texto(r[COL.edema]),
      perimetroBraquial: numero(r[COL.perimetroBraquial]),
      fechaEntregaFtlc: fechaISO(r[COL.fechaFtlc]),
      mipresFtlc: norm(r[COL.mipres]),
      estado: normalizarEstado(r[COL.estado]),
      fechaRecuperacion: fechaISO(r[COL.fechaRecup]),
      ipsAtencionPrimaria: texto(r[COL.ipsAtencionPrimaria]),
      controles: leerControles(r),
    };
  });

  const hojaSivigila = wb.SheetNames.find(n => /^SEM \d+$/.test(n)) ?? null;
  const sivigila = new Map<string, { condicionFinal: string }>();
  const upgd: UpgdSivigila[] = [];
  if (hojaSivigila) {
    XLSX.utils
      .sheet_to_json<Record<string, unknown>>(wb.Sheets[hojaSivigila], { defval: null, raw: false })
      .forEach(r => {
        sivigila.set(texto(r.num_ide_), { condicionFinal: texto(r.con_fin_) });
        if (r.nom_upgd && r.nit_upgd) upgd.push({ nombre: texto(r.nom_upgd), nit: texto(r.nit_upgd).replace(/\D/g, '') });
      });
  }

  const datos = { casos, sivigila, hojaSivigila, filas: filasPorId, upgd };
  cache = { mtime, datos };
  return datos;
}
