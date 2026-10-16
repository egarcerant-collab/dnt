import { etniaDe, grupoEdad, semaforoCaso, sexoDe } from './filtros';
import type { Caso } from './types';

/**
 * Distribución poblacional de los casos (pueblo indígena, departamento, municipio, sexo, edad, clasificación).
 * Mismo cálculo para la vista de indicadores y los informes PDF, para que ambos den las mismas cifras.
 */
export interface FilaDistribucion {
  grupo: string;
  casos: number;
  pctTotal: number;
  activos: number;
  recuperados: number;
  /** Recuperación: recuperados / casos sin descartados. */
  recNum: number;
  recDen: number;
  recPct: number | null;
  severos: number;
  sinControl: number;
  sinEstado: number;
  fallecidos: number;
}

export type Dimension = 'etnia' | 'departamento' | 'municipio' | 'sexo' | 'edad' | 'clasificacion';

export const DIMENSIONES: Record<Dimension, { titulo: string; clave: (c: Caso) => string; filtro?: string }> = {
  etnia: { titulo: 'Pueblo indígena', clave: etniaDe, filtro: 'etnia' },
  departamento: { titulo: 'Departamento', clave: c => c.departamento || 'SIN DATO', filtro: 'depto' },
  municipio: { titulo: 'Municipio', clave: c => `${c.municipio || 'SIN DATO'} (${(c.departamento || '').replace('LA ', '')})` },
  sexo: { titulo: 'Sexo', clave: sexoDe, filtro: 'sexo' },
  edad: { titulo: 'Grupo de edad', clave: grupoEdad, filtro: 'edad' },
  clasificacion: { titulo: 'Clasificación nutricional', clave: c => c.clasificacionNutricional, filtro: 'clasificacion' },
};

const CERRADOS = ['RECUPERADO', 'FALLECIDO', 'DESCARTADO', 'DESERTADO'];
const ORDEN_EDAD = ['< 6 meses', '6–11 meses', '12–23 meses', '24–59 meses', 'Sin dato'];

export function distribucion(casos: Caso[], dim: Dimension): FilaDistribucion[] {
  const { clave } = DIMENSIONES[dim];
  const grupos = new Map<string, Caso[]>();
  casos.forEach(c => grupos.set(clave(c), [...(grupos.get(clave(c)) ?? []), c]));
  const filas = [...grupos.entries()].map(([grupo, cs]) => {
    const validos = cs.filter(c => c.estado !== 'DESCARTADO');
    const recuperados = validos.filter(c => c.estado === 'RECUPERADO').length;
    return {
      grupo,
      casos: cs.length,
      pctTotal: casos.length ? Math.round((cs.length / casos.length) * 1000) / 10 : 0,
      activos: cs.filter(c => !CERRADOS.includes(c.estado)).length,
      recuperados: cs.filter(c => c.estado === 'RECUPERADO').length,
      recNum: recuperados,
      recDen: validos.length,
      recPct: validos.length ? Math.round((recuperados / validos.length) * 1000) / 10 : null,
      severos: cs.filter(c => c.severidad === 'SEVERA').length,
      sinControl: cs.filter(c => c.alertas.includes('SIN_CONTROL_4_SEMANAS')).length,
      sinEstado: cs.filter(c => c.estado === 'SIN DILIGENCIAR').length,
      fallecidos: cs.filter(c => c.estado === 'FALLECIDO').length,
    };
  });
  return dim === 'edad'
    ? filas.sort((a, b) => ORDEN_EDAD.indexOf(a.grupo) - ORDEN_EDAD.indexOf(b.grupo))
    : filas.sort((a, b) => b.casos - a.casos);
}

/** Tabla cruzada (p. ej. pueblo × departamento): filas, columnas y conteo de casos. */
export function cruce(casos: Caso[], filas: Dimension, columnas: Dimension) {
  const kf = DIMENSIONES[filas].clave;
  const kc = DIMENSIONES[columnas].clave;
  const cols = [...new Set(casos.map(kc))].sort();
  const m = new Map<string, Map<string, number>>();
  casos.forEach(c => {
    const fila = m.get(kf(c)) ?? new Map<string, number>();
    fila.set(kc(c), (fila.get(kc(c)) ?? 0) + 1);
    m.set(kf(c), fila);
  });
  const rows = [...m.entries()]
    .map(([f, v]) => ({ grupo: f, valores: cols.map(c => v.get(c) ?? 0), total: [...v.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  return { columnas: cols, filas: rows, totales: cols.map((_, i) => rows.reduce((s, r) => s + r.valores[i], 0)) };
}

/** Semáforo por grupo (para gráficos apilados). */
export function semaforoPorGrupo(casos: Caso[], dim: Dimension) {
  const { clave } = DIMENSIONES[dim];
  const r = new Map<string, Record<string, number>>();
  casos.forEach(c => {
    const g = r.get(clave(c)) ?? {};
    const k = semaforoCaso(c).clave;
    g[k] = (g[k] ?? 0) + 1;
    r.set(clave(c), g);
  });
  return r;
}
