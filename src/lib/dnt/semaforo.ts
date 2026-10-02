import type { Estado } from './types';

/** Semaforización del estado actual del paciente (hoja SEMÁFORO de la base DNT). */
export type ClaveSemaforo =
  | 'FALLECIDO'
  | 'SIN_TRATAMIENTO'
  | 'EN_TRATAMIENTO'
  | 'RECUPERADO'
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
    descripcion: 'En manejo terapéutico de la desnutrición de acuerdo al protocolo de la Res. 2350 de 2020. Incluye a los recuperados que siguen en riesgo de DNT (Z entre -2 y -1) y a los casos sin estado diligenciado, que continúan en seguimiento.',
  },
  RECUPERADO: {
    clave: 'RECUPERADO', etiqueta: 'Paciente recuperado', color: '#92D050', texto: '#173300',
    descripcion: 'Tras el tratamiento presenta puntaje Z mayor a -1 DE (peso adecuado para la talla) y cumple criterios de egreso.',
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
  'FALLECIDO', 'SIN_TRATAMIENTO', 'EN_TRATAMIENTO', 'RECUPERADO', 'DESCARTADO', 'REINCIDENTE',
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
      // Recuperado pero aún en riesgo de DNT (Z entre -2 y -1): sigue en seguimiento → amarillo
      return ultimoZ != null && ultimoZ >= -2 && ultimoZ < -1 ? SEMAFORO.EN_TRATAMIENTO : SEMAFORO.RECUPERADO;
    case 'DESCARTADO': return SEMAFORO.DESCARTADO;
    case 'RECAIDA': return SEMAFORO.REINCIDENTE;
    // Sin estado diligenciado: se considera en seguimiento (amarillo); la alerta de calidad del dato se mantiene
    default: return SEMAFORO.EN_TRATAMIENTO;
  }
}
