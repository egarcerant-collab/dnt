export type Severidad = 'SEVERA' | 'MODERADA' | 'SIN CLASIFICAR';

export type ClasificacionNutricional =
  | 'DNT AGUDA SEVERA KWASHIORKOR'
  | 'DNT AGUDA SEVERA MARASMO'
  | 'DNT AGUDA SEVERA MIXTA'
  | 'DNT AGUDA SEVERA'
  | 'DNT AGUDA MODERADA'
  | 'RIESGO DE DNT AGUDA'
  | 'PESO ADECUADO PARA LA TALLA'
  | 'SIN DATO';

export type Estado =
  | 'RECUPERADO'
  | 'EN PROCESO DE RECUPERACION'
  | 'FALLECIDO'
  | 'DESCARTADO'
  | 'DESERTADO'
  | 'BUSQUEDA FALLIDA'
  | 'RECAIDA'
  | 'SIN DILIGENCIAR';

export const ESTADOS: Estado[] = [
  'EN PROCESO DE RECUPERACION',
  'RECUPERADO',
  'RECAIDA',
  'FALLECIDO',
  'DESCARTADO',
  'DESERTADO',
  'BUSQUEDA FALLIDA',
];

export interface Control {
  numero: number;
  fecha: string | null; // ISO yyyy-mm-dd
  peso: number | null;
  talla: number | null;
  zPesoTalla: number | null;
  clasificacion: string;
  energia: string; // requerimiento de energía FTLC (kcal/kg/día)
  fechaEntregaFtlc: string | null;
  medicamento: string;
  recomendaciones: string;
  resultado: string;
  ips: string; // IPS que realiza el seguimiento
  observaciones: string;
  profesional: string; // profesional que presta la atención (extramural/intramural)
  origen: 'excel' | 'app';
  registradoPor?: string;
  registradoEn?: string;
}

export type TipoAlerta =
  | 'SIN_CONTROL_4_SEMANAS'
  | 'CONTROL_VENCIDO'
  | 'SIN_ESTADO'
  | 'POSIBLE_RECUPERADO'
  | 'FALLECIDO_SIN_AJUSTE_SIVIGILA'
  | 'NO_CRUZA_SIVIGILA';

export const ALERTAS: Record<TipoAlerta, { titulo: string; nivel: 'alta' | 'media' | 'baja'; accion: string }> = {
  SIN_CONTROL_4_SEMANAS: { titulo: 'Sin controles > 4 semanas', nivel: 'alta', accion: 'Búsqueda activa comunitaria' },
  CONTROL_VENCIDO: { titulo: 'Control vencido (> 14 días)', nivel: 'alta', accion: 'Programar control esta semana' },
  FALLECIDO_SIN_AJUSTE_SIVIGILA: { titulo: 'Fallecido sin ajuste SIVIGILA', nivel: 'alta', accion: 'Ajuste de condición final y unidad de análisis' },
  SIN_ESTADO: { titulo: 'Sin estado diligenciado', nivel: 'media', accion: 'Registrar estado actual' },
  POSIBLE_RECUPERADO: { titulo: 'Posible recuperado no marcado', nivel: 'baja', accion: 'Validar criterios de egreso' },
  NO_CRUZA_SIVIGILA: { titulo: 'No cruza con SIVIGILA', nivel: 'baja', accion: 'Verificar documento / notificación' },
};

export interface Caso {
  id: string;
  consecutivo: number | null;
  tipoDocumento: string;
  documento: string;
  nombre: string;
  sexo: string;
  fechaNacimiento: string | null;
  edadMeses: number | null;
  departamento: string;
  municipio: string;
  asentamiento: string;
  etnia: string;
  telefono: string;
  semanaEpi: number | null;
  fechaNotificacion: string | null;
  ipsInicial: string;
  ipsSeguimiento: string;
  severidad: Severidad;
  clasificacionNutricional: ClasificacionNutricional;
  clasificacionPorZ: boolean; // derivada del Z-score por falta de texto
  clasificacionIngreso: string;
  zIngreso: number | null;
  pesoIngreso: number | null;
  tallaIngreso: number | null;
  edema: string;
  perimetroBraquial: number | null;
  fechaEntregaFtlc: string | null;
  mipresFtlc: string;
  estado: Estado;
  fechaRecuperacion: string | null;
  ipsAtencionPrimaria: string; // columna AX
  controles: Control[];
  enSivigila: boolean;
  condicionFinalSivigila: string | null;
  alertas: TipoAlerta[];
}

/** Datos que diligencia el prestador para un control (un bloque de las columnas AY..KF). */
export interface NuevoControlInput {
  fecha: string;
  peso: number;
  talla: number;
  zPesoTalla: number;
  clasificacion: string;
  energia: string;
  fechaEntregaFtlc: string | null;
  medicamento: string;
  recomendaciones: string;
  resultado: string;
  ips: string;
  observaciones: string;
  profesional: string;
  estado?: Estado;
}

export const MAX_CONTROLES = 19;

/** Nombre de cada bloque de control tal como aparece en el libro de prestadores. */
export const NOMBRE_CONTROL = [
  'Primer seguimiento · semana 1 (día 3 severa / día 7 moderada)',
  'Control 2 · semana 2',
  'Control 3 · semana 3',
  'Control 4 · semana 4',
  'Control 5 · semana 5',
  'Control 6 · semana 6',
  'Control 7 · semana 7',
  'Control 8 · semana 8',
  'Control 9 · cada 30 días hasta egreso',
  ...Array.from({ length: 10 }, (_, i) => `Control ${i + 10} · mensual hasta egreso`),
];
