import type { Caso, TipoAlerta } from './types';

export interface Indicador {
  clave: string;
  nombre: string;
  valor: number | null; // porcentaje o días
  unidad: '%' | 'días' | 'casos';
  meta: string;
  cumple: boolean | null;
  detalle: string;
  /** Para los porcentajes: numerador, denominador y su definición (se muestran al pasar el mouse). */
  num?: number;
  den?: number;
  formula?: string;
}

const diasEntre = (a: string | null, b: string | null) =>
  a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5) : null;

const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function calcularIndicadores(casos: Caso[]): Indicador[] {
  const validos = casos.filter(c => c.estado !== 'DESCARTADO');
  const n = validos.length;
  const cuenta = (f: (c: Caso) => boolean) => validos.filter(f).length;

  const recuperados = cuenta(c => c.estado === 'RECUPERADO');
  const fallecidos = cuenta(c => c.estado === 'FALLECIDO');
  const perdidos = cuenta(c => c.estado === 'DESERTADO' || c.estado === 'BUSQUEDA FALLIDA');
  const sinEstado = cuenta(c => c.estado === 'SIN DILIGENCIAR');

  const oportunos = cuenta(c => {
    const d = diasEntre(c.fechaNotificacion, c.controles[0]?.fecha ?? null);
    const limite = c.severidad === 'SEVERA' ? 3 : 7;
    return d != null && d >= 0 && d <= limite;
  });

  const tRecup = validos
    .map(c => diasEntre(c.fechaNotificacion, c.fechaRecuperacion))
    .filter((d): d is number => d != null && d >= 0);
  const tMediana = mediana(tRecup);

  const completos = cuenta(
    c => c.estado !== 'SIN DILIGENCIAR' && !c.clasificacionPorZ && c.clasificacionNutricional !== 'SIN DATO' && c.perimetroBraquial != null && !!c.mipresFtlc,
  );

  const vRec = pct(recuperados, n);
  const vLet = pct(fallecidos, n);
  const vOp = pct(oportunos, n);
  const vPer = pct(perdidos, n);
  const vComp = pct(completos, n);
  const sinControl = cuenta(c => c.alertas.includes('SIN_CONTROL_4_SEMANAS'));

  return [
    { clave: 'recuperacion', nombre: 'Recuperación', valor: vRec, unidad: '%', meta: '≥ 75%', cumple: vRec == null ? null : vRec >= 75, detalle: `${recuperados} de ${n} casos`, num: recuperados, den: n, formula: 'Niños con estado RECUPERADO / niños de la base (sin descartados)' },
    { clave: 'letalidad', nombre: 'Letalidad', valor: vLet, unidad: '%', meta: '< 1%', cumple: vLet == null ? null : vLet < 1, detalle: `${fallecidos} fallecidos`, num: fallecidos, den: n, formula: 'Niños FALLECIDOS / niños de la base (sin descartados)' },
    { clave: 'oportunidad', nombre: 'Oportunidad 1er control', valor: vOp, unidad: '%', meta: '≥ 90%', cumple: vOp == null ? null : vOp >= 90, detalle: `${oportunos} de ${n} · día 3 severa, día 7 moderada`, num: oportunos, den: n, formula: 'Niños con 1er control a tiempo (≤3 días severa, ≤7 días moderada desde la notificación) / niños de la base (sin descartados)' },
    { clave: 'sinControl', nombre: 'Sin control > 4 semanas', valor: sinControl, unidad: 'casos', meta: '0', cumple: sinControl === 0, detalle: 'Requieren búsqueda activa' },
    { clave: 'sinEstado', nombre: 'Sin estado diligenciado', valor: sinEstado, unidad: 'casos', meta: '0', cumple: sinEstado === 0, detalle: `${pct(sinEstado, n)}% de la base` },
    { clave: 'tiempoRecuperacion', nombre: 'Días a recuperación (mediana)', valor: tMediana, unidad: 'días', meta: '≤ 60', cumple: tMediana == null ? null : tMediana <= 60, detalle: `${tRecup.length} casos con fecha` },
    { clave: 'perdidas', nombre: 'Deserción / búsqueda fallida', valor: vPer, unidad: '%', meta: '≤ 15%', cumple: vPer == null ? null : vPer <= 15, detalle: `${perdidos} casos`, num: perdidos, den: n, formula: 'Niños DESERTADOS o con BÚSQUEDA FALLIDA / niños de la base (sin descartados)' },
    { clave: 'completitud', nombre: 'Completitud crítica', valor: vComp, unidad: '%', meta: '≥ 95%', cumple: vComp == null ? null : vComp >= 95, detalle: `${completos} de ${n} · estado, clasificación, PB, MIPRES`, num: completos, den: n, formula: 'Niños con estado, clasificación nutricional, perímetro braquial y MIPRES diligenciados / niños de la base (sin descartados)' },
  ];
}

export function contarAlertas(casos: Caso[]): Record<TipoAlerta, number> {
  const r = {} as Record<TipoAlerta, number>;
  for (const c of casos) for (const a of c.alertas) r[a] = (r[a] ?? 0) + 1;
  return r;
}
