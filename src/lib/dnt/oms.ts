import { WFH_BOYS_2_5, WFH_GIRLS_2_5, WFL_BOYS_0_2, WFL_GIRLS_0_2, type FilaLms } from './oms-tablas';

/**
 * Puntaje Z de peso para la longitud/talla con el método LMS de los Patrones de Crecimiento de la OMS
 * (el mismo de WHO Anthro): z = ((peso / M)^L − 1) / (S·L), con el ajuste OMS para |z| > 3.
 * Menores de 24 meses: peso para la LONGITUD (45–110 cm); de 24 a 59 meses: peso para la TALLA (65–120 cm).
 * Se asume que el niño se midió acostado antes de los 24 meses y de pie después (posición por defecto de Anthro).
 */
export type Sexo = 'F' | 'M';
export type TipoTabla = 'longitud' | 'talla';

export interface Tabla { filas: FilaLms[]; tipo: TipoTabla; min: number; max: number; titulo: string }

export function sexoOms(sexo: string): Sexo | null {
  const s = (sexo || '').trim().toUpperCase();
  return s.startsWith('F') ? 'F' : s.startsWith('M') ? 'M' : null;
}

export function tablaOms(sexo: Sexo, edadMeses: number): Tabla {
  const nino = sexo === 'M';
  return edadMeses < 24
    ? { filas: nino ? WFL_BOYS_0_2 : WFL_GIRLS_0_2, tipo: 'longitud', min: 45, max: 110, titulo: `Peso para la longitud ${nino ? 'niños' : 'niñas'} (0 a 2 años)` }
    : { filas: nino ? WFH_BOYS_2_5 : WFH_GIRLS_2_5, tipo: 'talla', min: 65, max: 120, titulo: `Peso para la talla ${nino ? 'niños' : 'niñas'} (2 a 5 años)` };
}

/** Parámetros L, M y S interpolados linealmente para la longitud/talla dada. */
export function lms(filas: FilaLms[], x: number): { L: number; M: number; S: number } | null {
  if (x < filas[0][0] || x > filas[filas.length - 1][0]) return null;
  let i = filas.findIndex(f => f[0] >= x);
  if (filas[i][0] === x) return { L: filas[i][1], M: filas[i][2], S: filas[i][3] };
  const [a, b] = [filas[i - 1], filas[i]];
  const t = (x - a[0]) / (b[0] - a[0]);
  return { L: a[1] + t * (b[1] - a[1]), M: a[2] + t * (b[2] - a[2]), S: a[3] + t * (b[3] - a[3]) };
}

/** Peso (kg) que corresponde a un puntaje Z para la longitud/talla dada (curvas de la gráfica). */
export function pesoParaZ(p: { L: number; M: number; S: number }, z: number): number {
  return p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L);
}

/** Edad en meses cumplidos entre la fecha de nacimiento y la fecha de la medición (ISO yyyy-mm-dd). */
export function edadMesesEn(nacimiento: string | null, fecha: string | null): number | null {
  if (!nacimiento || !fecha) return null;
  const dias = (new Date(`${fecha.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${nacimiento.slice(0, 10)}T12:00:00Z`).getTime()) / 864e5;
  return dias < 0 ? null : dias / 30.4375;
}

/** Puntaje Z peso/longitud-talla (2 decimales) o null si faltan datos o la medida está fuera de la tabla. */
export function zPesoTalla(d: { peso: number; talla: number; sexo: string; edadMeses: number | null }): number | null {
  const sexo = sexoOms(d.sexo);
  if (!sexo || d.edadMeses == null || !(d.peso > 0) || !(d.talla > 0) || d.edadMeses >= 60) return null;
  const p = lms(tablaOms(sexo, d.edadMeses).filas, d.talla);
  if (!p) return null;
  let z = (Math.pow(d.peso / p.M, p.L) - 1) / (p.S * p.L);
  // Ajuste OMS en los extremos: fuera de ±3 DE se usa la distancia entre 2 y 3 DE
  if (z > 3) {
    const sd3 = pesoParaZ(p, 3);
    z = 3 + (d.peso - sd3) / (sd3 - pesoParaZ(p, 2));
  } else if (z < -3) {
    const sd3 = pesoParaZ(p, -3);
    z = -3 + (d.peso - sd3) / (pesoParaZ(p, -2) - sd3);
  }
  return Math.round(z * 100) / 100;
}
