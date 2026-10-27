import { claveCompacta } from './catalogo';
import { etniaDe } from './filtros';
import type { Caso } from './types';

/**
 * Red de prestadores vigente (desde octubre de 2026): cinco prestadores con territorios definidos.
 * El IPS de la columna X del Excel se reemplaza por el prestador del territorio; las correcciones
 * manuales (Mover registro) tienen prioridad sobre esta regla.
 */
export const RED_PRESTADORES = ['DUSAKAWI IPS', 'WINTUKWA IPS', 'KANKUAMA IPSI', 'GRUPO IMB', 'FUNDACION SUMA'] as const;
export type PrestadorRed = (typeof RED_PRESTADORES)[number];

/** Nombre para mostrar de cada prestador. */
export const NOMBRE_PRESTADOR: Record<PrestadorRed, string> = {
  'DUSAKAWI IPS': 'Dusakawi IPSI',
  'WINTUKWA IPS': 'Wintukwa IPSI',
  'KANKUAMA IPSI': 'Kankuama IPSI',
  'GRUPO IMB': 'Grupo IMB',
  'FUNDACION SUMA': 'Fundación Suma',
};

// Municipio (clave compacta) → prestador
const POR_MUNICIPIO: Record<string, PrestadorRed> = {
  // Cesar
  AGUSTINCODAZZI: 'DUSAKAWI IPS',
  BECERRIL: 'DUSAKAWI IPS',
  CHIMICHAGUA: 'DUSAKAWI IPS',
  LAPAZ: 'DUSAKAWI IPS',
  PUEBLOBELLO: 'WINTUKWA IPS',
  // La Guajira
  SANJUANDELCESAR: 'DUSAKAWI IPS',
  DIBULLA: 'FUNDACION SUMA',
  URIBIA: 'GRUPO IMB',
  MANAURE: 'GRUPO IMB',
  RIOHACHA: 'GRUPO IMB',
  MAICAO: 'GRUPO IMB',
  ALBANIA: 'GRUPO IMB',
  FONSECA: 'GRUPO IMB',
  BARRANCAS: 'GRUPO IMB',
  HATONUEVO: 'GRUPO IMB',
  DISTRACCION: 'GRUPO IMB',
  // Magdalena
  CIENAGA: 'FUNDACION SUMA',
  ARACATACA: 'FUNDACION SUMA',
  SANTAMARTA: 'FUNDACION SUMA',
  SABANASDESANANGEL: 'FUNDACION SUMA',
  FUNDACION: 'FUNDACION SUMA',
};

// Municipios no listados: prestador por departamento
const POR_DEPARTAMENTO: Record<string, PrestadorRed> = {
  CESAR: 'DUSAKAWI IPS',
  LAGUAJIRA: 'GRUPO IMB',
  MAGDALENA: 'FUNDACION SUMA',
};

const VALLEDUPAR: PrestadorRed[] = ['WINTUKWA IPS', 'KANKUAMA IPSI', 'DUSAKAWI IPS'];

/** Prestador de la red que corresponde al niño según su territorio (y su pueblo, en Valledupar). */
export function prestadorDe(c: Pick<Caso, 'municipio' | 'departamento' | 'etnia' | 'ipsSeguimiento'>): string {
  const mpio = claveCompacta(c.municipio);
  if (mpio === 'VALLEDUPAR') {
    // Valledupar lo comparten tres IPSI: se conserva la que ya atiende al niño; si no, según el pueblo
    if ((VALLEDUPAR as string[]).includes(c.ipsSeguimiento)) return c.ipsSeguimiento;
    const pueblo = etniaDe(c);
    return pueblo === 'ARHUACO' ? 'WINTUKWA IPS' : pueblo === 'KANKUAMO' || pueblo === 'KOGUI' ? 'KANKUAMA IPSI' : 'DUSAKAWI IPS';
  }
  return POR_MUNICIPIO[mpio] ?? POR_DEPARTAMENTO[claveCompacta(c.departamento)] ?? c.ipsSeguimiento;
}
