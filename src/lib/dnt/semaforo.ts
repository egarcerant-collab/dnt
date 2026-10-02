import type { Estado } from './types';

/** Semaforización del estado actual del paciente (hoja SEMÁFORO de la base DNT). */
export type ClaveSemaforo =
  | 'FALLECIDO'
  | 'SIN_TRATAMIENTO'
  | 'EN_TRATAMIENTO'
  | 'RECUPERADO'
  | 'RECUPERADO_RIESGO'
  | 'DESCARTADO'
  | 'REINCIDENTE'
  | 'SIN_DATO';

export interface Semaforo {
  clave: ClaveSemaforo;
  etiqueta: string;
  /** Color oficial de la tabla de semaforización. */
  color: string;
  /** Color de texto legible sobre el fondo. */
  texto: string;
  descripcion: string;
}

export const SEMAFORO: Record<ClaveSemaforo, Semaforo> = {
  FALLECIDO: {
    clave: 'FALLECIDO', etiqueta: 'Paciente fallecido', color: '#FF0000', texto: '#ffffff',
    descripcion: 'Niño o niña notificado al evento 113 que muere por causa de la desnutrición u otra patología asociada.',
  },
  SIN_TRATAMIENTO: {
    clave: 'SIN_TRATAMIENTO', etiqueta: 'Sin tratamiento', color: '#FFC000', texto: '#3b2a00',
    descripcion: 'Notificado al evento 113 que se encuentra sin tratamiento o manejo terapéutico por estar hospitalizado, en proceso de búsqueda o internado en alguna institución.',
  },
  EN_TRATAMIENTO: {
    clave: 'EN_TRATAMIENTO', etiqueta: 'Paciente en tratamiento', color: '#FFFF00', texto: '#3b3b00',
    descripcion: 'En manejo terapéutico de la desnutrición de acuerdo al protocolo de la Res. 2350 de 2020.',
  },
  RECUPERADO: {
    clave: 'RECUPERADO', etiqueta: 'Paciente recuperado', color: '#92D050', texto: '#173300',
    descripcion: 'Tras el tratamiento presenta puntaje Z mayor a -1 DE (peso adecuado para la talla) y cumple criterios de egreso.',
  },
  RECUPERADO_RIESGO: {
    clave: 'RECUPERADO_RIESGO', etiqueta: 'Recuperado en riesgo de DNT', color: '#7FE0B0', texto: '#0b3b25',
    descripcion: 'Tras el tratamiento presenta puntaje Z mayor a -2 DE (riesgo de desnutrición) y cumple criterios de egreso del manejo.',
  },
  DESCARTADO: {
    clave: 'DESCARTADO', etiqueta: 'Descartado', color: '#00B0F0', texto: '#ffffff',
    descripcion: 'Estudiada la causa, padece una patología de base que excluye la desnutrición de etiología primaria (hidrocefalia, parálisis cerebral, síndrome de Down, prematurez extrema, entre otras).',
  },
  REINCIDENTE: {
    clave: 'REINCIDENTE', etiqueta: 'Reincidente', color: '#F8CBAD', texto: '#4a2210',
    descripcion: 'Pasados 3 meses de haber sido recuperado (Res. 2350 de 2020) presenta nuevamente un cuadro de desnutrición aguda.',
  },
  SIN_DATO: {
    clave: 'SIN_DATO', etiqueta: 'Sin dato', color: '#E2E8F0', texto: '#334155',
    descripcion: 'El estado actual no ha sido diligenciado.',
  },
};

export const ORDEN_SEMAFORO: ClaveSemaforo[] = [
  'FALLECIDO', 'SIN_TRATAMIENTO', 'EN_TRATAMIENTO', 'RECUPERADO', 'RECUPERADO_RIESGO', 'DESCARTADO', 'REINCIDENTE', 'SIN_DATO',
];

/** Asigna el semáforo según el estado y, para recuperados, el último puntaje Z peso/talla. */
export function semaforoDe(estado: Estado | string, ultimoZ?: number | null): Semaforo {
  switch (estado) {
    case 'FALLECIDO': return SEMAFORO.FALLECIDO;
    case 'SIN TRATAMIENTO':
    case 'BUSQUEDA FALLIDA':
    case 'DESERTADO': return SEMAFORO.SIN_TRATAMIENTO;
    case 'EN PROCESO DE RECUPERACION': return SEMAFORO.EN_TRATAMIENTO;
    case 'RECUPERADO':
      return ultimoZ != null && ultimoZ >= -2 && ultimoZ < -1 ? SEMAFORO.RECUPERADO_RIESGO : SEMAFORO.RECUPERADO;
    case 'DESCARTADO': return SEMAFORO.DESCARTADO;
    case 'RECAIDA': return SEMAFORO.REINCIDENTE;
    default: return SEMAFORO.SIN_DATO;
  }
}
