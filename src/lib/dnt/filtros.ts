import type { Caso, TipoAlerta } from './types';

export interface FiltrosCasos {
  depto?: string;
  municipio?: string;
  ips?: string;
  estado?: string;
  clasificacion?: string; // clasificación nutricional detallada
  alerta?: string;
  edad?: string;
}

export function grupoEdad(c: Caso): string {
  const m = c.edadMeses;
  if (m == null) return 'Sin dato';
  return m < 6 ? '< 6 meses' : m < 12 ? '6–11 meses' : m < 24 ? '12–23 meses' : '24–59 meses';
}

/** Filtro único usado por la vista EPSI y la exportación, para que ambas muestren lo mismo. */
export function filtrarCasos(casos: Caso[], f: FiltrosCasos): Caso[] {
  return casos.filter(
    c =>
      (!f.depto || c.departamento === f.depto) &&
      (!f.municipio || c.municipio === f.municipio) &&
      (!f.ips || c.ipsSeguimiento === f.ips) &&
      (!f.estado || c.estado === f.estado) &&
      (!f.clasificacion || c.clasificacionNutricional === f.clasificacion) &&
      (!f.alerta || c.alertas.includes(f.alerta as TipoAlerta)) &&
      (!f.edad || grupoEdad(c) === f.edad),
  );
}

export function aQueryString(f: FiltrosCasos): string {
  return new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
}
